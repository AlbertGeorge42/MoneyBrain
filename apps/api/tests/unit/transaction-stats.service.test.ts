import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library.js'
import { CURRENT_RULE_VERSION } from '../../../../packages/domain/src/index.js'

// Mock prisma：getTransactionStats 只用到 transaction.groupBy 与 transaction.count
vi.mock('../../src/prisma.js', () => {
  const mockPrisma = {
    transaction: {
      groupBy: vi.fn(),
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

/**
 * 聚合行夹具：service 侧用 SQL 按「类型 × 退款原类型 × 不计收支 × 口径版本」分组，
 * 领域层再按各自版本解释。
 */
const group = (overrides: Record<string, unknown> = {}) => ({
  type: 'expense',
  relatedType: null,
  excludeFromIncomeExpense: false,
  ruleVersion: CURRENT_RULE_VERSION,
  _sum: { amount: new Decimal(0) },
  ...overrides,
})

describe('getTransactionStats（收支口径走领域层）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('退款按原交易类型冲减对应侧，不计收支的交易不计入', async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([
      group({ type: 'income', _sum: { amount: new Decimal(1000) } }),
      group({ type: 'expense', _sum: { amount: new Decimal(500) } }),
      group({ type: 'refund', relatedType: 'income', _sum: { amount: new Decimal(100) } }),
      group({ type: 'refund', relatedType: 'expense', _sum: { amount: new Decimal(50) } }),
      group({
        type: 'income',
        excludeFromIncomeExpense: true,
        _sum: { amount: new Decimal(999) },
      }),
    ])
    mockPrisma.transaction.count.mockResolvedValue(2)

    const result = await getTransactionStats()

    expect(result.income).toBe(900) // 1000 − 100（收入退款）
    expect(result.expense).toBe(450) // 500 − 50（支出退款）
    expect(result.refund).toBe(150) // 100 + 50
    expect(result.balance).toBe(450) // 900 − 450
    expect(result.transferCount).toBe(2)
  })

  it('转账不进入收支统计，只计入转账笔数', async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([
      group({ type: 'transfer', _sum: { amount: new Decimal(300) } }),
    ])
    mockPrisma.transaction.count.mockResolvedValue(1)

    const result = await getTransactionStats()

    expect(result.income).toBe(0)
    expect(result.expense).toBe(0)
    expect(result.balance).toBe(0)
    expect(result.transferCount).toBe(1)
  })

  it('不同口径版本的交易各按自己的版本解释', async () => {
    mockPrisma.transaction.groupBy.mockResolvedValue([
      group({ type: 'income', _sum: { amount: new Decimal(1000) } }),
      // v1 的退款冲减收入
      group({
        type: 'refund',
        relatedType: 'income',
        ruleVersion: CURRENT_RULE_VERSION,
        _sum: { amount: new Decimal(100) },
      }),
      // 另一个版本的退款（此处为未知版本，应当报错而不是被静默解释）
      group({
        type: 'refund',
        relatedType: 'expense',
        ruleVersion: CURRENT_RULE_VERSION + 1,
        _sum: { amount: new Decimal(30) },
      }),
    ])
    mockPrisma.transaction.count.mockResolvedValue(0)

    // 未知版本直接失败——用当前规则解释旧交易等于悄悄改写历史
    await expect(getTransactionStats()).rejects.toThrow(/未知账务口径版本/)
  })
})
