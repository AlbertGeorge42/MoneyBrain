import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library.js'

// Mock prisma：报表只需要交易、分类、账户三张表
vi.mock('../../src/prisma.js', () => {
  const mockPrisma = {
    transaction: { findMany: vi.fn() },
    transactionCategory: { findMany: vi.fn() },
    account: { findMany: vi.fn() },
  }
  return {
    prisma: mockPrisma,
  }
})

// 余额批量计算走领域层，这里固定成空余额，避免把余额口径混进本用例
vi.mock('../../src/services/balance.service.js', () => ({
  calculateBalancesBatch: vi.fn(async () => new Map()),
}))

import { generateIncomeExpense } from '../../src/services/report/income-expense.service.js'
import { prisma } from '../../src/prisma.js'

const mockPrisma = prisma as any

const transaction = (overrides: Record<string, unknown>) => ({
  id: 'tx',
  type: 'expense',
  amount: new Decimal(0),
  fee: new Decimal(0),
  coupon: new Decimal(0),
  date: new Date(2026, 0, 15),
  accountId: 'acc',
  toAccountId: null,
  categoryId: null,
  relatedTransactionId: null,
  relatedType: null,
  excludeFromIncomeExpense: false,
  ...overrides,
})

describe('收入支出表口径', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.account.findMany.mockResolvedValue([])
    mockPrisma.transactionCategory.findMany.mockResolvedValue([
      { id: 'salary', name: '工资', type: 'income', parentId: null, sort: 0, icon: null, color: null },
      { id: 'food', name: '餐饮', type: 'expense', parentId: null, sort: 0, icon: null, color: null },
    ])
  })

  it('退款按原交易类型冲减对应侧', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      transaction({ id: '1', type: 'income', amount: new Decimal(1000), categoryId: 'salary' }),
      transaction({ id: '2', type: 'expense', amount: new Decimal(300), categoryId: 'food' }),
      transaction({
        id: '3',
        type: 'refund',
        amount: new Decimal(50),
        categoryId: 'food',
        relatedType: 'expense',
      }),
    ])

    const report = await generateIncomeExpense('2026-01-01', '2026-01-31')

    expect(report.income.actual).toBe(1000)
    expect(report.expense.actual).toBe(250)
    expect(report.balance.actual).toBe(750)
  })

  it('分类净额与总额一致，退款从同分类扣减', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      transaction({ id: '1', type: 'income', amount: new Decimal(1000), categoryId: 'salary' }),
      transaction({ id: '2', type: 'expense', amount: new Decimal(300), categoryId: 'food' }),
      transaction({
        id: '3',
        type: 'refund',
        amount: new Decimal(50),
        categoryId: 'food',
        relatedType: 'expense',
      }),
    ])

    const report = await generateIncomeExpense('2026-01-01', '2026-01-31')

    expect(report.expenseByCategory['餐饮']).toBe(250)
    const food = report.expenseCategoryDetails.find((item) => item.categoryId === 'food')
    expect(food?.actual).toBe(250)
  })

  it('未分类的交易作为独立节点出现，合计与总额一致', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      transaction({ id: '1', type: 'expense', amount: new Decimal(70), categoryId: null }),
    ])

    const report = await generateIncomeExpense('2026-01-01', '2026-01-31')

    expect(report.expense.actual).toBe(70)
    const uncategorized = report.expenseCategoryDetails.find(
      (item) => item.categoryId === 'uncategorized',
    )
    expect(uncategorized?.actual).toBe(70)
    expect(report.expenseByCategory['未分类']).toBe(70)
  })

  it('不计收支的交易默认不计入，可选包含', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      transaction({ id: '1', type: 'expense', amount: new Decimal(300), categoryId: 'food' }),
      transaction({
        id: '2',
        type: 'expense',
        amount: new Decimal(200),
        categoryId: 'food',
        excludeFromIncomeExpense: true,
      }),
    ])

    const excluded = await generateIncomeExpense('2026-01-01', '2026-01-31')
    expect(excluded.expense.actual).toBe(300)

    const included = await generateIncomeExpense('2026-01-01', '2026-01-31', false, true)
    expect(included.expense.actual).toBe(500)
  })
})
