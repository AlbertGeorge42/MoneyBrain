import { Decimal } from '@prisma/client/runtime/library.js'

/**
 * 账户分类工厂函数
 */
export function createAccountCategoryFactory(overrides: Partial<{
  id: string
  name: string
  type: string
  icon: string | null
  parentId: string | null
  sort: number
  isCashEquivalent: boolean
  isInvestment: boolean
}> = {}) {
  return {
    id: overrides.id || `cat-${Math.random().toString(36).substring(2, 9)}`,
    name: overrides.name || '测试分类',
    type: overrides.type || 'asset',
    icon: overrides.icon ?? null,
    parentId: overrides.parentId ?? null,
    sort: overrides.sort ?? 0,
    isCashEquivalent: overrides.isCashEquivalent ?? false,
    isInvestment: overrides.isInvestment ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/**
 * 账户工厂函数
 */
export function createAccountFactory(overrides: Partial<{
  id: string
  name: string
  type: string
  balance: number
  initialBalance: number
  initialBalanceDate: Date | null
  icon: string | null
  color: string | null
  categoryId: string | null
  sort: number
}> = {}) {
  const initialBalance = overrides.initialBalance ?? overrides.balance ?? 0
  return {
    id: overrides.id || `acc-${Math.random().toString(36).substring(2, 9)}`,
    name: overrides.name || '测试账户',
    type: overrides.type || 'asset',
    balance: new Decimal(overrides.balance ?? 0),
    initialBalance: new Decimal(initialBalance),
    initialBalanceDate: overrides.initialBalanceDate ?? null,
    icon: overrides.icon ?? null,
    color: overrides.color ?? null,
    categoryId: overrides.categoryId ?? null,
    sort: overrides.sort ?? 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/**
 * 创建多个账户
 */
export function createAccountsFactory(count: number, overrides: Parameters<typeof createAccountFactory>[0] = {}) {
  return Array.from({ length: count }, (_, index) =>
    createAccountFactory({ ...overrides, sort: index })
  )
}
