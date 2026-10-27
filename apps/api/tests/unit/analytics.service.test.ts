import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library.js'
import { CURRENT_RULE_VERSION } from '../../../../packages/domain/src/index.js'
import {
  getCategoryBreakdown,
  getDashboardSummary,
  getTrends,
} from '../../src/services/analytics.service.js'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    transaction: { findMany: vi.fn() },
    transactionCategory: { findMany: vi.fn() },
  },
}))

vi.mock('../../src/prisma.js', () => ({ prisma: mockPrisma }))

function transaction(overrides: Record<string, unknown>) {
  return {
    id: 'tx',
    type: 'expense',
    ruleVersion: CURRENT_RULE_VERSION,
    amount: new Decimal(0),
    fee: null,
    coupon: null,
    date: new Date(2026, 9, 1),
    accountId: 'acc',
    toAccountId: null,
    categoryId: null,
    relatedTransactionId: null,
    relatedType: null,
    excludeFromIncomeExpense: false,
    ...overrides,
  }
}

describe('analytics.service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 15))
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('Dashboard 本月/上月收支会冲减退款', async () => {
    mockPrisma.transaction.findMany
      .mockResolvedValueOnce([
        transaction({ type: 'income', amount: new Decimal(1000) }),
        transaction({ type: 'expense', amount: new Decimal(300) }),
        transaction({
          id: 'refund-expense',
          type: 'refund',
          amount: new Decimal(50),
          relatedType: 'expense',
        }),
        transaction({
          id: 'refund-income',
          type: 'refund',
          amount: new Decimal(100),
          relatedType: 'income',
          date: new Date(2026, 8, 20),
        }),
        transaction({ type: 'income', amount: new Decimal(2000), date: new Date(2026, 8, 1) }),
        transaction({ type: 'income', amount: new Decimal(999), excludeFromIncomeExpense: true }),
      ])
      .mockResolvedValueOnce([])

    const result = await getDashboardSummary()

    expect(result.thisMonth).toEqual({ income: 1000, expense: 250, balance: 750 })
    expect(result.lastMonth).toEqual({ income: 1900, expense: 0 })
  })

  it('趋势按原交易类型冲减退款', async () => {
    mockPrisma.transaction.findMany.mockResolvedValueOnce([
      transaction({ type: 'expense', amount: new Decimal(300) }),
      transaction({
        type: 'refund',
        amount: new Decimal(50),
        relatedType: 'expense',
      }),
    ])

    const result = await getTrends('expense')
    const current = result.find((item) => item.label === '2026-10')

    expect(current?.amount).toBe(250)
  })

  it('分类占比按下钻层级聚合并冲减退款', async () => {
    mockPrisma.transactionCategory.findMany.mockResolvedValue([
      { id: 'food', name: '餐饮', type: 'expense', parentId: null },
      { id: 'lunch', name: '午餐', type: 'expense', parentId: 'food' },
      { id: 'salary', name: '工资', type: 'income', parentId: null },
    ])
    mockPrisma.transaction.findMany.mockResolvedValue([
      transaction({ amount: new Decimal(300), categoryId: 'lunch' }),
      transaction({
        type: 'refund',
        amount: new Decimal(50),
        categoryId: 'lunch',
        relatedType: 'expense',
      }),
      transaction({ type: 'income', amount: new Decimal(1000), categoryId: 'salary' }),
    ])

    const breakdown = await getCategoryBreakdown('expense')
    expect(breakdown).toEqual([
      { name: '餐饮', value: 250, categoryId: 'food', hasChildren: true },
    ])

    const detail = await getCategoryBreakdown('expense', undefined, undefined, 'food')
    expect(detail).toEqual([
      { name: '午餐', value: 250, categoryId: 'lunch', hasChildren: false },
    ])
  })

  it('分类占比未指定期间时默认近 12 个月', async () => {
    mockPrisma.transactionCategory.findMany.mockResolvedValue([
      { id: 'food', name: '餐饮', type: 'expense', parentId: null },
    ])
    mockPrisma.transaction.findMany.mockResolvedValue([])

    await getCategoryBreakdown('expense')

    const where = mockPrisma.transaction.findMany.mock.calls[0][0].where
    expect(where.date).toBeDefined()
    // 系统时间 2026-10 → 窗口 [2025-10-01, 2026-11-01)
    expect(where.date.gte.getFullYear()).toBe(2025)
    expect(where.date.lt.getFullYear()).toBe(2026)
    expect(where.date.lt.getMonth()).toBe(10)
  })
})
