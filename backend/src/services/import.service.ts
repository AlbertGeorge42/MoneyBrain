﻿﻿﻿﻿﻿﻿import { prisma } from '../index.js'
import { toDecimal } from '../common/index.js'
import { getNextAccountCategorySort } from './account-category.service.js'
import { getNextAccountSort } from './account.service.js'
import { getNextTransactionCategorySort } from './transaction-category.service.js'

// ─── CSV 事务导入 ───

interface AccountCache {
  id: string
  type: string
  categoryId: string | null
}

export interface ParsedRow {
  csvId: string
  time: string
  category1: string
  category2: string
  typeStr: string
  amountStr: string
  account1: string
  account2: string
  note: string
  fee: number
  coupon: number
  relatedCsvId: string
}

interface ImportContext {
  defaultAssetCategory: { id: string }
  defaultLiabilityCategory: { id: string }
  accountCache: Record<string, AccountCache>
  categoryCache: Record<string, string>
  idMapping: Record<string, string>
}

/**
 * 统一的 CSV 行解析器
 * - 支持 `""` 转义为 `"`
 * - 支持引号包裹字段
 * - `trim=true` 时去除每个字段两侧空白（默认 false）
 */
function parseCsvLine(line: string, trim = false): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"'
        i += 2
      } else if (char === '"') {
        inQuotes = false
        i++
      } else {
        current += char
        i++
      }
    } else {
      if (char === '"') {
        inQuotes = true
        i++
      } else if (char === ',') {
        fields.push(trim ? current.trim() : current)
        current = ''
        i++
      } else {
        current += char
        i++
      }
    }
  }
  fields.push(trim ? current.trim() : current)
  return fields
}

async function getOrCreateTransferSubCategory(name: string): Promise<string> {
  let category = await prisma.transactionCategory.findFirst({
    where: { name, type: 'transfer', parentId: null },
  })
  if (!category) {
    const sort = await getNextTransactionCategorySort('transfer', null)
    category = await prisma.transactionCategory.create({
      data: { name, type: 'transfer', icon: 'arrow-right', sort },
    })
  }
  return category.id
}

async function classifyTransfer(
  fromAccount: AccountCache | null,
  toAccount: AccountCache | null
): Promise<string> {
  if (toAccount?.type === 'liability') {
    return getOrCreateTransferSubCategory('还款')
  }
  if (fromAccount?.type === 'liability') {
    return getOrCreateTransferSubCategory('借贷')
  }
  if (toAccount?.categoryId) {
    const toCategory = await prisma.accountCategory.findUnique({
      where: { id: toAccount.categoryId },
    })
    if (toCategory?.isInvestment) {
      return getOrCreateTransferSubCategory('买入')
    }
  }
  if (fromAccount?.categoryId) {
    const fromCategory = await prisma.accountCategory.findUnique({
      where: { id: fromAccount.categoryId },
    })
    if (fromCategory?.isInvestment) {
      return getOrCreateTransferSubCategory('卖出')
    }
  }
  return getOrCreateTransferSubCategory('转账')
}

async function getOrCreateCategory(
  category1: string,
  category2: string | undefined,
  categoryType: 'income' | 'expense' | 'transfer',
  categoryCache: Record<string, string>
): Promise<string> {
  const cacheKey = category2 ? `${category1}/${category2}` : category1
  const typedCacheKey = `${categoryType}:${cacheKey}`

  if (categoryCache[typedCacheKey]) {
    return categoryCache[typedCacheKey]
  }

  let parentId: string | null = null
  if (category2) {
    const parentCacheKey = `${categoryType}:${category1}`
    if (categoryCache[parentCacheKey]) {
      parentId = categoryCache[parentCacheKey]
    } else {
      let parentCategory = await prisma.transactionCategory.findFirst({
        where: { name: category1, parentId: null, type: categoryType },
      })
      if (!parentCategory) {
        const sort = await getNextTransactionCategorySort(categoryType, null)
        parentCategory = await prisma.transactionCategory.create({
          data: { name: category1, type: categoryType, icon: 'folder', sort },
        })
      }
      parentId = parentCategory.id
      categoryCache[parentCacheKey] = parentId
    }
  }

  const actualCategoryName = category2 || category1
  let category = await prisma.transactionCategory.findFirst({
    where: { name: actualCategoryName, parentId, type: categoryType },
  })
  if (!category) {
    const sort = await getNextTransactionCategorySort(categoryType, parentId)
    category = await prisma.transactionCategory.create({
      data: { name: actualCategoryName, type: categoryType, icon: 'circle', parentId, sort },
    })
  }
  categoryCache[typedCacheKey] = category.id
  return category.id
}

