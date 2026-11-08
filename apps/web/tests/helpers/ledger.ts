import type { Ledger } from '@/features/overview/model'

/**
 * 测试用账本工厂：默认空壳，账户 / 分类 / 预算 / 流水由各用例按需覆盖。
 *
 * 只统一四段空数组的骨架，不预设任何业务数据——预设默认账户会让不同测试
 * 悄悄共享同一份金额口径。
 */
export function makeLedger(overrides: Partial<Ledger> = {}): Ledger {
  return {
    accounts: [],
    categories: [],
    budgets: [],
    transactions: [],
    ...overrides,
  }
}
