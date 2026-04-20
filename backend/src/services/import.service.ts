import { prisma } from '../index.js'
import { getNextAccountCategorySort, getNextAccountSort, getNextTransactionCategorySort } from './sort.service.js'

interface AccountCache {
  id: string
  type: string
  categoryId: string | null
}

interface ParsedRow {
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
    return ctx.accountCache[accountName]
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
        balance: 0,
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

  let categoryId: string | null = null
  const cacheKey = category2 ? `${category1}/${category2}` : category1
  for (const possibleType of ['expense', 'income'] as const) {
    const typedCacheKey = `${possibleType}:${cacheKey}`
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
    },
  })

  ctx.idMapping[csvId] = transaction.id
  return true
}

export async function importTransactionsFromRows(rows: ParsedRow[], startDate?: Date, endDate?: Date): Promise<{ imported: number; skipped: number }> {
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

  const isInRange = (row: ParsedRow): boolean => {
    if (!startDate && !endDate) return true
    
    const rowDate = new Date(row.time)
    if (isNaN(rowDate.getTime())) return false
    
    if (startDate && rowDate < startDate) return false
    if (endDate && rowDate > endDate) return false
    
    return true
  }

  const refundRows = rows.filter(r => r.typeStr === '退款' && isInRange(r))
  const normalRows = rows.filter(r => r.typeStr !== '退款' && isInRange(r))
  const outOfRangeCount = rows.filter(r => !isInRange(r)).length

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

export type { ParsedRow }
