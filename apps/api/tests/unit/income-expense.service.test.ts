import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library.js'

const { mockPrisma: mockPrismaRef, balanceRef, rowsRef } = vi.hoisted(() => ({
  mockPrisma: {
    transaction: { findMany: vi.fn() },
    transactionCategory: { findMany: vi.fn() },
    account: { findMany: vi.fn() },
  },
  balanceRef: {
    current: { get: (_id: string, _date: Date) => 0 } as { get: (id: string, date: Date) => number },
  },
  rowsRef: { queue: [] as unknown[][] },
}))

vi.mock('../../src/prisma.js', () => ({ prisma: mockPrismaRef }))

// 余额批量计算走领域层，这里注入可控的余额，让对账条可以被断言
vi.mock('../../src/services/balance.service.js', () => ({
  calculateBalancesBatch: vi.fn(async () => balanceRef.current),
}))

import { generateIncomeExpense } from '../../src/services/report/income-expense.service.js'

const mockPrisma = mockPrismaRef as any

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

/** 余额随日期切换：期初 0、期末 750（与 1000 收入 − 250 净支出 对得上） */
const setBalances = (startValue: number, endValue: number) => {
  const endExclusive = new Date(2026, 0, 31).getTime()
  balanceRef.current = {
    get: (_id: string, date: Date) => (date.getTime() < endExclusive ? startValue : endValue),
  }
}

describe('收入支出表口径', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rowsRef.queue = []
    mockPrisma.transaction.findMany.mockImplementation(async () => rowsRef.queue.shift() ?? [])
    mockPrisma.account.findMany.mockResolvedValue([
      { id: 'acc', name: '现金', type: 'asset', initialBalance: new Decimal(0), initialBalanceDate: null },
    ])
    mockPrisma.transactionCategory.findMany.mockResolvedValue([
      { id: 'salary', name: '工资', type: 'income', parentId: null, sort: 0, icon: null, color: null },
      { id: 'food', name: '餐饮', type: 'expense', parentId: null, sort: 0, icon: null, color: null },
    ])
  })

  it('退款按原交易类型冲减对应侧', async () => {
    rowsRef.queue.push([
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
    rowsRef.queue.push([])
    setBalances(0, 750)

    const report = await generateIncomeExpense('2026-01-01', '2026-01-31')

    expect(report.income.actual).toBe(1000)
    expect(report.expense.actual).toBe(250)
    expect(report.balance.actual).toBe(750)
  })

  it('对账条在数字自洽时差额为 0', async () => {
    rowsRef.queue.push([
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
    rowsRef.queue.push([])
    setBalances(0, 750)

    const report = await generateIncomeExpense('2026-01-01', '2026-01-31')

    expect(report.reconciliation.startNetWorth).toBe(0)
    expect(report.reconciliation.netIncome).toBe(1000)
    expect(report.reconciliation.netExpense).toBe(250)
    expect(report.reconciliation.endNetWorth).toBe(750)
    expect(report.reconciliation.other).toBe(0)
    expect(report.reconciliation.difference).toBe(0)
  })

  it('余额与收支对不上时要给出差额', async () => {
    rowsRef.queue.push([
      transaction({ id: '1', type: 'income', amount: new Decimal(1000), categoryId: 'salary' }),
      transaction({ id: '2', type: 'expense', amount: new Decimal(300), categoryId: 'food' }),
    ])
    rowsRef.queue.push([])
    setBalances(0, 800)

    const report = await generateIncomeExpense('2026-01-01', '2026-01-31')

    expect(report.reconciliation.difference).toBe(100)
  })

  it('分类净额与总额一致，退款从同分类扣减', async () => {
    rowsRef.queue.push([
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
    rowsRef.queue.push([])
    setBalances(0, 750)

    const report = await generateIncomeExpense('2026-01-01', '2026-01-31')

    expect(report.expenseByCategory['餐饮']).toBe(250)
    const food = report.expenseCategoryDetails.find((item) => item.categoryId === 'food')
    expect(food?.actual).toBe(250)
  })

  it('未分类的交易作为独立节点出现，合计与总额一致', async () => {
    rowsRef.queue.push([transaction({ id: '1', type: 'expense', amount: new Decimal(70), categoryId: null })])
    rowsRef.queue.push([])
    setBalances(0, -70)

    const report = await generateIncomeExpense('2026-01-01', '2026-01-31')

    expect(report.expense.actual).toBe(70)
    const uncategorized = report.expenseCategoryDetails.find(
      (item) => item.categoryId === 'uncategorized',
    )
    expect(uncategorized?.actual).toBe(70)
    expect(report.expenseByCategory['未分类']).toBe(70)
  })

  it('不计收支的交易默认不计入，可选包含', async () => {
    const rows = [
      transaction({ id: '1', type: 'expense', amount: new Decimal(300), categoryId: 'food' }),
      transaction({
        id: '2',
        type: 'expense',
        amount: new Decimal(200),
        categoryId: 'food',
        excludeFromIncomeExpense: true,
      }),
    ]
    rowsRef.queue.push(rows)
    rowsRef.queue.push([])
    rowsRef.queue.push(rows)
    rowsRef.queue.push([])
    setBalances(0, -300)

    const excluded = await generateIncomeExpense('2026-01-01', '2026-01-31')
    expect(excluded.expense.actual).toBe(300)

    const included = await generateIncomeExpense('2026-01-01', '2026-01-31', false, true)
    expect(included.expense.actual).toBe(500)
  })
})
