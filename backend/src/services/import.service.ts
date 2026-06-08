import { prisma } from '../index.js'
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

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())

  return result
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
      const cols = parseCSVLine(line)
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

async function importTransactionsFromRows(rows: ParsedRow[], outOfRangeCount: number): Promise<{ imported: number; skipped: number }> {
  let imported = 0
  let skipped = 0

  let defaultAssetCategory = await prisma.accountCategory.findFirst({
    where: { type: 'asset', parentId: null },
  })
  if (!defaultAssetCategory) {
    const sort = await getNextAccountCategorySort('asset')
    defaultAssetCategory = await prisma.accountCategory.create({
      data: { name: '资产', type: 'asset', icon: 'wallet', sort },
    })
  }

  let defaultLiabilityCategory = await prisma.accountCategory.findFirst({
    where: { type: 'liability', parentId: null },
  })
  if (!defaultLiabilityCategory) {
    const sort = await getNextAccountCategorySort('liability')
    defaultLiabilityCategory = await prisma.accountCategory.create({
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

export async function importTransactionsFromCsv(buffer: Buffer, startDate?: Date, endDate?: Date): Promise<{ imported: number; skipped: number }> {
  const { rows, outOfRangeCount } = parseCsvFile(buffer, startDate, endDate)
  return importTransactionsFromRows(rows, outOfRangeCount)
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
  }
}

export interface ImportConfigResult {
  imported: {
    accountCategories: number
    accounts: number
    transactionCategories: number
  }
  updated: {
    accountCategories: number
    accounts: number
    transactionCategories: number
  }
  skipped: {
    accountCategories: number
    accounts: number
    transactionCategories: number
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
        const defaultCategory = await tx.accountCategory.findFirst({
          where: { type: account.type, parentId: null },
        })
        if (defaultCategory) {
          categoryId = defaultCategory.id
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
  mode: 'merge' | 'overwrite'
): Promise<ImportConfigResult> {
  const result: ImportConfigResult = {
    imported: { accountCategories: 0, accounts: 0, transactionCategories: 0 },
    updated: { accountCategories: 0, accounts: 0, transactionCategories: 0 },
    skipped: { accountCategories: 0, accounts: 0, transactionCategories: 0 },
    errors: [],
  }

  await prisma.$transaction(async (tx) => {
    if (mode === 'overwrite') {
      await tx.account.deleteMany()
      await tx.accountCategory.deleteMany({ where: { parentId: { not: null } } })
      await tx.accountCategory.deleteMany()
      await tx.transactionCategory.deleteMany({ where: { parentId: { not: null } } })
      await tx.transactionCategory.deleteMany()
    }

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
  })

  return result
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
  mode: 'merge' | 'overwrite'
): Promise<ImportBudgetResult> {
  const result: ImportBudgetResult = {
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  }

  await prisma.$transaction(async (tx) => {
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
  })

  return result
}
