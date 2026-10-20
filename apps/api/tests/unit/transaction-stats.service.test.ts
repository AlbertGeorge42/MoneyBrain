import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library.js'

// Mock prisma：getTransactionStats 只用到 transaction.aggregate 与 transaction.count
vi.mock('../../src/prisma.js', () => {
  const mockPrisma = {
    transaction: {
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    account: {
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

import { getTransactionStats } from '../../src/services/transaction.service.js'
import { prisma } from '../../src/prisma.js'

const mockPrisma = prisma as any

describe('getTransactionStats（不计收支过滤）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该在 income/expense/refund/transfer 的 where 中排除不计收支交易', async () => {
    mockPrisma.transaction.aggregate
      .mockResolvedValueOnce({ _sum: { amount: new Decimal(1000) } }) // income
      .mockResolvedValueOnce({ _sum: { amount: new Decimal(500) } }) // expense
      .mockResolvedValueOnce({ _sum: { amount: new Decimal(100), fee: new Decimal(0) } }) // income refund
      .mockResolvedValueOnce({ _sum: { amount: new Decimal(0), fee: new Decimal(0) } }) // expense refund
    mockPrisma.transaction.count.mockResolvedValue(2)

    const result = await getTransactionStats()

    // 4 次 aggregate 都应带 excludeFromIncomeExpense: false
    const aggregateCalls = mockPrisma.transaction.aggregate.mock.calls as any[]
    expect(aggregateCalls).toHaveLength(4)
    for (const call of aggregateCalls) {
      expect(call[0].where.excludeFromIncomeExpense).toBe(false)
    }
    // transfer count 也应排除不计收支交易
    expect(mockPrisma.transaction.count).toHaveBeenCalledTimes(1)
    expect(mockPrisma.transaction.count.mock.calls[0][0].where.excludeFromIncomeExpense).toBe(false)

    expect(result.income).toBe(900) // 1000 - 100（收入退款）
    expect(result.expense).toBe(500) // 500 - 0（支出退款）
    expect(result.refund).toBe(100)
    expect(result.transferCount).toBe(2)
  })
})
