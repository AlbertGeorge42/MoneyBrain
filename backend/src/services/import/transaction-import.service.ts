// ─── CSV 事务导入 ───

import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../../index.js'
import {
  type AccountCache,
  type ImportContext,
  type ParsedRow,
  type TransactionClient,
  buildSortCounters,
  takeNextSort,
  readCsvRecords,
} from './shared.js'

// ─── CSV Header 映射 ───

const TRANSACTION_CSV_HEADER = [
  'ID', '时间', '分类', '二级分类', '类型', '金额', '币种',
  '账户1', '账户2', '备注', '已报销', '手续费', '优惠券',
  '记账者', '账单标记', '标签', '账单图片', '关联账单',
] as const

type TransactionCsvField = typeof TRANSACTION_CSV_HEADER[number]

// ─── 默认分类（资产/负债兜底） ───

async function ensureDefaultCategory(
  client: TransactionClient,
  type: 'asset' | 'liability',
  name: string,
  icon: string
): Promise<{ id: string }> {
  let category = await client.accountCategory.findFirst({
    where: { type, parentId: null },
  })
  if (!category) {
    category = await client.accountCategory.create({
      data: { name, type, icon, sort: 1 },
    })
  }
  return category
}

// ─── 构建导入上下文（一次性预加载） ───

async function buildImportContext(client: TransactionClient): Promise<ImportContext> {
  const [accounts, accountCategories, transactionCategories, investmentAssetClasses] =
    await Promise.all([
      client.account.findMany({
        include: { category: { select: { isInvestment: true } } },
      }),
      client.accountCategory.findMany(),
      client.transactionCategory.findMany(),
      client.investmentAssetClass.findMany(),
    ])

  // 账户分类缓存：按 `${type}:${name}` 索引
  const accountCategoryCache = new Map<string, { id: string; isInvestment: boolean }>()
  for (const c of accountCategories) {
    accountCategoryCache.set(`${c.type}:${c.name}`, { id: c.id, isInvestment: c.isInvestment })
  }

  // 账户缓存：按 name 索引，包含 isInvestment（来自关联的 category）
  const accountCache = new Map<string, AccountCache>()
  for (const a of accounts) {
    accountCache.set(a.name, {
      id: a.id,
      type: a.type,
      categoryId: a.categoryId,
      isInvestment: a.category?.isInvestment ?? false,
    })
  }

  // 交易分类缓存：按 `${type}:${name}` 索引（含子分类 `${type}:${parent}/${child}`）
  const transactionCategoryCache = new Map<string, string>()
  for (const c of transactionCategories) {
    const key = c.parentId
      ? `${c.type}:${transactionCategories.find(tc => tc.id === c.parentId)?.name ?? ''}/${c.name}`
      : `${c.type}:${c.name}`
    transactionCategoryCache.set(key, c.id)
  }

  // 投资资产类别缓存：按 `${accountId}:${name}` 索引
  const investmentAssetClassCache = new Map<string, string>()
  for (const ac of investmentAssetClasses) {
    investmentAssetClassCache.set(`${ac.accountId}:${ac.name}`, ac.id)
  }

  // 默认资产/负债分类保证存在
  const [defaultAssetCategory, defaultLiabilityCategory] = await Promise.all([
    ensureDefaultCategory(client, 'asset', '资产', 'wallet'),
    ensureDefaultCategory(client, 'liability', '负债', 'credit-card'),
  ])

  // 内存 sort 计数器：由 shared 统一构建
  const sortCounters = await buildSortCounters(client)

  return {
    defaultAssetCategory,
    defaultLiabilityCategory,
    accountCache,
    accountCategoryCache,
    transactionCategoryCache,
    investmentAssetClassCache,
    sortCounters,
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
      data: { name, type: 'transfer', icon: 'arrow-right', sort },
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
          data: { name: effectiveParent, type: categoryType, icon: 'folder', sort },
        })
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
        icon: 'circle',
        parentId,
        sort,
      },
    })
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

// ─── 账户查找/创建（带 ensureAccountType 去重） ───

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
      icon: forceType === 'liability' ? 'credit-card' : 'wallet',
    },
  })
  account.type = forceType
  account.categoryId = categoryId
}

async function getOrCreateAccount(
  accountName: string,
  ctx: ImportContext,
  client: TransactionClient,
  forceType?: 'asset' | 'liability'
): Promise<AccountCache> {
  let account = ctx.accountCache.get(accountName)

  if (!account) {
    // 缓存未命中：查 DB
    const dbAccount = await client.account.findFirst({ where: { name: accountName } })
    if (dbAccount) {
      account = {
        id: dbAccount.id,
        type: dbAccount.type,
        categoryId: dbAccount.categoryId,
        isInvestment: ctx.accountCategoryCache.get(`asset:${dbAccount.type}`)?.isInvestment ?? false,
      }
    } else {
      // 创建新账户
      const type = forceType || 'asset'
      const categoryId =
        type === 'liability'
          ? ctx.defaultLiabilityCategory.id
          : ctx.defaultAssetCategory.id
      const sort = takeNextSort(ctx.sortCounters, 'account', categoryId)
      const created = await client.account.create({
        data: {
          name: accountName,
          type,
          initialBalance: 0,
          categoryId,
          icon: type === 'liability' ? 'credit-card' : 'wallet',
          sort,
        },
      })
      account = {
        id: created.id,
        type: created.type,
        categoryId: created.categoryId,
        isInvestment: false,
      }
    }
    ctx.accountCache.set(accountName, account)
  }

  if (forceType && account.type !== forceType) {
    await ensureAccountType(account, forceType, ctx, client)
  }
  return account
}

// ─── 基础字段解析 ───

