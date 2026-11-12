// ─── CSV 事务导入 ───

import crypto from 'crypto'
import { abs, formatAmount, fromDate, parseAmount, ZERO_MINOR, CURRENT_RULE_VERSION, rulesFor, type Minor } from '../../../../../packages/domain/src/index.js'
import {
  type AccountCache,
  type ImportContext,
  type ImportSummaryCollector,
  type ParsedRow,
  type TransactionClient,
  buildSortCounters,
  compactCsvRaw,
  logger,
  recordRowSummary,
  recordSkippedRow,
  takeNextSort,
  readCsvRecords,
  TRANSACTION_CSV_HEADER,
} from './shared.js'
import * as transactionRepo from '../../db/repositories/transaction.repository.js'

// ─── CSV Header 映射 ───

type TransactionCsvField = typeof TRANSACTION_CSV_HEADER[number]

// ─── 同名分类的规范节点选择 ───
//
// 历史数据里存在同名多节点（例如 16 个同名「餐饮」根分类）。旧实现用
// `${type}:${name}` 做 Map 键，后写入的同名节点会覆盖前者——新子分类就被挂到
// 最后一个空壳根上。这里改成确定性选择，规则固定为：
//   1. 直接子节点更多者优先（真实在用的父分类通常有子分类）；
//   2. sort 更小者优先（越早创建越靠前）；
//   3. createdAt 更早者优先；
//   4. id 字典序兜底，保证任何输入下结果可复现。
// 绝不取“最后一个”或依赖数据库返回顺序。

interface CategoryLike {
  id: string
  name: string
  type: string
  parentId: string | null
  sort: number
  createdAt?: Date | string | null
}

