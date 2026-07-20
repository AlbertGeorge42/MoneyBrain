import { Decimal } from '@prisma/client/runtime/library.js'

/**
 * 交易分类工厂函数
 */
export function createTransactionCategoryFactory(overrides: Partial<{
  id: string
  name: string
  type: string
  icon: string | null
  color: string | null
  cashFlowType: string | null
  parentId: string | null
  sort: number
}> = {}) {
  return {
    id: overrides.id || `tc-${Math.random().toString(36).substring(2, 9)}`,
    name: overrides.name || '测试交易分类',
    type: overrides.type || 'expense',
    icon: overrides.icon ?? null,
    color: overrides.color ?? null,
    cashFlowType: overrides.cashFlowType ?? null,
    parentId: overrides.parentId ?? null,
    sort: overrides.sort ?? 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/**
 * 交易记录工厂函数
 */
export function createTransactionFactory(overrides: Partial<{
  id: string
  type: string
  amount: number
  fee: number
  coupon: number
  date: Date
  note: string | null
  accountId: string
  toAccountId: string | null
  categoryId: string | null
  relatedTransactionId: string | null
}> = {}) {
  return {
    id: overrides.id || `txn-${Math.random().toString(36).substring(2, 9)}`,
    type: overrides.type || 'expense',
    amount: new Decimal(overrides.amount ?? 100),
    fee: new Decimal(overrides.fee ?? 0),
    coupon: new Decimal(overrides.coupon ?? 0),
    date: overrides.date || new Date(),
    note: overrides.note ?? null,
    accountId: overrides.accountId || 'default-account-id',
    toAccountId: overrides.toAccountId ?? null,
    categoryId: overrides.categoryId ?? null,
    relatedTransactionId: overrides.relatedTransactionId ?? null,
    createdAt: new Date(),
  }
}

/**
 * 创建收入交易
 */
export function createIncomeTransactionFactory(overrides: Parameters<typeof createTransactionFactory>[0] = {}) {
  return createTransactionFactory({
    type: 'income',
    amount: 500,
    ...overrides,
  })
}

/**
 * 创建支出交易
 */
export function createExpenseTransactionFactory(overrides: Parameters<typeof createTransactionFactory>[0] = {}) {
  return createTransactionFactory({
    type: 'expense',
    amount: 100,
    ...overrides,
  })
}

/**
 * 创建转账交易
 */
export function createTransferTransactionFactory(overrides: Parameters<typeof createTransactionFactory>[0] = {}) {
  return createTransactionFactory({
    type: 'transfer',
    amount: 200,
    ...overrides,
  })
}

/**
 * 创建多个交易
 */
export function createTransactionsFactory(count: number, overrides: Parameters<typeof createTransactionFactory>[0] = {}) {
  return Array.from({ length: count }, () => createTransactionFactory(overrides))
}