async function getOrCreateAccount(
  accountName: string,
  ctx: ImportContext,
  forceType?: 'asset' | 'liability'
): Promise<AccountCache> {
  if (ctx.accountCache[accountName]) {
    const cached = ctx.accountCache[accountName]
    if (forceType && cached.type !== forceType) {
      await prisma.account.update({
        where: { id: cached.id },
        data: {
          type: forceType,
          categoryId: forceType === 'liability'
            ? ctx.defaultLiabilityCategory.id
            : ctx.defaultAssetCategory.id,
          icon: forceType === 'liability' ? 'credit-card' : 'wallet',
        },
      })
      cached.type = forceType
      cached.categoryId = forceType === 'liability'
        ? ctx.defaultLiabilityCategory.id
        : ctx.defaultAssetCategory.id
    }
    return cached
  }

  let account = await prisma.account.findFirst({ where: { name: accountName } })
  
  if (account) {
    if (forceType && account.type !== forceType) {
      account = await prisma.account.update({
        where: { id: account.id },
        data: {
          type: forceType,
          categoryId: forceType === 'liability'
            ? ctx.defaultLiabilityCategory.id
            : ctx.defaultAssetCategory.id,
          icon: forceType === 'liability' ? 'credit-card' : 'wallet',
        },
      })
    }
  } else {
    const type = forceType || 'asset'
    const categoryId = type === 'liability'
      ? ctx.defaultLiabilityCategory.id
      : ctx.defaultAssetCategory.id
    const sort = await getNextAccountSort(categoryId)
    account = await prisma.account.create({
      data: {
        name: accountName,
        type,
        initialBalance: 0,
        categoryId,
        icon: type === 'liability' ? 'credit-card' : 'wallet',
        sort,
      },
    })
  }

  const accountData = { id: account.id, type: account.type, categoryId: account.categoryId }
  ctx.accountCache[accountName] = accountData
  return accountData
}

async function importNormalRow(row: ParsedRow, ctx: ImportContext): Promise<boolean> {
  const { csvId, time, category1, category2, typeStr, amountStr, account1, account2, note, fee, coupon } = row

  const date = new Date(time)
  if (isNaN(date.getTime())) return false

  const amount = parseFloat(amountStr)
  if (isNaN(amount)) return false

  let type: 'income' | 'expense' | 'transfer'
  if (typeStr === '收入' || typeStr === '报销记录') {
    type = 'income'
  } else if (typeStr === '转账' || typeStr === '还款') {
    type = 'transfer'
  } else {
    type = 'expense'
  }

  const categoryType = type === 'income' ? 'income' : type === 'expense' ? 'expense' : 'transfer'
  const categoryId = await getOrCreateCategory(category1, category2, categoryType, ctx.categoryCache)

  const accountData = await getOrCreateAccount(account1, ctx)

  let toAccountData: AccountCache | null = null
  if (type === 'transfer' && account2) {
    const forceType = typeStr === '还款' ? 'liability' : undefined
    toAccountData = await getOrCreateAccount(account2, ctx, forceType)
  }

  let finalCategoryId = categoryId
  if (type === 'transfer') {
    finalCategoryId = await classifyTransfer(accountData, toAccountData)
  }

  const transaction = await prisma.transaction.create({
    data: {
      date,
      type,
      amount: Math.abs(amount),
      fee,
      coupon,
      note: note || null,
      accountId: accountData.id,
      toAccountId: toAccountData?.id || null,
      categoryId: finalCategoryId,
    },
  })

  ctx.idMapping[csvId] = transaction.id
  return true
}

async function importRefundRow(row: ParsedRow, ctx: ImportContext): Promise<boolean> {
  const { csvId, time, category1, category2, amountStr, account1, note, fee, coupon, relatedCsvId } = row

  const date = new Date(time)
  if (isNaN(date.getTime())) return false

  const amount = parseFloat(amountStr)
  if (isNaN(amount)) return false

  const relatedTransactionId = relatedCsvId && ctx.idMapping[relatedCsvId]
    ? ctx.idMapping[relatedCsvId]
    : null

  let relatedType: 'income' | 'expense' | null = null
  if (relatedTransactionId) {
    const relatedTransaction = await prisma.transaction.findUnique({
      where: { id: relatedTransactionId },
      select: { type: true },
    })
    if (relatedTransaction) {
      relatedType = relatedTransaction.type as 'income' | 'expense'
    }
  }

  if (!relatedType) {
    const cacheKey = category2 ? `${category1}/${category2}` : category1
    for (const possibleType of ['expense', 'income'] as const) {
      const typedCacheKey = `${possibleType}:${cacheKey}`
      if (ctx.categoryCache[typedCacheKey]) {
        relatedType = possibleType
        break
      }
    }
    if (!relatedType) {
      for (const possibleType of ['expense', 'income'] as const) {
        const parentCacheKey = `${possibleType}:${category1}`
        if (ctx.categoryCache[parentCacheKey]) {
          relatedType = possibleType
          break
        }
      }
    }
  }

  let categoryId: string | null = null
  const categoryCacheKey = category2 ? `${category1}/${category2}` : category1
  for (const possibleType of ['expense', 'income'] as const) {
    const typedCacheKey = `${possibleType}:${categoryCacheKey}`
    if (ctx.categoryCache[typedCacheKey]) {
      categoryId = ctx.categoryCache[typedCacheKey]
      break
    }
  }
  if (!categoryId) {
    for (const possibleType of ['expense', 'income'] as const) {
      const parentCacheKey = `${possibleType}:${category1}`
      if (ctx.categoryCache[parentCacheKey]) {
        categoryId = ctx.categoryCache[parentCacheKey]
        break
      }
    }
  }

  const accountData = await getOrCreateAccount(account1, ctx)

  const transaction = await prisma.transaction.create({
    data: {
      date,
      type: 'refund',
      amount: Math.abs(amount),
      fee,
      coupon,
      note: note || null,
      accountId: accountData.id,
      categoryId,
      relatedTransactionId,
      relatedType,
    },
  })

  ctx.idMapping[csvId] = transaction.id
  return true
}

