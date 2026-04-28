import { Decimal } from '@prisma/client/runtime/library.js'

/**
 * 预算工厂函数
 */
export function createBudgetFactory(overrides: Partial<{
  id: string
  name: string
  amount: number
  period: string
  startDate: Date
  endDate: Date | null
  categoryId: string | null
}> = {}) {
  return {
    id: overrides.id || `bdg-${Math.random().toString(36).substring(2, 9)}`,
    name: overrides.name || '测试预算',
    amount: new Decimal(overrides.amount ?? 1000),
    period: overrides.period || 'monthly',
    startDate: overrides.startDate || new Date(),
    endDate: overrides.endDate ?? null,
    categoryId: overrides.categoryId ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/**
 * 预算警报工厂函数
 */
export function createBudgetAlertFactory(overrides: Partial<{
  id: string
  budgetId: string
  threshold: number
  isNotified: boolean
}> = {}) {
  return {
    id: overrides.id || `alr-${Math.random().toString(36).substring(2, 9)}`,
    budgetId: overrides.budgetId || 'default-budget-id',
    threshold: overrides.threshold ?? 80,
    isNotified: overrides.isNotified ?? false,
    createdAt: new Date(),
  }
}
