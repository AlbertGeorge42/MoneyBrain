import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library.js'

vi.mock('../../src/prisma.js', () => {
  const mockPrisma = {
    account: {
      findMany: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
    },
  }

  return {
    prisma: mockPrisma,
  }
})

import { prisma } from '../../src/prisma.js'
import { calculateBalancesBatch } from '../../src/services/balance.service.js'
import { CURRENT_RULE_VERSION } from '../../../../packages/domain/src/index.js'

type MockPrisma = {
  account: { findMany: ReturnType<typeof vi.fn> }
  transaction: { findMany: ReturnType<typeof vi.fn> }
}

function account(overrides: Record<string, unknown>) {
  return {
    id: 'A',
    name: '账户A',
    type: 'asset',
    initialBalance: new Decimal(0),
    initialBalanceDate: null,
    createdAt: new Date('2024-01-01T00:00:00'),
    ...overrides,
  }
}

function transaction(overrides: Record<string, unknown>) {
  return {
    id: 't',
    type: 'expense',
    ruleVersion: CURRENT_RULE_VERSION,
    amount: new Decimal(0),
    fee: new Decimal(0),
    coupon: new Decimal(0),
    date: new Date('2025-01-01T10:00:00'),
    accountId: 'A',
    toAccountId: null,
    categoryId: null,
    relatedTransactionId: null,
    relatedType: null,
    excludeFromIncomeExpense: false,
    ...overrides,
  }
}

describe('balance.service - calculateBalancesBatch', () => {
  const mockPrisma = prisma as unknown as MockPrisma

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('无期初日期时，统计全部历史交易', async () => {
    mockPrisma.account.findMany.mockResolvedValue([
      account({ initialBalance: new Decimal(1000) }),
    ])
    mockPrisma.transaction.findMany.mockResolvedValue([
      transaction({ id: 't1', amount: new Decimal(200), date: new Date('2024-12-10T10:00:00') }),
      transaction({ id: 't2', amount: new Decimal(100), date: new Date('2024-12-20T10:00:00') }),
      transaction({ id: 't3', amount: new Decimal(50), date: new Date('2025-01-15T10:00:00') }),
    ])

    const cache = await calculateBalancesBatch(['A'], [new Date('2025-02-01T00:00:00')])
    expect(cache.get('A', new Date('2025-02-01T00:00:00'))).toBe(650)
  })

  it('期初日期当天的交易必须计入余额', async () => {
    mockPrisma.account.findMany.mockResolvedValue([
      account({
        initialBalance: new Decimal(500),
        initialBalanceDate: new Date('2025-01-01T00:00:00'),
      }),
    ])
    mockPrisma.transaction.findMany.mockResolvedValue([
      transaction({ id: 't1', amount: new Decimal(50), date: new Date('2025-01-01T10:00:00') }),
    ])

    const cache = await calculateBalancesBatch(['A'], [new Date('2025-01-02T00:00:00')])
    expect(cache.get('A', new Date('2025-01-02T00:00:00'))).toBe(450)
  })

  it('查询日期等于期初日期时返回期初余额', async () => {
    mockPrisma.account.findMany.mockResolvedValue([
      account({
        initialBalance: new Decimal(500),
        initialBalanceDate: new Date('2025-01-01T00:00:00'),
      }),
    ])
    mockPrisma.transaction.findMany.mockResolvedValue([
      transaction({ id: 't1', amount: new Decimal(50), date: new Date('2025-01-01T10:00:00') }),
    ])

    const cache = await calculateBalancesBatch(['A'], [new Date('2025-01-01T00:00:00')])
    expect(cache.get('A', new Date('2025-01-01T00:00:00'))).toBe(500)
  })

  it('查询日期早于期初日期时，账户尚未存在，余额为 0', async () => {
    mockPrisma.account.findMany.mockResolvedValue([
      account({
        initialBalance: new Decimal(500),
        initialBalanceDate: new Date('2025-04-01T00:00:00'),
      }),
    ])
    mockPrisma.transaction.findMany.mockResolvedValue([])

    const cache = await calculateBalancesBatch(['A'], [new Date('2025-02-01T00:00:00')])
    expect(cache.get('A', new Date('2025-02-01T00:00:00'))).toBe(0)
  })

  it('收入退款减少余额，支出退款增加余额', async () => {
    mockPrisma.account.findMany.mockResolvedValue([
      account({ initialBalance: new Decimal(0) }),
    ])
    mockPrisma.transaction.findMany.mockResolvedValue([
      transaction({ id: 'i1', type: 'income', amount: new Decimal(1000), date: new Date('2025-01-01T10:00:00') }),
      transaction({
        id: 'r1',
        type: 'refund',
        amount: new Decimal(100),
        date: new Date('2025-01-02T10:00:00'),
        relatedTransactionId: 'i1',
        relatedType: 'income',
      }),
      transaction({ id: 'e1', type: 'expense', amount: new Decimal(300), date: new Date('2025-01-03T10:00:00') }),
      transaction({
        id: 'r2',
        type: 'refund',
        amount: new Decimal(50),
        date: new Date('2025-01-04T10:00:00'),
        relatedTransactionId: 'e1',
        relatedType: 'expense',
      }),
    ])

    const cache = await calculateBalancesBatch(['A'], [new Date('2025-02-01T00:00:00')])
    expect(cache.get('A', new Date('2025-02-01T00:00:00'))).toBe(650)
  })

  it('转账本金进入目标账户，手续费只从转出账户扣除', async () => {
    mockPrisma.account.findMany.mockResolvedValue([
      account({ id: 'A', initialBalance: new Decimal(1000) }),
      account({ id: 'B', initialBalance: new Decimal(0) }),
    ])
    mockPrisma.transaction.findMany.mockResolvedValue([
      transaction({
        id: 't1',
        type: 'transfer',
        amount: new Decimal(100),
        fee: new Decimal(5),
        coupon: new Decimal(2),
        date: new Date('2025-01-02T10:00:00'),
        accountId: 'A',
        toAccountId: 'B',
      }),
    ])

    const date = new Date('2025-01-03T00:00:00')
    const cache = await calculateBalancesBatch(['A', 'B'], [date])
    expect(cache.get('A', date)).toBe(897) // 1000 - 100 - (5 - 2)
    expect(cache.get('B', date)).toBe(100) // 手续费不会贷记到转入账户
  })

  it('不计收支的交易仍然影响账户余额', async () => {
    mockPrisma.account.findMany.mockResolvedValue([
      account({ initialBalance: new Decimal(0) }),
    ])
    mockPrisma.transaction.findMany.mockResolvedValue([
      transaction({
        id: 'i1',
        type: 'income',
        amount: new Decimal(1000),
        date: new Date('2025-01-01T10:00:00'),
        excludeFromIncomeExpense: true,
      }),
    ])

    const cache = await calculateBalancesBatch(['A'], [new Date('2025-02-01T00:00:00')])
    expect(cache.get('A', new Date('2025-02-01T00:00:00'))).toBe(1000)
  })
})