interface ParsedRowBasics {
  date: Date
  amount: number
  type: 'income' | 'expense' | 'transfer'
}

function parseRowBasicFields(row: ParsedRow): ParsedRowBasics | null {
  const date = new Date(row.time)
  if (isNaN(date.getTime())) return null

  const amount = parseFloat(row.amountStr)
  if (isNaN(amount)) return null

  let type: 'income' | 'expense' | 'transfer'
  if (row.typeStr === '收入') {
    type = 'income'
  } else if (row.typeStr === '转账' || row.typeStr === '还款') {
    type = 'transfer'
  } else {
    type = 'expense'
  }

  return { date, amount, type }
}

interface NormalTransactionData {
  id: string
  date: Date
  type: 'income' | 'expense' | 'transfer'
  amount: number
  fee: number
  coupon: number
  note: string | null
  accountId: string
  toAccountId: string | null
  categoryId: string | null
  csvId: string
}

interface RefundTransactionData {
  id: string
  date: Date
  type: 'refund'
  amount: number
  fee: number
  coupon: number
  note: string | null
  accountId: string
  categoryId: string | null
  relatedTransactionId: string | null
  relatedType: 'income' | 'expense' | null
  csvId: string
}

// ─── CSV 解析（Header 映射） ───

function parseCsvFile(
  buffer: Buffer,
  startDate?: Date,
  endDate?: Date
): { rows: ParsedRow[]; outOfRangeCount: number } {
  const records = readCsvRecords<TransactionCsvField>(buffer, TRANSACTION_CSV_HEADER)
  const rows: ParsedRow[] = []
  let outOfRangeCount = 0

  const isInRange = (row: ParsedRow): boolean => {
    if (!startDate && !endDate) return true
    const rowDate = new Date(row.time)
    if (isNaN(rowDate.getTime())) return false
    if (startDate && rowDate < startDate) return false
    if (endDate && rowDate > endDate) return false
    return true
  }

  for (const record of records) {
    try {
      const feeStr = record['手续费']
      const couponStr = record['优惠券']

      const row: ParsedRow = {
        csvId: record.ID,
        time: record.时间,
        category1: record.分类,
        category2: record.二级分类,
        typeStr: record.类型,
        amountStr: record.金额,
        account1: record.账户1,
        account2: record.账户2,
        note: record.备注,
        fee: feeStr ? parseFloat(feeStr) || 0 : 0,
        coupon: couponStr ? parseFloat(couponStr) || 0 : 0,
        relatedCsvId: record.关联账单,
      }

      if (!isInRange(row)) {
        outOfRangeCount++
        continue
      }

      rows.push(row)
    } catch {
      // skip invalid lines
    }
  }

  return { rows, outOfRangeCount }
}

// ─── 主入口：批量 createMany ───

async function importTransactionsFromRows(
  rows: ParsedRow[],
  outOfRangeCount: number,
  tx?: TransactionClient
): Promise<{ imported: number; skipped: number }> {
  const client = tx || prisma
  const ctx = await buildImportContext(client)
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
      const basics = parseRowBasicFields(row)!
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
        : await getOrCreateCategory(row.category1, row.category2, basics.type, ctx, client)
      const id = uuidv4()
      csvIdToUuid.set(row.csvId, id)
      normalData.push({
        id,
        date: basics.date,
        type: basics.type,
        amount: Math.abs(basics.amount),
        fee: row.fee,
        coupon: row.coupon,
        note: row.note || null,
        accountId: fromAccount.id,
        toAccountId: toAccount?.id || null,
        categoryId,
        csvId: row.csvId,
      })
      imported++
    } catch {
      skipped++
    }
  }

  // Step 3: 批量插入普通交易
  if (normalData.length > 0) {
    await client.transaction.createMany({
      data: normalData.map(({ csvId: _csvId, ...data }) => data),
    })
  }

  // Step 4: 解析退款行（账户 + 分类 + 关联类型）
  const refundData: RefundTransactionData[] = []
  for (const row of refundRows) {
    try {
      const date = new Date(row.time)
      if (isNaN(date.getTime())) { skipped++; continue }
      const amount = parseFloat(row.amountStr)
      if (isNaN(amount)) { skipped++; continue }

      // 通过预生成 UUID 关联普通交易类型
      const relatedUuid = row.relatedCsvId ? csvIdToUuid.get(row.relatedCsvId) : null
      let relatedType: 'income' | 'expense' | null = null
      if (relatedUuid) {
        const normalEntry = normalData.find(d => d.id === relatedUuid)
        if (normalEntry) {
          relatedType = normalEntry.type as 'income' | 'expense'
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
      const id = uuidv4()
      csvIdToUuid.set(row.csvId, id)
      refundData.push({
        id,
        date,
        type: 'refund',
        amount: Math.abs(amount),
        fee: row.fee,
        coupon: row.coupon,
        note: row.note || null,
        accountId: accountData.id,
        categoryId,
        relatedTransactionId: relatedUuid || null,
        relatedType,
        csvId: row.csvId,
      })
      imported++
    } catch {
      skipped++
    }
  }

  // Step 5: 批量插入退款交易
  if (refundData.length > 0) {
    await client.transaction.createMany({
      data: refundData.map(({ csvId: _csvId, ...data }) => data),
    })
  }

  return { imported, skipped: skipped + outOfRangeCount }
}

export async function importTransactionsFromCsv(
  buffer: Buffer,
  startDate?: Date,
  endDate?: Date,
  tx?: TransactionClient
): Promise<{ imported: number; skipped: number }> {
  const { rows, outOfRangeCount } = parseCsvFile(buffer, startDate, endDate)
  return importTransactionsFromRows(rows, outOfRangeCount, tx)
}
