import { Decimal } from '@prisma/client/runtime/library.js'

/**
 * 预算工厂函数
 */
export function createBudgetFactory(overrides: Partial<{
  id: string
  name: string
  type: string
  amount: number
  period: string
  startDate: Date
  endDate: Date | null
  note: string | null
  isActive: boolean
  accountId: string
  toAccountId: string | null
  categoryId: string | null
}> = {}) {
  return {
    id: overrides.id || `bdg-${Math.random().toString(36).substring(2, 9)}`,
    name: overrides.name || '测试预算',
    type: overrides.type || 'expense',
    amount: new Decimal(overrides.amount ?? 1000),
    period: overrides.period || 'monthly',
    startDate: overrides.startDate || new Date(),
    endDate: overrides.endDate ?? null,
    note: overrides.note ?? null,
    isActive: overrides.isActive ?? true,
    accountId: overrides.accountId || 'test-account-id',
    toAccountId: overrides.toAccountId ?? null,
    categoryId: overrides.categoryId ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}