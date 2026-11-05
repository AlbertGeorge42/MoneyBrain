import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library.js'

// Mock prisma：updateIncomeExpense 走 repository（findUnique / count / update）
// 与审计事件写入（$transaction + auditEvent.create）
vi.mock('../../src/db/sync-version.js', () => ({
  createSyncVersion: vi.fn(async () => ({ rev: 1, vv: '{"device":1}' })),
  updateSyncVersion: vi.fn(async () => ({ rev: 2, vv: '{"device":2}' })),
}))

vi.mock('../../src/prisma.js', () => {
  const mockPrisma = {
    transaction: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue({ id: 'event-1' }),
    },
    $transaction: vi.fn((callback: (client: unknown) => unknown) => callback(mockPrisma)),
  }
  return {
    prisma: mockPrisma,
  }
})

import {
  createIncomeExpense,
  updateIncomeExpense,
} from '../../src/services/transaction.service.js'
import { prisma } from '../../src/prisma.js'

const mockPrisma = prisma as any

const existingTransaction = (overrides: Record<string, unknown> = {}) => ({
  id: 'tx-1',
  type: 'income',
  amount: new Decimal(100),
  fee: new Decimal(0),
  coupon: new Decimal(0),
  date: new Date(2026, 0, 5),
  note: null,
  accountId: 'acc-1',
  toAccountId: null,
  categoryId: 'cat-1',
  relatedTransactionId: null,
  relatedType: null,
  excludeFromIncomeExpense: false,
  importKey: null,
  createdAt: new Date(),
  ...overrides,
})

describe('updateIncomeExpense（改类型保护）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('存在退款时应该拒绝修改交易类型', async () => {
    mockPrisma.transaction.findUnique.mockResolvedValue(existingTransaction())
    mockPrisma.transaction.count.mockResolvedValue(1)

    await expect(
      updateIncomeExpense('tx-1', { type: 'expense' } as never)
    ).rejects.toThrow(/退款/)

    expect(mockPrisma.transaction.update).not.toHaveBeenCalled()
  })

  it('没有退款时允许修改交易类型', async () => {
    // findUnique 依次：读取旧交易 → 读 rev/vv（同步版本戳）→ 更新后带关联返回
    mockPrisma.transaction.findUnique
      .mockResolvedValueOnce(existingTransaction())
      .mockResolvedValueOnce(existingTransaction({ type: 'expense' }))
      .mockResolvedValueOnce(existingTransaction({ type: 'expense' }))
    mockPrisma.transaction.count.mockResolvedValue(0)
    mockPrisma.transaction.update.mockResolvedValue(existingTransaction({ type: 'expense' }))

    const result = await updateIncomeExpense('tx-1', { type: 'expense' } as never)

    expect(result.type).toBe('expense')
    expect(mockPrisma.transaction.update).toHaveBeenCalledTimes(1)
  })

  it('类型没有变化时不需要检查退款', async () => {
    mockPrisma.transaction.findUnique.mockResolvedValue(existingTransaction())
    mockPrisma.transaction.update.mockResolvedValue(existingTransaction())

    await updateIncomeExpense('tx-1', { amount: 200 } as never)

    expect(mockPrisma.transaction.count).not.toHaveBeenCalled()
    expect(mockPrisma.transaction.update).toHaveBeenCalledTimes(1)
  })
})

describe('支出金额写入归一化（B2）', () => {
  const expenseBase = {
    type: 'expense' as const,
    amount: 0,
    date: new Date(2026, 10, 5),
    accountId: 'acc-1',
    categoryId: 'cat-1',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.transaction.create.mockImplementation(async ({ data }: { data: unknown }) => data)
  })

  it('创建支出时负数输入按绝对值落库', async () => {
    await createIncomeExpense({ ...expenseBase, amount: -1500 })

    const createCall = mockPrisma.transaction.create.mock.calls[0][0]
    expect(createCall.data.amount).toBe(1500n)
  })

  it('创建收入时保留原符号（只有支出需要归一化）', async () => {
    await createIncomeExpense({ ...expenseBase, type: 'income', amount: -1500 })

    const createCall = mockPrisma.transaction.create.mock.calls[0][0]
    expect(createCall.data.amount).toBe(-1500n)
  })

  it('更新支出为负数时同样转正，预算/导出拿到正数', async () => {
    mockPrisma.transaction.findUnique
      .mockResolvedValueOnce(existingTransaction({ type: 'expense' }))
      .mockResolvedValueOnce(existingTransaction({ type: 'expense' }))
      .mockResolvedValueOnce(existingTransaction({ type: 'expense' }))
    mockPrisma.transaction.count.mockResolvedValue(0)
    mockPrisma.transaction.update.mockResolvedValue(existingTransaction({ type: 'expense' }))

    await updateIncomeExpense('tx-1', { amount: -200 } as never)

    const updateCall = mockPrisma.transaction.update.mock.calls[0][0]
    expect(updateCall.data.amount).toBe(200n)
  })
})