function parseCsvFile(buffer: Buffer, startDate?: Date, endDate?: Date): { rows: ParsedRow[]; outOfRangeCount: number } {
  const content = buffer.toString('utf-8')
  const lines = content.split('\n').filter(line => line.trim())

  if (lines.length < 2) {
    return { rows: [], outOfRangeCount: 0 }
  }

  const dataLines = lines.slice(1)
  const rows: ParsedRow[] = []

  const isInRange = (row: ParsedRow): boolean => {
    if (!startDate && !endDate) return true
    const rowDate = new Date(row.time)
    if (isNaN(rowDate.getTime())) return false
    if (startDate && rowDate < startDate) return false
    if (endDate && rowDate > endDate) return false
    return true
  }

  let outOfRangeCount = 0

  for (const line of dataLines) {
    try {
      const cols = parseCsvLine(line, true)
      if (cols.length < 9) continue

      const [csvId, time, category1, category2, typeStr, amountStr, , account1, account2, note, , feeStr, couponStr, , , , , relatedCsvId] = cols

      const row: ParsedRow = {
        csvId,
        time,
        category1,
        category2,
        typeStr,
        amountStr,
        account1,
        account2,
        note,
        fee: feeStr ? parseFloat(feeStr) || 0 : 0,
        coupon: couponStr ? parseFloat(couponStr) || 0 : 0,
        relatedCsvId,
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

async function importTransactionsFromRows(
  rows: ParsedRow[],
  outOfRangeCount: number,
  tx?: TransactionClient
): Promise<{ imported: number; skipped: number }> {
  const client = tx || prisma
  let imported = 0
  let skipped = 0

  let defaultAssetCategory = await client.accountCategory.findFirst({
    where: { type: 'asset', parentId: null },
  })
  if (!defaultAssetCategory) {
    const sort = await getNextAccountCategorySort('asset')
    defaultAssetCategory = await client.accountCategory.create({
      data: { name: '资产', type: 'asset', icon: 'wallet', sort },
    })
  }

  let defaultLiabilityCategory = await client.accountCategory.findFirst({
    where: { type: 'liability', parentId: null },
  })
  if (!defaultLiabilityCategory) {
    const sort = await getNextAccountCategorySort('liability')
    defaultLiabilityCategory = await client.accountCategory.create({
      data: { name: '负债', type: 'liability', icon: 'credit-card', sort },
    })
  }

  const ctx: ImportContext = {
    defaultAssetCategory,
    defaultLiabilityCategory,
    accountCache: {},
    categoryCache: {},
    idMapping: {},
  }

  const refundRows = rows.filter(r => r.typeStr === '退款')
  const normalRows = rows.filter(r => r.typeStr !== '退款')

  for (const row of normalRows) {
    try {
      const success = await importNormalRow(row, ctx)
      if (success) imported++
      else skipped++
    } catch {
      skipped++
    }
  }

  for (const row of refundRows) {
    try {
      const success = await importRefundRow(row, ctx)
      if (success) imported++
      else skipped++
    } catch {
      skipped++
    }
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

// ─── 配置导入 ───

interface ImportAccountCategory {
  name: string
  type: string
  icon?: string
  sort: number
  isCashEquivalent?: boolean
  isInvestment?: boolean
  children?: ImportAccountCategory[]
}

interface ImportAccount {
  name: string
  type: string
  initialBalance?: string
  initialBalanceDate?: string
  icon?: string
  color?: string
  sort?: number
  categoryName?: string
}

interface ImportTransactionCategory {
  name: string
  type: string
  icon?: string
  color?: string
  cashFlowType?: string
  sort: number
  children?: ImportTransactionCategory[]
}

interface ConfigImportData {
  version?: string
  type?: string
  data: {
    accounts?: ImportAccount[]
    accountCategories?: ImportAccountCategory[]
    transactionCategories?: ImportTransactionCategory[]
    investmentAssetClasses?: ImportInvestmentAssetClass[]
  }
}

export interface ImportConfigResult {
  imported: {
    accountCategories: number
    accounts: number
    transactionCategories: number
    investmentAssetClasses: number
  }
  updated: {
    accountCategories: number
    accounts: number
    transactionCategories: number
    investmentAssetClasses: number
  }
  skipped: {
    accountCategories: number
    accounts: number
    transactionCategories: number
    investmentAssetClasses: number
  }
  errors: string[]
}

type TransactionClient = Parameters<Parameters<typeof prisma['$transaction']>[0]>[0]

async function importAccountCategories(
  categories: ImportAccountCategory[],
  tx: TransactionClient,
  result: ImportConfigResult,
  nameMap: Map<string, string>,
  typeMap: Map<string, string>,
  mode: string,
  parentId: string | null = null
): Promise<void> {
  for (const category of categories) {
    try {
      const existing = await tx.accountCategory.findFirst({
        where: { name: category.name, type: category.type, parentId },
      })

      if (existing) {
        if (mode === 'merge') {
          await tx.accountCategory.update({
            where: { id: existing.id },
            data: {
              icon: category.icon ?? existing.icon,
              sort: category.sort ?? existing.sort,
              isCashEquivalent: category.isCashEquivalent ?? existing.isCashEquivalent,
              isInvestment: category.isInvestment ?? existing.isInvestment,
            },
          })
          nameMap.set(category.name, existing.id)
          typeMap.set(category.name, existing.type)
          result.updated.accountCategories++
        } else {
          result.skipped.accountCategories++
        }
      } else {
        const sort = category.sort ?? (await getNextAccountCategorySort(category.type))
        const created = await tx.accountCategory.create({
          data: {
            name: category.name,
            type: category.type,
            icon: category.icon,
            sort,
            parentId,
            isCashEquivalent: category.isCashEquivalent ?? false,
            isInvestment: category.isInvestment ?? false,
          },
        })
        nameMap.set(category.name, created.id)
        typeMap.set(category.name, created.type)
        result.imported.accountCategories++
      }

      const currentId = nameMap.get(category.name)!

      if (category.children && category.children.length > 0) {
        await importAccountCategories(
          category.children,
          tx,
          result,
          nameMap,
          typeMap,
          mode,
          currentId
        )
      }
    } catch (error) {
      result.errors.push(`账户分类 "${category.name}" 导入失败: ${(error as Error).message}`)
      result.skipped.accountCategories++
    }
  }
}

async function importAccounts(
  accounts: ImportAccount[],
  tx: TransactionClient,
  result: ImportConfigResult,
  categoryNameMap: Map<string, string>,
  mode: string
): Promise<void> {
  for (const account of accounts) {
    try {
      const existing = await tx.account.findFirst({
        where: { name: account.name },
      })

      let categoryId: string | null = null
      if (account.categoryName && categoryNameMap.has(account.categoryName)) {
        categoryId = categoryNameMap.get(account.categoryName)!
      } else {
        // 优先匹配子分类（parentId 不为 null），再匹配父分类
        const subCategory = await tx.accountCategory.findFirst({
          where: { name: account.categoryName ?? '', parentId: { not: null } },
        })
        if (subCategory) {
          categoryId = subCategory.id
        } else {
          const defaultCategory = await tx.accountCategory.findFirst({
            where: { type: account.type, parentId: null },
          })
          if (defaultCategory) {
            categoryId = defaultCategory.id
          }
        }
      }

      if (existing) {
        if (mode === 'merge') {
          await tx.account.update({
            where: { id: existing.id },
            data: {
              type: account.type ?? existing.type,
              initialBalance: account.initialBalance ? parseFloat(account.initialBalance) : existing.initialBalance,
              initialBalanceDate: account.initialBalanceDate ? new Date(account.initialBalanceDate) : existing.initialBalanceDate,
              icon: account.icon ?? existing.icon,
              color: account.color ?? existing.color,
              sort: account.sort ?? existing.sort,
              categoryId: categoryId ?? existing.categoryId,
            },
          })
          result.updated.accounts++
        } else {
          result.skipped.accounts++
        }
      } else {
        const sort = account.sort ?? (await getNextAccountSort(categoryId))
        await tx.account.create({
          data: {
            name: account.name,
            type: account.type,
            initialBalance: account.initialBalance ? parseFloat(account.initialBalance) : 0,
            initialBalanceDate: account.initialBalanceDate ? new Date(account.initialBalanceDate) : null,
            icon: account.icon,
            color: account.color,
            sort,
            categoryId,
          },
        })
        result.imported.accounts++
      }
    } catch (error) {
      result.errors.push(`账户 "${account.name}" 导入失败: ${(error as Error).message}`)
      result.skipped.accounts++
    }
  }
}

async function importTransactionCategories(
  categories: ImportTransactionCategory[],
  tx: TransactionClient,
  result: ImportConfigResult,
  nameMap: Map<string, string>,
  mode: string,
  parentId: string | null = null
): Promise<void> {
  for (const category of categories) {
    try {
      const existing = await tx.transactionCategory.findFirst({
        where: { name: category.name, type: category.type, parentId },
      })

      if (existing) {
        if (mode === 'merge') {
          await tx.transactionCategory.update({
            where: { id: existing.id },
            data: {
              icon: category.icon ?? existing.icon,
              color: category.color ?? existing.color,
              cashFlowType: category.cashFlowType ?? existing.cashFlowType,
              sort: category.sort ?? existing.sort,
            },
          })
          nameMap.set(`${category.type}:${category.name}`, existing.id)
          result.updated.transactionCategories++
        } else {
          result.skipped.transactionCategories++
        }
      } else {
        const sort = category.sort ?? (await getNextTransactionCategorySort(category.type, parentId))
        const created = await tx.transactionCategory.create({
          data: {
            name: category.name,
            type: category.type,
            icon: category.icon,
            color: category.color,
            cashFlowType: category.cashFlowType,
            sort,
            parentId,
          },
        })
        nameMap.set(`${category.type}:${category.name}`, created.id)
        result.imported.transactionCategories++
      }

      const currentId = nameMap.get(`${category.type}:${category.name}`)!

      if (category.children && category.children.length > 0) {
        await importTransactionCategories(
          category.children,
          tx,
          result,
          nameMap,
          mode,
          currentId
        )
      }
    } catch (error) {
      result.errors.push(`收支分类 "${category.name}" 导入失败: ${(error as Error).message}`)
      result.skipped.transactionCategories++
    }
  }
}

export async function importConfig(
  configData: ConfigImportData,
  mode: 'merge' | 'overwrite',
  tx?: TransactionClient
): Promise<ImportConfigResult> {
  const client = tx || prisma
  const result: ImportConfigResult = {
    imported: { accountCategories: 0, accounts: 0, transactionCategories: 0, investmentAssetClasses: 0 },
    updated: { accountCategories: 0, accounts: 0, transactionCategories: 0, investmentAssetClasses: 0 },
    skipped: { accountCategories: 0, accounts: 0, transactionCategories: 0, investmentAssetClasses: 0 },
    errors: [],
  }

  const executeImport = async (tx: TransactionClient) => {
    const accountCategoryNameMap = new Map<string, string>()
    const accountCategoryTypeMap = new Map<string, string>()

    if (configData.data.accountCategories) {
      await importAccountCategories(
        configData.data.accountCategories,
        tx,
        result,
        accountCategoryNameMap,
        accountCategoryTypeMap,
        mode
      )
    }

    if (configData.data.accounts) {
      await importAccounts(
        configData.data.accounts,
        tx,
        result,
        accountCategoryNameMap,
        mode
      )
    }

    const transactionCategoryNameMap = new Map<string, string>()

    if (configData.data.transactionCategories) {
      await importTransactionCategories(
        configData.data.transactionCategories,
        tx,
        result,
        transactionCategoryNameMap,
        mode
      )
    }

    // 投资资产类别（依赖账户）
    if (configData.data.investmentAssetClasses) {
      await importInvestmentAssetClasses(
        configData.data.investmentAssetClasses,
        tx,
        result,
        mode
      )
    }
  }

  if (tx) {
    await executeImport(tx)
  } else {
    await prisma.$transaction(async (tx) => {
      // 独立调用时（如单独导入 config.json），需要处理覆盖模式的清空
      if (mode === 'overwrite') {
        await tx.investmentAssetClass.deleteMany()
        await tx.account.deleteMany()
        await tx.accountCategory.deleteMany()
        await tx.transactionCategory.deleteMany()
      }
      await executeImport(tx)
    })
  }

  return result
}

/**
 * 导入投资资产类别
 */
async function importInvestmentAssetClasses(
  assetClasses: ImportInvestmentAssetClass[],
  tx: TransactionClient,
  result: ImportConfigResult,
  mode: 'merge' | 'overwrite'
): Promise<void> {
  for (const ac of assetClasses) {
    try {
      const account = await tx.account.findFirst({
        where: { name: ac.accountName }
      })
      if (!account) {
        result.errors.push(`投资资产类别关联账户不存在: ${ac.accountName}`)
        result.skipped.investmentAssetClasses++
        continue
      }

      const existing = await tx.investmentAssetClass.findFirst({
        where: { accountId: account.id, name: ac.name }
      })

      if (existing) {
        if (mode === 'merge') {
          await tx.investmentAssetClass.update({
            where: { id: existing.id },
            data: {
              icon: ac.icon ?? existing.icon,
              targetRatio: ac.targetRatio ?? existing.targetRatio,
              sort: ac.sort ?? existing.sort
            }
          })
          result.updated.investmentAssetClasses++
        } else {
          result.skipped.investmentAssetClasses++
        }
      } else {
        await tx.investmentAssetClass.create({
          data: {
            accountId: account.id,
            name: ac.name,
            icon: ac.icon,
            targetRatio: ac.targetRatio,
            sort: ac.sort
          }
        })
        result.imported.investmentAssetClasses++
      }
    } catch (error) {
      result.errors.push(`投资资产类别 "${ac.name}" 导入失败: ${(error as Error).message}`)
    }
  }
}

// ─── 预算导入 ───

interface ImportBudget {
  name: string
  type: string
  amount: string
  period: string
  startDate: string
  endDate?: string | null
  transactionTime?: number | null
  note?: string | null
  isActive?: boolean
  accountName: string
  toAccountName?: string | null
  categoryName: string
}

interface BudgetImportData {
  version?: string
  type?: string
  data: {
    budgets: ImportBudget[]
  }
}

export interface ImportBudgetResult {
  imported: number
  updated: number
  skipped: number
  errors: string[]
}

const BUDGET_TYPES = ['income', 'expense', 'transfer'] as const
const BUDGET_PERIODS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const

export async function importBudgets(
  budgetData: BudgetImportData,
  mode: 'merge' | 'overwrite',
  tx?: TransactionClient
): Promise<ImportBudgetResult> {
  const client = tx || prisma
  const result: ImportBudgetResult = {
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  }

  const executeImport = async (tx: TransactionClient) => {
    if (mode === 'overwrite') {
      await tx.budget.deleteMany()
    }

    const accountNameMap = new Map<string, string>()
    const accounts = await tx.account.findMany()
    for (const a of accounts) {
      accountNameMap.set(a.name, a.id)
    }

    const categoryNameMap = new Map<string, string>()
    const categories = await tx.transactionCategory.findMany()
    for (const c of categories) {
      categoryNameMap.set(c.name, c.id)
    }

    for (const budget of budgetData.data.budgets) {
      try {
        if (!BUDGET_TYPES.includes(budget.type as typeof BUDGET_TYPES[number])) {
          result.errors.push(`预算 "${budget.name}" 类型无效: ${budget.type}`)
          result.skipped++
          continue
        }

        if (!BUDGET_PERIODS.includes(budget.period as typeof BUDGET_PERIODS[number])) {
          result.errors.push(`预算 "${budget.name}" 周期无效: ${budget.period}`)
          result.skipped++
          continue
        }

        const accountId = accountNameMap.get(budget.accountName)
        if (!accountId) {
          result.errors.push(`预算 "${budget.name}" 关联账户不存在: ${budget.accountName}`)
          result.skipped++
          continue
        }

        const categoryId = categoryNameMap.get(budget.categoryName)
        if (!categoryId) {
          result.errors.push(`预算 "${budget.name}" 关联分类不存在: ${budget.categoryName}`)
          result.skipped++
          continue
        }

        let toAccountId: string | null = null
        if (budget.toAccountName) {
          toAccountId = accountNameMap.get(budget.toAccountName) ?? null
          if (!toAccountId) {
            result.errors.push(`预算 "${budget.name}" 目标账户不存在: ${budget.toAccountName}`)
            result.skipped++
            continue
          }
        }

        if (budget.type === 'transfer' && !toAccountId) {
          result.errors.push(`预算 "${budget.name}" 转账类型必须指定目标账户`)
          result.skipped++
          continue
        }

        const existing = await tx.budget.findFirst({
          where: { name: budget.name },
        })

        if (existing) {
          if (mode === 'merge') {
            await tx.budget.update({
              where: { id: existing.id },
              data: {
                type: budget.type,
                amount: toDecimal(budget.amount),
                period: budget.period,
                startDate: new Date(budget.startDate),
                endDate: budget.endDate ? new Date(budget.endDate) : null,
                transactionTime: budget.transactionTime ?? null,
                note: budget.note ?? null,
                isActive: budget.isActive ?? true,
                accountId,
                toAccountId,
                categoryId,
              },
            })
            result.updated++
          } else {
            result.skipped++
          }
        } else {
          await tx.budget.create({
            data: {
              name: budget.name,
              type: budget.type,
              amount: toDecimal(budget.amount),
              period: budget.period,
              startDate: new Date(budget.startDate),
              endDate: budget.endDate ? new Date(budget.endDate) : null,
              transactionTime: budget.transactionTime ?? null,
              note: budget.note ?? null,
              isActive: budget.isActive ?? true,
              accountId,
              toAccountId,
              categoryId,
            },
          })
          result.imported++
        }
      } catch (error) {
        result.errors.push(`预算 "${budget.name}" 导入失败: ${(error as Error).message}`)
        result.skipped++
      }
    }
  }

  if (tx) {
    await executeImport(tx)
  } else {
    await prisma.$transaction(async (tx) => {
      await executeImport(tx)
    })
  }

  return result
}


// ─── 投资快照导入（CSV 格式） ───

interface ImportInvestmentAssetClass {
  accountName: string
  name: string
  icon: string | null
  targetRatio: number | null
  sort: number
}

/**
 * 统一的 CSV 解析器已在文件顶部声明，此处不再重复定义
 */

interface ImportSnapshotCsvRow {
  accountName: string
  date: string
  accountBalance: string
  previousSnapshotDate: string
  note: string
  assetClassName: string
  marketValue: string
  periodNetFlow: string
  sort: string
}

export interface ImportSnapshotsResult {
  imported: { snapshots: number; items: number }
  updated: { snapshots: number }
  skipped: { snapshots: number }
  errors: string[]
}

/**
 * 从 CSV 导入投资快照
 * 资产类别已移至 config 导入，本函数只处理快照和分配项
 */
export async function importSnapshotsFromCsv(
  csvBuffer: Buffer | string,
  mode: 'merge' | 'overwrite',
  tx?: TransactionClient
): Promise<ImportSnapshotsResult> {
  const client = tx || prisma
  const result: ImportSnapshotsResult = {
    imported: { snapshots: 0, items: 0 },
    updated: { snapshots: 0 },
    skipped: { snapshots: 0 },
    errors: []
  }

  // 去除 UTF-8 BOM
  let csvText = typeof csvBuffer === 'string' ? csvBuffer : csvBuffer.toString('utf-8')
  if (csvText.charCodeAt(0) === 0xfeff) {
    csvText = csvText.slice(1)
  }

  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0)
  if (lines.length === 0) {
    return result
  }

  // 跳过表头
  const dataLines = lines.slice(1)
  if (dataLines.length === 0) {
    return result
  }

  // 解析所有行
  const rows: ImportSnapshotCsvRow[] = dataLines.map(line => {
    const fields = parseCsvLine(line)
    return {
      accountName: fields[0] || '',
      date: fields[1] || '',
      accountBalance: fields[2] || '',
      previousSnapshotDate: fields[3] || '',
      note: fields[4] || '',
      assetClassName: fields[5] || '',
      marketValue: fields[6] || '',
      periodNetFlow: fields[7] || '',
      sort: fields[8] || '0'
    }
  })

  // 按 (accountName, date) 分组，一个快照可能有多行（多个分配项）
  const snapshotMap = new Map<string, ImportSnapshotCsvRow[]>()
  for (const row of rows) {
    if (!row.accountName || !row.date) continue
    const key = `${row.accountName}|${row.date}`
    if (!snapshotMap.has(key)) {
      snapshotMap.set(key, [])
    }
    snapshotMap.get(key)!.push(row)
  }

  if (mode === 'overwrite') {
    await client.investmentAllocationItem.deleteMany()
    await client.investmentAllocationSnapshot.deleteMany()
  }

  // 按日期升序排序快照
  const sortedKeys = Array.from(snapshotMap.keys()).sort((a, b) => {
    const dateA = snapshotMap.get(a)![0].date
    const dateB = snapshotMap.get(b)![0].date
    return new Date(dateA).getTime() - new Date(dateB).getTime()
  })

  // 记录每个账户的快照链表
  const snapshotChainMap = new Map<string, Map<string, string>>()

  for (const key of sortedKeys) {
    const snapshotRows = snapshotMap.get(key)!
    const firstRow = snapshotRows[0]
    try {
      const account = await client.account.findFirst({
        where: { name: firstRow.accountName }
      })
      if (!account) {
        result.errors.push(`投资快照关联账户不存在: ${firstRow.accountName}`)
        result.skipped.snapshots++
        continue
      }

      // 验证所有资产类别
      const items: { assetClassId: string; marketValue: number; periodNetFlow: number; sort: number }[] = []
      let allAssetClassesValid = true
      for (const row of snapshotRows) {
        if (!row.assetClassName) continue

        const assetClass = await client.investmentAssetClass.findFirst({
          where: { accountId: account.id, name: row.assetClassName }
        })
        if (!assetClass) {
          result.errors.push(`投资资产类别不存在: ${row.assetClassName} (账户: ${firstRow.accountName})`)
          allAssetClassesValid = false
          break
        }
        items.push({
          assetClassId: assetClass.id,
          marketValue: parseFloat(row.marketValue) || 0,
          periodNetFlow: parseFloat(row.periodNetFlow) || 0,
          sort: parseInt(row.sort, 10) || 0
        })
      }
      if (!allAssetClassesValid) {
        result.skipped.snapshots++
        continue
      }

      const snapshotDate = new Date(firstRow.date)
      if (isNaN(snapshotDate.getTime())) {
        result.errors.push(`投资快照日期格式错误: ${firstRow.date}`)
        result.skipped.snapshots++
        continue
      }

      // 确定 previousSnapshotId
      let previousSnapshotId: string | null = null
      const accountChain = snapshotChainMap.get(account.id)
      if (firstRow.previousSnapshotDate && accountChain?.has(firstRow.previousSnapshotDate)) {
        previousSnapshotId = accountChain.get(firstRow.previousSnapshotDate)!
      } else {
        if (accountChain) {
          const sortedDates = Array.from(accountChain.keys()).sort(
            (a, b) => new Date(b).getTime() - new Date(a).getTime()
          )
          for (const d of sortedDates) {
            if (new Date(d) < snapshotDate) {
              previousSnapshotId = accountChain.get(d)!
              break
            }
          }
        }
      }

      const existing = await client.investmentAllocationSnapshot.findFirst({
        where: { accountId: account.id, date: snapshotDate }
      })

      const accountBalance = parseFloat(firstRow.accountBalance) || 0
      const note = firstRow.note || null

      if (existing) {
        if (mode === 'merge') {
          await client.investmentAllocationSnapshot.update({
            where: { id: existing.id },
            data: {
              accountBalance,
              previousSnapshotId,
              note
            }
          })

          await client.investmentAllocationItem.deleteMany({
            where: { snapshotId: existing.id }
          })

          for (const item of items) {
            await client.investmentAllocationItem.create({
              data: { snapshotId: existing.id, ...item }
            })
            result.imported.items++
          }

          if (!accountChain) snapshotChainMap.set(account.id, new Map())
          snapshotChainMap.get(account.id)!.set(firstRow.date, existing.id)

          result.updated.snapshots++
        } else {
          result.skipped.snapshots++
        }
      } else {
        const newSnapshot = await client.investmentAllocationSnapshot.create({
          data: {
            accountId: account.id,
            date: snapshotDate,
            accountBalance,
            previousSnapshotId,
            note
          }
        })

        for (const item of items) {
          await client.investmentAllocationItem.create({
            data: { snapshotId: newSnapshot.id, ...item }
          })
          result.imported.items++
        }

        if (!accountChain) snapshotChainMap.set(account.id, new Map())
        snapshotChainMap.get(account.id)!.set(firstRow.date, newSnapshot.id)

        result.imported.snapshots++
      }
    } catch (error) {
      result.errors.push(`投资快照导入失败: ${(error as Error).message}`)
    }
  }

  return result
}

// ─── 智能导入 ───

import { parseBackupZip, detectFileType, detectFileIncludes, type BackupFiles } from './backup.service.js'

export interface ImportFullResult {
  imported: {
    accountCategories: number
    accounts: number
    transactionCategories: number
    transactions: number
    budgets: number
    investmentSnapshots: number
    investmentItems: number
  }
  updated: {
    accountCategories: number
    accounts: number
    transactionCategories: number
    budgets: number
    investmentSnapshots: number
  }
  skipped: {
    accountCategories: number
    accounts: number
    transactionCategories: number
    transactions: number
    budgets: number
    investmentSnapshots: number
  }
  errors: string[]
}

export async function importBackup(
  file: Buffer,
  filename: string,
  mode: 'merge' | 'overwrite'
): Promise<ImportFullResult> {
  const result: ImportFullResult = {
    imported: {
      accountCategories: 0,
      accounts: 0,
      transactionCategories: 0,
      transactions: 0,
      budgets: 0,
      investmentSnapshots: 0,
      investmentItems: 0
    },
    updated: {
      accountCategories: 0,
      accounts: 0,
      transactionCategories: 0,
      budgets: 0,
      investmentSnapshots: 0
    },
    skipped: {
      accountCategories: 0,
      accounts: 0,
      transactionCategories: 0,
      transactions: 0,
      budgets: 0,
      investmentSnapshots: 0
    },
    errors: []
  }

  const fileType = detectFileType(filename)
  const includes = await detectFileIncludes(file, fileType)

  if (fileType === 'zip') {
    const files = await parseBackupZip(file)

    // 覆盖模式下，先清空所有数据，避免外键约束
    if (mode === 'overwrite') {
      await prisma.investmentAllocationItem.deleteMany()
      await prisma.investmentAllocationSnapshot.deleteMany()
      await prisma.investmentAssetClass.deleteMany()
      await prisma.budget.deleteMany()
      await prisma.transaction.deleteMany()
      await prisma.account.deleteMany()
      await prisma.accountCategory.deleteMany()
      await prisma.transactionCategory.deleteMany()
    }

    // 按依赖顺序导入：先 config，再 transactions，最后 budgets/snapshots
    if (includes.includes('config') && files.config) {
      const configResult = await importConfig(JSON.parse(files.config), mode)
      result.imported.accountCategories = configResult.imported.accountCategories
      result.imported.accounts = configResult.imported.accounts
      result.imported.transactionCategories = configResult.imported.transactionCategories
      result.updated.accountCategories = configResult.updated.accountCategories
      result.updated.accounts = configResult.updated.accounts
      result.updated.transactionCategories = configResult.updated.transactionCategories
      result.skipped.accountCategories = configResult.skipped.accountCategories
      result.skipped.accounts = configResult.skipped.accounts
      result.skipped.transactionCategories = configResult.skipped.transactionCategories
      result.errors.push(...configResult.errors)
    }

    if (includes.includes('transactions') && files.transactions) {
      const transactionResult = await importTransactionsFromCsv(files.transactions)
      result.imported.transactions = transactionResult.imported
      result.skipped.transactions = transactionResult.skipped
    }

    if (includes.includes('budgets') && files.budgets) {
      const budgetResult = await importBudgets(JSON.parse(files.budgets), mode)
      result.imported.budgets = budgetResult.imported
      result.updated.budgets = budgetResult.updated
      result.skipped.budgets = budgetResult.skipped
      result.errors.push(...budgetResult.errors)
    }

    if (includes.includes('snapshots') && files.snapshots) {
      const snapshotResult = await importSnapshotsFromCsv(files.snapshots, mode)
      result.imported.investmentSnapshots = snapshotResult.imported.snapshots
      result.imported.investmentItems = snapshotResult.imported.items
      result.updated.investmentSnapshots = snapshotResult.updated.snapshots
      result.skipped.investmentSnapshots = snapshotResult.skipped.snapshots
      result.errors.push(...snapshotResult.errors)
    }
  } else if (fileType === 'csv') {
    // 单文件 CSV 导入：区分交易记录和投资快照
    const csvText = file.toString('utf-8').replace(/^\ufeff/, '')
    const firstLine = csvText.split(/\r?\n/)[0] || ''
    if (firstLine.includes('投资快照') || firstLine.includes('快照日期')) {
      const snapshotResult = await importSnapshotsFromCsv(file, mode)
      result.imported.investmentSnapshots = snapshotResult.imported.snapshots
      result.imported.investmentItems = snapshotResult.imported.items
      result.updated.investmentSnapshots = snapshotResult.updated.snapshots
      result.skipped.investmentSnapshots = snapshotResult.skipped.snapshots
      result.errors.push(...snapshotResult.errors)
    } else {
      const transactionResult = await importTransactionsFromCsv(file, undefined, undefined)
      result.imported.transactions = transactionResult.imported
      result.skipped.transactions = transactionResult.skipped
    }
  } else if (fileType === 'json') {
    // 单文件 JSON 导入（配置/预算）
    const data = JSON.parse(file.toString())
    if (data.type === 'config') {
      const configResult = await importConfig(data, mode)
      result.imported.accountCategories = configResult.imported.accountCategories
      result.imported.accounts = configResult.imported.accounts
      result.imported.transactionCategories = configResult.imported.transactionCategories
      result.updated.accountCategories = configResult.updated.accountCategories
      result.updated.accounts = configResult.updated.accounts
      result.updated.transactionCategories = configResult.updated.transactionCategories
      result.skipped.accountCategories = configResult.skipped.accountCategories
      result.skipped.accounts = configResult.skipped.accounts
      result.skipped.transactionCategories = configResult.skipped.transactionCategories
      result.errors.push(...configResult.errors)
    } else if (data.type === 'budgets') {
      const budgetResult = await importBudgets(data, mode)
      result.imported.budgets = budgetResult.imported
      result.updated.budgets = budgetResult.updated
      result.skipped.budgets = budgetResult.skipped
      result.errors.push(...budgetResult.errors)
    }
  }

  return result
}
