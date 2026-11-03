import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library.js'

// Mock prisma：预算状态与下钻明细只用到 budget.findMany/findUnique、transaction.groupBy/findMany 与分类树查询
vi.mock('../../src/prisma.js', () => {
  const mockPrisma = {
    budget: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    transaction: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    transactionCategory: {
      findMany: vi.fn(),
    },
  }
  return {
    prisma: mockPrisma,
  }
})

import { getBudgetStatusesByIds, getBudgetUsageDetails } from '../../src/services/budget.service.js'
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

// 下钻明细的交易行 mock（getBudgetUsageDetails 只读这些字段并原样返回）
const detailRow = (overrides: Record<string, unknown> = {}) => ({
  id: 't1',
  type: 'expense',
  amount: 5000,
  accountId: 'A',
  toAccountId: null,
  categoryId: 'food',
  relatedTransactionId: null,
  relatedType: null,
  excludeFromIncomeExpense: false,
  ruleVersion: CURRENT_RULE_VERSION,
  date: new Date(),
  note: null,
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

  it('超支时使用率返回真实百分比，不截断（C3：超支 180% 返回 180）', async () => {
    mockPrisma.budget.findMany.mockResolvedValue([
      makeBudget({ amount: new Decimal(100) }),
    ])
    mockPrisma.transaction.groupBy.mockResolvedValue([
      usageRow({ type: 'expense', _sum: { amount: new Decimal(180) } }),
    ])

    const [status] = await getBudgetStatusesByIds(['b1'])

    expect(status.used).toBe(180)
    expect(status.percentage).toBe(180)
    expect(status.isOverBudget).toBe(true)
    expect(status.remaining).toBe(0)
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

describe('getBudgetUsageDetails（预算下钻与用量同源，C2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.transactionCategory.findMany.mockResolvedValue([{ id: 'food', parentId: null }])
  })

  it('下钻列表条数与合计 == 预算用量：排除其它账户、不计收支与类型不符', async () => {
    mockPrisma.budget.findUnique.mockResolvedValue(makeBudget())
    mockPrisma.transaction.findMany.mockResolvedValue([
      detailRow({ id: 't1', type: 'expense', amount: 5000 }),
      detailRow({ id: 't2', type: 'refund', relatedType: 'expense', amount: 2000 }),
      // 其它账户的同分类支出：不计入
      detailRow({ id: 't3', accountId: 'B', amount: 3000 }),
      // 不计收支：不计入
      detailRow({ id: 't4', excludeFromIncomeExpense: true, amount: 4000 }),
      // 类型不符（支出预算不统计收入）：不计入
      detailRow({ id: 't5', type: 'income', amount: 6000 }),
    ])

    const details = await getBudgetUsageDetails('b1')

    expect(details.count).toBe(2)
    expect(details.list.map((item) => item.transaction.id)).toEqual(['t1', 't2'])
    expect(details.list[0].signedAmount).toBe(5000)
    expect(details.list[1].signedAmount).toBe(-2000)
    expect(details.total).toBe(3000)
    expect(details.used).toBe(3000)

    // 同一份数据的聚合口径：预算用量与下钻合计相等（C2 验收）
    mockPrisma.budget.findMany.mockResolvedValue([makeBudget()])
    mockPrisma.transaction.groupBy.mockResolvedValue([
      usageRow({ type: 'expense', _sum: { amount: new Decimal(5000) } }),
      usageRow({ type: 'refund', relatedType: 'expense', _sum: { amount: new Decimal(2000) } }),
    ])
    const [status] = await getBudgetStatusesByIds(['b1'])
    expect(status.used).toBe(details.used)
  })

  it('跨期退款让明细合计为负时，已用夹到 0（与预算状态同款下限）', async () => {
    mockPrisma.budget.findUnique.mockResolvedValue(makeBudget())
    mockPrisma.transaction.findMany.mockResolvedValue([
      detailRow({ id: 'r1', type: 'refund', relatedType: 'expense', amount: 8000 }),
    ])

    const details = await getBudgetUsageDetails('b1')

    expect(details.count).toBe(1)
    expect(details.total).toBe(-8000)
    expect(details.used).toBe(0)
  })
})