function createdAtMs(value: Date | string | null | undefined): number {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function pickCanonicalCategory<T extends CategoryLike>(
  candidates: T[],
  childCount: Map<string, number>
): T {
  return [...candidates].sort((a, b) => {
    const childDiff = (childCount.get(b.id) ?? 0) - (childCount.get(a.id) ?? 0)
    if (childDiff !== 0) return childDiff
    const sortDiff = (a.sort ?? 0) - (b.sort ?? 0)
    if (sortDiff !== 0) return sortDiff
    const createdDiff = createdAtMs(a.createdAt) - createdAtMs(b.createdAt)
    if (createdDiff !== 0) return createdDiff
    return a.id.localeCompare(b.id)
  })[0]
}

/** 统计每个节点的直接子节点数，供规范节点选择使用。 */
function countChildren(nodes: ReadonlyArray<{ id: string; parentId: string | null }>): Map<string, number> {
  const childCount = new Map<string, number>()
  for (const node of nodes) {
    if (!node.parentId) continue
    childCount.set(node.parentId, (childCount.get(node.parentId) ?? 0) + 1)
  }
  return childCount
}

/**
 * 按自然键分组后选出每条键的规范节点。
 * 分组键对父子层分别使用 `${type}:${name}` 与 `${type}:${parentName}/${name}`。
 */
function indexCanonicalCategories<T extends CategoryLike>(
  nodes: T[]
): Map<string, T> {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const childCount = countChildren(nodes)
  const groups = new Map<string, T[]>()
  for (const node of nodes) {
    const parentName = node.parentId ? byId.get(node.parentId)?.name ?? '' : ''
    const key = node.parentId
      ? `${node.type}:${parentName}/${node.name}`
      : `${node.type}:${node.name}`
    const group = groups.get(key)
    if (group) group.push(node)
    else groups.set(key, [node])
  }

  const result = new Map<string, T>()
  for (const [key, group] of groups) {
    const canonical = pickCanonicalCategory(group, childCount)
    result.set(key, canonical)
    if (group.length > 1) {
      logger.warn(
        { key, count: group.length, chosenId: canonical.id, childCount: childCount.get(canonical.id) ?? 0 },
        'import: duplicate category name resolved by canonical rule'
      )
    }
  }
  return result
}

// ─── 默认分类（资产/负债兜底） ───

async function ensureDefaultCategory(
  client: TransactionClient,
  type: 'asset' | 'liability',
  name: string
): Promise<{ id: string }> {
  // 必须按 name + type 精确查：旧实现只看 type 取第一个，
  // 请求「资产」时会拿到第一个资产分类「现金」。
  let category = await client.accountCategory.findFirst({
    where: { name, type, parentId: null },
    orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  })
  if (!category) {
    // 明确回退规则：没有名为「资产/负债」的顶层分类时新建同名顶层分类，
    // 绝不借用同类型的其他分类。
    category = await client.accountCategory.create({
      data: { name, type, sort: 1 },
    })
  }
  return category
}

// ─── 构建导入上下文（一次性预加载） ───

async function buildImportContext(
  client: TransactionClient,
  summary?: ImportSummaryCollector
): Promise<ImportContext> {
  const [accounts, accountCategories, transactionCategories, investmentAssetClasses] =
    await Promise.all([
      client.account.findMany({
        include: { category: { select: { isInvestment: true } } },
        // 同名账户（如 16 个「钱包」）需要可复现的规范顺序；
        // 跨类型同名则通过 type 键分开，不再按名字合并。
        orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
      client.accountCategory.findMany(),
      client.transactionCategory.findMany(),
      client.investmentAssetClass.findMany(),
    ])

  // 账户分类缓存：同名多节点按规范规则取一条，避免后者覆盖前者。
  const accountCategoryCache = new Map<string, { id: string; isInvestment: boolean }>()
  for (const [key, canonical] of indexCanonicalCategories(accountCategories)) {
    accountCategoryCache.set(key, { id: canonical.id, isInvestment: canonical.isInvestment })
  }

  // 账户缓存：键为 `${type}:${name}`；同名资产/负债是两个账户。
  const accountCache = new Map<string, AccountCache>()
  const accountCandidates = new Map<string, AccountCache[]>()
  for (const a of accounts) {
    const entry: AccountCache = {
      id: a.id,
      name: a.name,
      type: a.type,
      categoryId: a.categoryId,
      isInvestment: a.category?.isInvestment ?? false,
    }
    const typedKey = `${a.type}:${a.name}`
    if (!accountCache.has(typedKey)) accountCache.set(typedKey, entry)
    const sameName = accountCandidates.get(a.name)
    if (sameName) sameName.push(entry)
    else accountCandidates.set(a.name, [entry])
  }

  // 交易分类缓存：按规范节点生成 `${type}:${name}` 与 `${type}:${parent}/${child}`。
  const transactionCategoryCache = new Map<string, string>()
  for (const [key, canonical] of indexCanonicalCategories(transactionCategories)) {
    transactionCategoryCache.set(key, canonical.id)
  }

  // 投资资产类别缓存：按 `${accountId}:${name}` 索引
  const investmentAssetClassCache = new Map<string, string>()
  for (const ac of investmentAssetClasses) {
    investmentAssetClassCache.set(`${ac.accountId}:${ac.name}`, ac.id)
  }

  // 默认资产/负债分类保证存在
  const [defaultAssetCategory, defaultLiabilityCategory] = await Promise.all([
    ensureDefaultCategory(client, 'asset', '资产'),
    ensureDefaultCategory(client, 'liability', '负债'),
  ])

  // 内存 sort 计数器：由 shared 统一构建
  const sortCounters = await buildSortCounters(client)

  return {
    defaultAssetCategory,
    defaultLiabilityCategory,
    accountCache,
    accountCandidates,
    accountCategoryCache,
    transactionCategoryCache,
    investmentAssetClassCache,
    sortCounters,
    summary,
  }
}

// ─── 转账子分类（缓存版，不再查 SQL） ───

async function getOrCreateTransferSubCategory(
  name: string,
  ctx: ImportContext,
  client: TransactionClient
): Promise<string> {
  const cacheKey = `transfer:${name}`
  const cached = ctx.transactionCategoryCache.get(cacheKey)
  if (cached) return cached

  let category = await client.transactionCategory.findFirst({
    where: { name, type: 'transfer', parentId: null },
  })
  if (!category) {
    const sort = takeNextSort(ctx.sortCounters, 'transactionCategory', 'transfer:root')
    category = await client.transactionCategory.create({
      data: { name, type: 'transfer', sort },
    })
  }
  ctx.transactionCategoryCache.set(cacheKey, category.id)
  return category.id
}

// ─── classifyTransfer（完全去掉 SQL） ───

async function classifyTransfer(
  fromAccount: AccountCache | null,
  toAccount: AccountCache | null,
  ctx: ImportContext,
  client: TransactionClient
): Promise<string> {
  if (toAccount?.type === 'liability') {
    return getOrCreateTransferSubCategory('还款', ctx, client)
  }
  if (fromAccount?.type === 'liability') {
    return getOrCreateTransferSubCategory('借款', ctx, client)
  }
  if (toAccount?.isInvestment) {
    return getOrCreateTransferSubCategory('买入', ctx, client)
  }
  if (fromAccount?.isInvestment) {
    return getOrCreateTransferSubCategory('卖出', ctx, client)
  }
  return getOrCreateTransferSubCategory('转账', ctx, client)
}

// ─── 普通交易分类（缓存版） ───

async function getOrCreateCategory(
  category1: string,
  category2: string | undefined,
  categoryType: 'income' | 'expense' | 'transfer',
  ctx: ImportContext,
  client: TransactionClient
): Promise<string | null> {
  // 防御：category1 与 category2 都为空时，跳过建分类（视作未分类）
  // 避免创建空名称分类导致空"其他"/"" 出现
  const c1 = (category1 ?? '').trim()
  const c2 = (category2 ?? '').trim()
  if (!c1 && !c2) {
    return null
  }

  // 父/子关系判定：
  // - c1 与 c2 都有值时：c1 是父、c2 是子
  // - 只有 c1 有值：c1 是顶层分类（无父）
  // - 只有 c2 有值：c2 视作顶层分类（避免创建空名父分类）
  const effectiveParent = c1 && c2 ? c1 : null
  const effectiveChild = c2 || c1

  const cacheKey = effectiveParent
    ? `${categoryType}:${effectiveParent}/${effectiveChild}`
    : `${categoryType}:${effectiveChild}`

  const cached = ctx.transactionCategoryCache.get(cacheKey)
  if (cached) return cached

  // 防御性 fallback：当 category2 为空时（旧版导出数据），
  // cacheKey 为 `${type}:childName`，但缓存中可能只有 `${type}:parent/childName`。
  // 遍历缓存查找同名子分类，避免重复创建顶级分类。
  if (!effectiveParent) {
    const suffix = `/${effectiveChild}`
    for (const [k, v] of ctx.transactionCategoryCache) {
      if (k.startsWith(`${categoryType}:`) && k.endsWith(suffix) && k !== cacheKey) {
        return v
      }
    }
  }

  let parentId: string | null = null
  if (effectiveParent) {
    const parentCacheKey = `${categoryType}:${effectiveParent}`
    const cachedParent = ctx.transactionCategoryCache.get(parentCacheKey)
    if (cachedParent) {
      parentId = cachedParent
    } else {
      let parentCategory = await client.transactionCategory.findFirst({
        where: { name: effectiveParent, parentId: null, type: categoryType },
      })
      if (!parentCategory) {
        const sort = takeNextSort(ctx.sortCounters, 'transactionCategory', `${categoryType}:root`)
        parentCategory = await client.transactionCategory.create({
          data: { name: effectiveParent, type: categoryType, sort },
        })
        ctx.summary?.unknownCategories.add(effectiveParent)
      }
      parentId = parentCategory.id
      ctx.transactionCategoryCache.set(parentCacheKey, parentId)
    }
  }

  let category = await client.transactionCategory.findFirst({
    where: { name: effectiveChild, parentId, type: categoryType },
  })
  if (!category) {
    const sortGroupKey = `${categoryType}:${parentId ?? 'root'}`
    const sort = takeNextSort(ctx.sortCounters, 'transactionCategory', sortGroupKey)
    category = await client.transactionCategory.create({
      data: {
        name: effectiveChild,
        type: categoryType,
        parentId,
        sort,
      },
    })
    ctx.summary?.unknownCategories.add(
      effectiveParent ? `${effectiveParent}/${effectiveChild}` : effectiveChild
    )
  }
  ctx.transactionCategoryCache.set(cacheKey, category.id)
  return category.id
}

// ─── 退款行分类缓存查找 ───

function findCategoryFromCache(
  category1: string,
  category2: string,
  cache: Map<string, string>
): string | null {
  const key = category2 ? `${category1}/${category2}` : category1
  for (const t of ['expense', 'income'] as const) {
    const id = cache.get(`${t}:${key}`)
    if (id) return id
  }
  for (const t of ['expense', 'income'] as const) {
    const id = cache.get(`${t}:${category1}`)
    if (id) return id
  }
  return null
}

// ─── 账户查找/创建（按 type 精确查询，同名跨类型不合并） ───

function registerAccount(ctx: ImportContext, account: AccountCache): void {
  ctx.accountCache.set(`${account.type}:${account.name}`, account)
  const sameName = ctx.accountCandidates.get(account.name)
  if (sameName) {
    if (!sameName.some((item) => item.id === account.id)) sameName.push(account)
  } else {
    ctx.accountCandidates.set(account.name, [account])
  }
}

async function ensureAccountType(
  account: AccountCache,
  forceType: 'asset' | 'liability',
  ctx: ImportContext,
  client: TransactionClient
): Promise<void> {
  const categoryId =
    forceType === 'liability'
      ? ctx.defaultLiabilityCategory.id
      : ctx.defaultAssetCategory.id
  // 任务 E：用 client 替代 prisma，让外层 $transaction 生效
  await client.account.update({
    where: { id: account.id },
    data: {
      type: forceType,
      categoryId,
    },
  })
  // 类型变了，缓存键也要从 `${旧类型}:${name}` 迁到 `${新类型}:${name}`
  ctx.accountCache.delete(`${account.type}:${account.name}`)
  account.type = forceType
  account.categoryId = categoryId
  ctx.accountCache.set(`${forceType}:${account.name}`, account)
}

async function absorbDbAccount(
  dbAccount: {
    id: string
    name: string
    type: string
    categoryId: string | null
  },
  ctx: ImportContext,
  client: TransactionClient
): Promise<AccountCache> {
  // 旧数据可能没挂分类：导入时顺手补默认分类，避免静默留 null
  const categoryId =
    dbAccount.categoryId ??
    (dbAccount.type === 'liability'
      ? ctx.defaultLiabilityCategory.id
      : ctx.defaultAssetCategory.id)
  if (!dbAccount.categoryId) {
    await client.account.update({
      where: { id: dbAccount.id },
      data: { categoryId },
    })
  }
  const account: AccountCache = {
    id: dbAccount.id,
    name: dbAccount.name,
    type: dbAccount.type,
    categoryId,
    isInvestment: ctx.accountCategoryCache.get(`asset:${dbAccount.type}`)?.isInvestment ?? false,
  }
  registerAccount(ctx, account)
  return account
}

async function createAccount(
  name: string,
  type: 'asset' | 'liability',
  ctx: ImportContext,
  client: TransactionClient
): Promise<AccountCache> {
  const categoryId =
    type === 'liability'
      ? ctx.defaultLiabilityCategory.id
      : ctx.defaultAssetCategory.id
  const sort = takeNextSort(ctx.sortCounters, 'account', categoryId)
  const created = await client.account.create({
    data: {
      name,
      type,
      initialBalance: 0,
      categoryId,
      sort,
    },
  })
  ctx.summary?.unknownAccounts.add(name)
  const account: AccountCache = {
    id: created.id,
    name,
    type: created.type,
    categoryId: created.categoryId,
    isInvestment: false,
  }
  registerAccount(ctx, account)
  return account
}

const ACCOUNT_LOOKUP_ORDER = [{ sort: 'asc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }]

async function getOrCreateAccount(
  accountName: string,
  ctx: ImportContext,
  client: TransactionClient,
  forceType?: 'asset' | 'liability'
): Promise<AccountCache> {
  const name = accountName.trim()
  if (!name) throw new Error('账户名称为空，无法确定归属')

  if (forceType) {
    // 先按 (name, type) 精确命中：同名资产/负债是两个账户，不能串。
    const typed = ctx.accountCache.get(`${forceType}:${name}`)
    if (typed) return typed

    const dbTyped = await client.account.findFirst({
      where: { name, type: forceType },
      orderBy: ACCOUNT_LOOKUP_ORDER,
    })
    if (dbTyped && dbTyped.type === forceType) {
      return absorbDbAccount(dbTyped, ctx, client)
    }

    // 精确类型不存在时，只有在“同名账户总共只有一个”的情况下才沿用
    // 既有类型纠偏（同一张信用卡先被默认建成资产，后面还款行纠正为负债）。
    // 同名账户已经有多条时不再猜，交由跳过行清单提示用户清理。
    const sameName = ctx.accountCandidates.get(name) ?? []
    if (sameName.length > 1) {
      throw new Error(
        `账户「${name}」存在 ${sameName.length} 个同名账户，且没有可精确匹配的${forceType === 'liability' ? '负债' : '资产'}账户；请先在设置页清理或改名后重试`
      )
    }
    if (sameName.length === 1) {
      const account = sameName[0]
      if (account.type !== forceType) {
        await ensureAccountType(account, forceType, ctx, client)
      }
      return account
    }

    const dbOther = dbTyped ?? await client.account.findFirst({
      where: { name },
      orderBy: ACCOUNT_LOOKUP_ORDER,
    })
    if (dbOther) {
      const account = await absorbDbAccount(dbOther, ctx, client)
      if (account.type !== forceType) {
        await ensureAccountType(account, forceType, ctx, client)
      }
      return account
    }
    return createAccount(name, forceType, ctx, client)
  }

  // 行内没有类型信息：只看已缓存的同名账户；跨类型同名视为歧义，不替用户猜。
  const asset = ctx.accountCache.get(`asset:${name}`)
  const liability = ctx.accountCache.get(`liability:${name}`)
  if (asset && liability) {
    throw new Error(
      `账户「${name}」同时存在资产与负债两个同名账户，当前行未提供类型，无法确定归属；请先在设置页改名区分`
    )
  }
  if (asset) return asset
  if (liability) return liability

  // 缓存未命中：查 DB（仍按规范顺序取第一条，保证结果可复现）
  const dbAccount = await client.account.findFirst({
    where: { name },
    orderBy: ACCOUNT_LOOKUP_ORDER,
  })
  if (dbAccount) return absorbDbAccount(dbAccount, ctx, client)

  // 默认按资产账户新建（与旧行为一致）
  return createAccount(name, 'asset', ctx, client)
}

// ─── 基础字段解析 ───

interface ParsedRowBasics {
  date: Date
  amount: Minor
  type: 'income' | 'expense' | 'transfer' | 'adjustment'
}

/** 解析口径版本：旧 CSV 无此列时按当前版本；未登记的版本让该行被跳过。 */
function parseRuleVersion(value: string): number {
  if (!value) return CURRENT_RULE_VERSION
  const version = Number(value)
  if (!Number.isInteger(version)) throw new Error(`无效口径版本: ${value}`)
  rulesFor(version) // 未知版本直接抛错，由调用方按无效行跳过
  return version
}

/**
 * CSV 金额边界归一：外部账本可能带浮点尾差（如 9.969999999999999），
 * 超过两位小数时四舍五入到分；其余情况仍走 parseAmount 的严格校验。
 * 只做数值归一，不放宽金额合法性（非数字、空值照旧拒绝）。
 *
 * 浮点尾差用「整数分 + 字符串截取」算法四舍五入，绝不走 Number(raw) * 100——
 * 否则 8.115 * 100 会变成 811.4999… 而差 1 分。所有分支最终都收口到 parseAmount。
 */
function parseCsvMoney(value: string, onAutoFix?: () => void): Minor {
  const raw = value.trim()
  const match = /^(-?\d+)(?:\.(\d+))?$/.exec(raw)
  if (match && (match[2]?.length ?? 0) > 2) {
    onAutoFix?.()
    return parseAmount(roundCentsToTwo(raw))
  }
  return parseAmount(raw)
}

/** 把「超过两位小数的金额字符串」按分四舍五入到 2 位小数，返回 2 位小数的元字符串；全程字符串运算，不触发浮点误差。 */
function roundCentsToTwo(raw: string): string {
  const negative = raw.startsWith('-')
  const unsigned = negative ? raw.slice(1) : raw
  const [intPart, fracPart = ''] = unsigned.split('.')
  const frac3 = (fracPart + '000').slice(0, 3)
  const centsFromFrac = Math.round(Number(frac3) / 10)
  const cents = Number(intPart) * 100 + centsFromFrac
  const yuanInt = Math.floor(cents / 100)
  const yuanFrac = cents % 100
  return `${negative ? '-' : ''}${yuanInt}.${String(yuanFrac).padStart(2, '0')}`
}

function parseRowBasicFields(row: ParsedRow): ParsedRowBasics {
  const date = new Date(row.time)
  if (isNaN(date.getTime())) throw new Error(`时间无法解析: ${row.time || '(空)'}`)

  const amount = parseCsvMoney(row.amountStr)
  let type: 'income' | 'expense' | 'transfer' | 'adjustment'
  if (row.typeStr === '收入') {
    type = 'income'
  } else if (row.typeStr === '转账' || row.typeStr === '还款') {
    type = 'transfer'
  } else if (row.typeStr === '调整') {
    type = 'adjustment'
  } else {
    type = 'expense'
  }

  return { date, amount, type }
}

interface NormalTransactionData {
  id: string
  importKey: string
  date: Date
  type: 'income' | 'expense' | 'transfer' | 'adjustment'
  ruleVersion: number
  amount: Minor
  fee: Minor
  coupon: Minor
  note: string | null
  accountId: string
  toAccountId: string | null
  categoryId: string | null
  csvId: string
  excludeFromIncomeExpense: boolean
}

interface RefundTransactionData {
  id: string
  importKey: string
  date: Date
  type: 'refund'
  ruleVersion: number
  amount: Minor
  fee: Minor
  coupon: Minor
  note: string | null
  accountId: string
  categoryId: string | null
  relatedTransactionId: string | null
  relatedType: 'income' | 'expense' | null
  csvId: string
  excludeFromIncomeExpense: boolean
}

/** 稳定导入键：优先使用 CSV 源 ID；没有源 ID 时退回业务指纹。 */
function makeImportKey(csvId: string, naturalParts: Array<string | number | null | undefined>): string {
  const sourceId = csvId.trim()
  if (sourceId) return `csv:${sourceId}`
  return `natural:${naturalParts.map((part) => part ?? '').join('|')}`
}

/** 查询本批次中已经存在的导入键，用于跳过重复导入（含软删除行：importKey 唯一约束仍被占用）。 */
async function findExistingImportKeys(
  client: TransactionClient,
  keys: string[],
): Promise<Array<{ id: string; importKey: string | null }>> {
  return transactionRepo.findByImportKeys(keys, client)
}

// ─── CSV 解析（Header 映射） ───

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parsedRowRaw(row: ParsedRow): Record<string, string> {
  return compactCsvRaw({
    ID: row.csvId,
    时间: row.time,
    分类: row.category1,
    二级分类: row.category2,
    类型: row.typeStr,
    金额: row.amountStr,
    账户1: row.account1,
    账户2: row.account2,
    备注: row.note,
  })
}

function parseCsvFile(
  buffer: Buffer,
  summary?: ImportSummaryCollector
): { rows: ParsedRow[]; skipped: number } {
  const records = readCsvRecords<TransactionCsvField>(buffer, TRANSACTION_CSV_HEADER)
  const rows: ParsedRow[] = []
  let skipped = 0

  records.forEach((record, index) => {
    // 表头占第 1 行，数据行从第 2 行开始计数。
    const rowNumber = index + 2
    let autoFixed = false
    try {
      const feeStr = record['手续费']
      const couponStr = record['优惠券']
      const onAutoFix = () => { autoFixed = true }

      const row: ParsedRow = {
        rowNumber,
        csvId: record.ID,
        time: record.时间,
        category1: record.分类,
        category2: record.二级分类,
        typeStr: record.类型,
        amountStr: record.金额,
        account1: record.账户1,
        account2: record.账户2,
        note: record.备注,
        fee: feeStr ? parseCsvMoney(feeStr, onAutoFix) : ZERO_MINOR,
        // 优惠券只是「省了多少」的展示信息（元），不参与任何收支/预算/报表合计。
        coupon: couponStr ? parseCsvMoney(couponStr, onAutoFix) : ZERO_MINOR,
        relatedCsvId: record.关联账单,
        // 账单标记列值为「不计收支」（容错首尾空格）
        excludeFromIncomeExpense: (record['账单标记'] || '').trim() === '不计收支',
        ruleVersion: parseRuleVersion(record['口径版本']),
      }

      rows.push(row)
      if (autoFixed && summary) summary.autoFixedRows++
    } catch (error) {
      // 绝不静默丢行：行号 + 原因 + 核心原值全部进入摘要。
      skipped++
      recordSkippedRow(summary, rowNumber, errorMessage(error), compactCsvRaw(record))
    }
  })

  return { rows, skipped }
}

// ─── 主入口：批量 createMany ───

/**
 * 金额符号口径：
 * - `normalize`（默认，用户 CSV 导入）：非 adjustment 一律取正，兼容钱迹等外部账本；
 * - `preserve`（系统备份还原）：逐字段保真，负数金额原样落库，禁止改写。
 */
export type AmountSignPolicy = 'normalize' | 'preserve'

export interface TransactionImportOptions {
  amountSign?: AmountSignPolicy
}

async function importTransactionsFromRows(
  rows: ParsedRow[],
  tx: TransactionClient,
  summary?: ImportSummaryCollector,
  options: TransactionImportOptions = {}
): Promise<{ imported: number; skipped: number }> {
  const preserveAmountSign = options.amountSign === 'preserve'
  const client = tx
  const ctx = await buildImportContext(client, summary)
  let imported = 0
  let skipped = 0

  // Step 1: 分离普通行与退款行，校验普通行基础字段
  const normalRows: ParsedRow[] = []
  const refundRows: ParsedRow[] = []
  for (const row of rows) {
    if (row.typeStr === '退款' || row.typeStr === '报销记录') {
      refundRows.push(row)
    } else {
      normalRows.push(row)
    }
  }

  // Step 2: 解析普通行：解析账户 + 分类，构建批量数据
  const normalData: NormalTransactionData[] = []
  const csvIdToUuid = new Map<string, string>() // CSV ID → 预生成的 UUID

  for (const row of normalRows) {
    try {
      const basics = parseRowBasicFields(row)
      recordRowSummary(summary, basics.date, basics.amount)
      const fromAccount = await getOrCreateAccount(row.account1, ctx, client)
      const toAccount =
        basics.type === 'transfer' && row.account2
          ? await getOrCreateAccount(
              row.account2,
              ctx,
              client,
              row.typeStr === '还款' ? 'liability' : undefined
            )
          : null
      const categoryId = basics.type === 'transfer'
        ? await classifyTransfer(fromAccount, toAccount, ctx, client)
        : basics.type === 'adjustment'
          ? null
          : await getOrCreateCategory(row.category1, row.category2, basics.type, ctx, client)
      const id = crypto.randomUUID()
      // 调整（期初余额）的 amount 有方向，不能用绝对值；
      // 备份还原逐字段保真，其余（用户 CSV）收入/支出/转账仍按正数保存。
      const amount =
        basics.type === 'adjustment' || preserveAmountSign
          ? basics.amount
          : abs(basics.amount)
      const importKey = makeImportKey(row.csvId, [
        fromDate(basics.date),
        basics.type,
        formatAmount(amount),
        fromAccount.id,
        toAccount?.id ?? '',
        categoryId ?? '',
        row.note ?? '',
      ])
      csvIdToUuid.set(row.csvId, id)
      normalData.push({
        id,
        importKey,
        date: basics.date,
        type: basics.type,
        ruleVersion: row.ruleVersion,
        amount,
        fee: row.fee,
        coupon: row.coupon,
        note: row.note || null,
        accountId: fromAccount.id,
        toAccountId: toAccount?.id || null,
        categoryId,
        csvId: row.csvId,
        excludeFromIncomeExpense: row.excludeFromIncomeExpense ?? false,
      })
      imported++
    } catch (error) {
      skipped++
      recordSkippedRow(summary, row.rowNumber, errorMessage(error), parsedRowRaw(row))
    }
  }

  // Step 3: 跳过已导入的普通交易，再批量插入
  const existingNormal = await findExistingImportKeys(client, normalData.map((row) => row.importKey))
  const knownNormalKeys = new Map(
    existingNormal
      .filter((row): row is { id: string; importKey: string } => row.importKey !== null)
      .map((row) => [row.importKey, row.id]),
  )
  const normalToInsert = normalData.filter((row) => {
    const existingId = knownNormalKeys.get(row.importKey)
    if (existingId) {
      csvIdToUuid.set(row.csvId, existingId)
      imported--
      skipped++
      if (summary) summary.duplicates++
      return false
    }
    // 同一文件内的重复行也只保留一条
    knownNormalKeys.set(row.importKey, row.id)
    return true
  })

  if (normalToInsert.length > 0) {
    await transactionRepo.createMany(
      normalToInsert.map(({ csvId: _csvId, ...data }) => ({
        ...data,
        amount: BigInt(data.amount),
        fee: BigInt(data.fee),
        coupon: BigInt(data.coupon),
      })),
      client,
    )
  }

  // Step 4: 解析退款行（账户 + 分类 + 关联类型）
  const refundData: RefundTransactionData[] = []
  for (const row of refundRows) {
    try {
      const date = new Date(row.time)
      if (isNaN(date.getTime())) throw new Error(`时间无法解析: ${row.time || '(空)'}`)
      const amount = parseCsvMoney(row.amountStr, () => {
        if (summary) summary.autoFixedRows++
      })
      recordRowSummary(summary, date, amount)

      // 通过预生成 UUID 关联普通交易类型
      const relatedUuid = row.relatedCsvId ? csvIdToUuid.get(row.relatedCsvId) : null
      let relatedType: 'income' | 'expense' | null = null
      // 退款继承原交易的「不计收支」标记；找不到原交易时回退到该行自身解析值
      let excludeFromIncomeExpense = row.excludeFromIncomeExpense ?? false
      if (relatedUuid) {
        const normalEntry = normalData.find(d => d.id === relatedUuid)
        if (normalEntry) {
          relatedType = normalEntry.type as 'income' | 'expense'
          excludeFromIncomeExpense = normalEntry.excludeFromIncomeExpense
        }
      }

      // 兜底：从分类缓存推断（同原来逻辑）
      if (!relatedType) {
        const cacheKey = row.category2 ? `${row.category1}/${row.category2}` : row.category1
        for (const possibleType of ['expense', 'income'] as const) {
          if (ctx.transactionCategoryCache.get(`${possibleType}:${cacheKey}`)) {
            relatedType = possibleType; break
          }
        }
        if (!relatedType) {
          for (const possibleType of ['expense', 'income'] as const) {
            if (ctx.transactionCategoryCache.get(`${possibleType}:${row.category1}`)) {
              relatedType = possibleType; break
            }
          }
        }
      }

      const categoryId = findCategoryFromCache(row.category1, row.category2, ctx.transactionCategoryCache)

      const accountData = await getOrCreateAccount(row.account1, ctx, client)
      const id = crypto.randomUUID()
      const refundAmount = preserveAmountSign ? amount : abs(amount)
      const importKey = makeImportKey(row.csvId, [
        fromDate(date),
        'refund',
        formatAmount(refundAmount),
        accountData.id,
        categoryId ?? '',
        row.note ?? '',
      ])
      csvIdToUuid.set(row.csvId, id)
      refundData.push({
        id,
        importKey,
        date,
        type: 'refund',
        ruleVersion: row.ruleVersion,
        amount: refundAmount,
        fee: row.fee,
        coupon: row.coupon,
        note: row.note || null,
        accountId: accountData.id,
        categoryId,
        relatedTransactionId: relatedUuid || null,
        relatedType,
        csvId: row.csvId,
        excludeFromIncomeExpense,
      })
      imported++
    } catch (error) {
      skipped++
      recordSkippedRow(summary, row.rowNumber, errorMessage(error), parsedRowRaw(row))
    }
  }

  // Step 5: 跳过已导入的退款交易，再批量插入
  const existingRefunds = await findExistingImportKeys(client, refundData.map((row) => row.importKey))
  const knownRefundKeys = new Map(
    existingRefunds
      .filter((row): row is { id: string; importKey: string } => row.importKey !== null)
      .map((row) => [row.importKey, row.id]),
  )
  const refundToInsert = refundData.filter((row) => {
    const existingId = knownRefundKeys.get(row.importKey)
    if (existingId) {
      csvIdToUuid.set(row.csvId, existingId)
      imported--
      skipped++
      if (summary) summary.duplicates++
      return false
    }
    knownRefundKeys.set(row.importKey, row.id)
    return true
  })

  if (refundToInsert.length > 0) {
    await transactionRepo.createMany(
      refundToInsert.map(({ csvId: _csvId, ...data }) => ({
        ...data,
        amount: BigInt(data.amount),
        fee: BigInt(data.fee),
        coupon: BigInt(data.coupon),
      })),
      client,
    )
  }

  return { imported, skipped }
}

export async function importTransactionsFromCsv(
  buffer: Buffer,
  tx: TransactionClient,
  summary?: ImportSummaryCollector,
  options: TransactionImportOptions = {}
): Promise<{ imported: number; skipped: number }> {
  const parsed = parseCsvFile(buffer, summary)
  const result = await importTransactionsFromRows(parsed.rows, tx, summary, options)
  // 解析阶段被跳过的行也要计入「将跳过」，不能只统计入库阶段的跳过。
  return { imported: result.imported, skipped: result.skipped + parsed.skipped }
}
