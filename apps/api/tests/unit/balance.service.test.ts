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

  it('月初 0 点语义：上月末平账计入月初余额，1 号当天交易不进月初余额也不被漏掉', async () => {
    mockPrisma.account.findMany.mockResolvedValue([
      account({
        initialBalance: new Decimal(500),
        initialBalanceDate: new Date('2024-12-31T00:00:00'),
      }),
    ])
    mockPrisma.transaction.findMany.mockResolvedValue([
      // 历史平账落在上月末（2024-12-31 0 点），属于 12 月的修正。
      transaction({
        id: 'adj',
        type: 'adjustment',
        amount: new Decimal(200),
        date: new Date('2024-12-31T00:00:00'),
      }),
      // 1 号当天交易：按「月初 = 当天 0 点之前」口径，不进 1 号的月初余额。
      transaction({
        id: 'jan1',
        type: 'expense',
        amount: new Decimal(100),
        date: new Date('2025-01-01T10:00:00'),
      }),
    ])

    const monthStart = await calculateBalancesBatch(['A'], [new Date('2025-01-01T00:00:00')])
    expect(monthStart.get('A', new Date('2025-01-01T00:00:00'))).toBe(700)

    // 次日余额已包含 1 号交易：它只是不参与月初快照，不会丢账。
    const nextDayBalance = await calculateBalancesBatch(['A'], [new Date('2025-01-02T00:00:00')])
    expect(nextDayBalance.get('A', new Date('2025-01-02T00:00:00'))).toBe(600)
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
