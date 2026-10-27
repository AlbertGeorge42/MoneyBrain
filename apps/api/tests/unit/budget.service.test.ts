import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library.js'

// Mock prisma：预算状态只用到 budget.findMany、transaction.groupBy 与分类树查询
vi.mock('../../src/prisma.js', () => {
  const mockPrisma = {
    budget: {
      findMany: vi.fn(),
    },
    transaction: {
      groupBy: vi.fn(),
    },
    transactionCategory: {
      findMany: vi.fn(),
    },
  }
  return {
    prisma: mockPrisma,
  }
})

import { getBudgetStatusesByIds } from '../../src/services/budget.service.js'
import { prisma } from '../../src/prisma.js'
import { CURRENT_RULE_VERSION } from '../../../../packages/domain/src/index.js'

const mockPrisma = prisma as any

const makeBudget = (overrides: Record<string, unknown> = {}) => ({
  id: 'b1',
  name: '餐饮预算',
  type: 'expense',
  amount: new Decimal(100),
  period: 'monthly',
  startDate: new Date(),
  endDate: null,
  transactionTime: null,
  note: null,
  isActive: true,
  accountId: 'A',
  toAccountId: null,
  categoryId: 'food',
  account: null,
  toAccount: null,
  category: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const usageRow = (overrides: Record<string, unknown> = {}) => ({
  accountId: 'A',
  toAccountId: null,
  categoryId: 'food',
  type: 'expense',
  relatedType: null,
  excludeFromIncomeExpense: false,
  ruleVersion: CURRENT_RULE_VERSION,
  _sum: { amount: new Decimal(50) },
  ...overrides,
})

describe('getBudgetStatusesByIds（预算用量口径）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.transactionCategory.findMany.mockResolvedValue([{ id: 'food', parentId: null }])
  })

  it('应该按支出减去退款算出已用', async () => {
    mockPrisma.budget.findMany.mockResolvedValue([makeBudget()])
    mockPrisma.transaction.groupBy.mockResolvedValue([
      usageRow({ type: 'expense', _sum: { amount: new Decimal(50) } }),
      usageRow({ type: 'refund', relatedType: 'expense', _sum: { amount: new Decimal(20) } }),
    ])

    const [status] = await getBudgetStatusesByIds(['b1'])

    expect(status.used).toBe(30)
    expect(status.percentage).toBe(30)
    expect(status.remaining).toBe(70)
    expect(status.isOverBudget).toBe(false)
  })

  it('跨期退款时已用夹到 0，剩余不得超过额度', async () => {
    mockPrisma.budget.findMany.mockResolvedValue([makeBudget()])
    // 本期只有退款（上期支出不在本期）
    mockPrisma.transaction.groupBy.mockResolvedValue([
      usageRow({ type: 'refund', relatedType: 'expense', _sum: { amount: new Decimal(80) } }),
    ])

    const [status] = await getBudgetStatusesByIds(['b1'])

    expect(status.used).toBe(0)
    expect(status.percentage).toBe(0)
    expect(status.remaining).toBe(100)
    expect(status.isOverBudget).toBe(false)
  })

  it('转账预算只统计绑定的那一对账户之间的转账', async () => {
    mockPrisma.budget.findMany.mockResolvedValue([
      makeBudget({
        id: 'b2',
        type: 'transfer',
        categoryId: 'move',
        accountId: 'A',
        toAccountId: 'B',
      }),
    ])
    mockPrisma.transaction.groupBy.mockResolvedValue([
      usageRow({ type: 'transfer', categoryId: 'move', toAccountId: 'B', _sum: { amount: new Decimal(100) } }),
      // 其它账户转入同一目标账户
      usageRow({ type: 'transfer', categoryId: 'move', accountId: 'C', toAccountId: 'B', _sum: { amount: new Decimal(30) } }),
      // 同一转出账户转往其它账户
      usageRow({ type: 'transfer', categoryId: 'move', accountId: 'A', toAccountId: 'D', _sum: { amount: new Decimal(20) } }),
    ])

    const [status] = await getBudgetStatusesByIds(['b2'])

    expect(status.used).toBe(100)
  })

  it('未分类的交易不计入分类预算', async () => {
    mockPrisma.budget.findMany.mockResolvedValue([makeBudget()])
    mockPrisma.transaction.groupBy.mockResolvedValue([
      usageRow({ categoryId: null, _sum: { amount: new Decimal(50) } }),
    ])

    const [status] = await getBudgetStatusesByIds(['b1'])

    expect(status.used).toBe(0)
  })

  it('同期间的多个预算应该只查一次', async () => {
    mockPrisma.budget.findMany.mockResolvedValue([
      makeBudget({ id: 'b1' }),
      makeBudget({ id: 'b2', categoryId: 'food-child' }),
      makeBudget({ id: 'b3', categoryId: 'food-grandchild' }),
    ])
    mockPrisma.transaction.groupBy.mockResolvedValue([])

    const statuses = await getBudgetStatusesByIds(['b1', 'b2', 'b3'])

    expect(statuses).toHaveLength(3)
    expect(mockPrisma.transaction.groupBy).toHaveBeenCalledTimes(1)
  })
})
