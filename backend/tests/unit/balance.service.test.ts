import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library.js'
import type { Prisma } from '@prisma/client'

// Mock prisma - 工厂函数内部不能引用外部变量
vi.mock('../../src/index.js', () => {
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

import { prisma } from '../../src/index.js'
import { calculateBalancesBatch } from '../../src/services/balance.service.js'

type MockPrisma = {
  account: { findMany: ReturnType<typeof vi.fn> }
  transaction: { findMany: ReturnType<typeof vi.fn> }
}

describe('balance.service - calculateBalancesBatch', () => {
  const mockPrisma = prisma as unknown as MockPrisma

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('历史余额计算', () => {
    it('应该把账户创建日之前的交易纳入计算', async () => {
      // 场景：账户 A 初始余额 1000，无 initialBalanceDate
      //   2024-12-10 交易 -200
      //   2024-12-20 交易 -100
      //   2025-01-15 交易 -50
      // 查询 2025-01-31 的余额 -> 应该是 650
      const createdAt = new Date('2024-12-01T00:00:00')
      const nextDay = new Date('2025-02-01T00:00:00')

      mockPrisma.account.findMany.mockResolvedValue([
        {
          id: 'A',
          name: '账户A',
          type: 'asset',
          initialBalance: new Decimal(1000),
          initialBalanceDate: null,
          createdAt,
        },
      ])

      // 关键断言：数据库查询范围应该覆盖到账户创建日(2024-12-01)，
      // 而不是 sortedDates[0](2025-02-01)。
      mockPrisma.transaction.findMany.mockImplementation(async (args: Prisma.TransactionFindManyArgs) => {
        const orItem = args.where?.OR?.[0]
        const range = orItem && 'date' in orItem ? orItem.date : undefined
        // 验证 gte 至少在 2024-12-01 之前
        expect(range?.gte?.getTime()).toBeLessThanOrEqual(createdAt.getTime())
        return [
          { id: 't1', date: new Date('2024-12-10T10:00:00'), accountId: 'A', toAccountId: null, type: 'expense', amount: new Decimal(200), fee: new Decimal(0), coupon: new Decimal(0) },
          { id: 't2', date: new Date('2024-12-20T10:00:00'), accountId: 'A', toAccountId: null, type: 'expense', amount: new Decimal(100), fee: new Decimal(0), coupon: new Decimal(0) },
          { id: 't3', date: new Date('2025-01-15T10:00:00'), accountId: 'A', toAccountId: null, type: 'expense', amount: new Decimal(50), fee: new Decimal(0), coupon: new Decimal(0) },
        ] as never
      })

      const cache = await calculateBalancesBatch(['A'], [nextDay])
      // 传入 nextDay，函数内部查 t.date < nextDay，即 1/31 及之前所有交易
      const balance = cache.get('A', nextDay)
      expect(balance).toBe(650) // 1000 - 200 - 100 - 50
    })

    it('应该把有 initialBalanceDate 之后的交易也纳入计算（且不会丢历史交易）', async () => {
      // 场景：账户 B 初始余额 500，initialBalanceDate = 2025-01-01
      //   2024-12-20 交易 -100（不会被计入，因为早于 initialBalanceDate 之后的下一天）
      //   2025-01-15 交易 -50（应被计入）
      // 查询 2025-01-31 的余额 -> 应该是 450
      // 同时验证 gte 至少在 createdAt 之前，数据库查询范围能拉到历史交易
      const createdAt = new Date('2024-12-01T00:00:00')
      const initialBalanceDate = new Date('2025-01-01T00:00:00')
      const nextDay = new Date('2025-02-01T00:00:00')

      mockPrisma.account.findMany.mockResolvedValue([
        {
          id: 'B',
          name: '账户B',
          type: 'asset',
          initialBalance: new Decimal(500),
          initialBalanceDate,
          createdAt,
        },
      ])

      mockPrisma.transaction.findMany.mockImplementation(async (args: Prisma.TransactionFindManyArgs) => {
        const orItem = args.where?.OR?.[0]
        const range = orItem && 'date' in orItem ? orItem.date : undefined
        // 验证 gte 至少在 createdAt 之前（即包含历史交易）
        expect(range?.gte?.getTime()).toBeLessThanOrEqual(createdAt.getTime())
        return [
          { id: 't1', date: new Date('2024-12-20T10:00:00'), accountId: 'B', toAccountId: null, type: 'expense', amount: new Decimal(100), fee: new Decimal(0), coupon: new Decimal(0) },
          { id: 't2', date: new Date('2025-01-15T10:00:00'), accountId: 'B', toAccountId: null, type: 'expense', amount: new Decimal(50), fee: new Decimal(0), coupon: new Decimal(0) },
        ] as never
      })

      const cache = await calculateBalancesBatch(['B'], [nextDay])
      const balance = cache.get('B', nextDay)
      expect(balance).toBe(450) // 500 - 50（12-20 的交易按 initialBalanceDate 语义不计入）
    })

    it('多账户时应取所有账户中最早的 createdAt 作为 minDate', async () => {
      const createdAtA = new Date('2024-06-01T00:00:00')
      const createdAtB = new Date('2024-10-01T00:00:00')
      const nextDay = new Date('2025-02-01T00:00:00')

      mockPrisma.account.findMany.mockResolvedValue([
        { id: 'A', name: 'A', type: 'asset', initialBalance: new Decimal(1000), initialBalanceDate: null, createdAt: createdAtA },
        { id: 'B', name: 'B', type: 'asset', initialBalance: new Decimal(2000), initialBalanceDate: null, createdAt: createdAtB },
      ])

      mockPrisma.transaction.findMany.mockImplementation(async (args: Prisma.TransactionFindManyArgs) => {
        const orItem = args.where?.OR?.[0]
        const range = orItem && 'date' in orItem ? orItem.date : undefined
        // 验证 gte 是更早的 createdAtA
        expect(range?.gte?.getTime()).toBe(createdAtA.getTime())
        return []
      })

      const cache = await calculateBalancesBatch(['A', 'B'], [nextDay])
      expect(cache.get('A', nextDay)).toBe(1000)
      expect(cache.get('B', nextDay)).toBe(2000)
    })

    it('当账户没有 createdAt 也没有 initialBalanceDate 时回退到 sortedDates[0] 前一天', async () => {
      const nextDay = new Date('2025-02-01T00:00:00')

      mockPrisma.account.findMany.mockResolvedValue([
        // createdAt 故意缺失
        { id: 'A', name: 'A', type: 'asset', initialBalance: new Decimal(1000), initialBalanceDate: null },
      ] as never)

      mockPrisma.transaction.findMany.mockImplementation(async (args: Prisma.TransactionFindManyArgs) => {
        const orItem = args.where?.OR?.[0]
        const range = orItem && 'date' in orItem ? orItem.date : undefined
        // backward 计算需要覆盖到查询截止日期前一天
        const expectedStart = new Date(nextDay)
        expectedStart.setDate(expectedStart.getDate() - 1)
        expect(range?.gte?.getTime()).toBe(expectedStart.getTime())
        return []
      })

      const cache = await calculateBalancesBatch(['A'], [nextDay])
      expect(cache.get('A', nextDay)).toBe(1000)
    })

    it('查询日期早于 initialBalanceDate 时应正确倒推余额', async () => {
      // 场景：账户 C 初始余额 10000，initialBalanceDate = 2025-04-01
      //   2025-03-20 支出 -500（在 backward 范围内）
      //   2025-02-15 收入 +2000（在 backward 范围内）
      //   2025-01-15 支出 -1000（在 backward 范围内）
      // 查询 2025-03-31（传入 nextDay = 2025-04-01）的余额
      // backward 范围：{ gte: 2025-03-31, lt: 2025-04-01 }，无交易，返回初始余额
      // 期望：10000
      const initialBalanceDate = new Date('2025-04-01T00:00:00')
      const nextDay = new Date('2025-04-01T00:00:00')

      mockPrisma.account.findMany.mockResolvedValue([
        {
          id: 'C',
          name: '账户C',
          type: 'asset',
          initialBalance: new Decimal(10000),
          initialBalanceDate,
          createdAt: new Date('2025-01-01T00:00:00'),
        },
      ])

      mockPrisma.transaction.findMany.mockResolvedValue([
        { id: 't1', date: new Date('2025-01-15T10:00:00'), accountId: 'C', toAccountId: null, type: 'expense', amount: new Decimal(1000), fee: new Decimal(0), coupon: new Decimal(0) },
        { id: 't2', date: new Date('2025-02-15T10:00:00'), accountId: 'C', toAccountId: null, type: 'income', amount: new Decimal(2000), fee: new Decimal(0), coupon: new Decimal(0) },
        { id: 't3', date: new Date('2025-03-20T10:00:00'), accountId: 'C', toAccountId: null, type: 'expense', amount: new Decimal(500), fee: new Decimal(0), coupon: new Decimal(0) },
      ] as never)

      const cache = await calculateBalancesBatch(['C'], [nextDay])
      const balance = cache.get('C', nextDay)
      // targetDate == initialDate，返回初始余额
      expect(balance).toBe(10000)
    })

    it('查询月份在 initialBalanceDate 之前时应正确倒推余额', async () => {
      // 场景：资产负债表按月查询 2025-01（传入 nextDay = 2025-02-01）
      // initialBalanceDate = 2025-04-01，余额 10000
      // 2025-01-10 收入 +1000（在 backward 范围内）
      // 2025-02-10 收入 +2000（在 backward 范围内）
      // 2025-03-10 收入 +3000（在 backward 范围内）
      // backward 范围：{ gte: 2025-01-31, lt: 2025-04-01 }
      // 包含 2025-02-10 和 2025-03-10 的交易，不包含 2025-01-10（早于 2025-01-31）
      // 期望：10000 - 2000 - 3000 = 5000
      const initialBalanceDate = new Date('2025-04-01T00:00:00')
      const nextDay = new Date('2025-02-01T00:00:00')

      mockPrisma.account.findMany.mockResolvedValue([
        {
          id: 'D',
          name: '账户D',
          type: 'asset',
          initialBalance: new Decimal(10000),
          initialBalanceDate,
          createdAt: new Date('2025-01-01T00:00:00'),
        },
      ])

      mockPrisma.transaction.findMany.mockResolvedValue([
        { id: 't1', date: new Date('2025-01-10T10:00:00'), accountId: 'D', toAccountId: null, type: 'income', amount: new Decimal(1000), fee: new Decimal(0), coupon: new Decimal(0) },
        { id: 't2', date: new Date('2025-02-10T10:00:00'), accountId: 'D', toAccountId: null, type: 'income', amount: new Decimal(2000), fee: new Decimal(0), coupon: new Decimal(0) },
        { id: 't3', date: new Date('2025-03-10T10:00:00'), accountId: 'D', toAccountId: null, type: 'income', amount: new Decimal(3000), fee: new Decimal(0), coupon: new Decimal(0) },
      ] as never)

      const cache = await calculateBalancesBatch(['D'], [nextDay])
      const balance = cache.get('D', nextDay)
      // backward 范围 { gte: 2025-01-31, lt: 2025-04-01 }
      // 包含 t2 (2025-02-10) 和 t3 (2025-03-10)，不包含 t1 (2025-01-10)
      // 10000 - 2000 - 3000 = 5000
      expect(balance).toBe(5000)
    })

    it('backward 计算应覆盖从 queryDate 到 initialDate 之间的所有交易', async () => {
      // 场景：initialBalanceDate = 2025-12-31，余额 10000
      // 查询 2025-01-31 的余额（传入 nextDay = 2025-02-01）
      // 交易分布：
      //   2025-01-15 支出 -1000（早于 queryDate，不包含）
      //   2025-02-20 收入 +2000（在 backward 范围内）
      //   2025-03-15 支出 -500（在 backward 范围内）
      //   2025-06-10 收入 +3000（在 backward 范围内）
      //   2025-09-20 支出 -800（在 backward 范围内）
      //   2025-12-20 收入 +1500（在 backward 范围内）
      // backward 范围：{ gte: 2025-01-31, lt: 2025-12-31 }
      // backward 计算：余额 = initialBalance - Σ(交易变动)
      // Σ(交易变动) = +2000 - 500 + 3000 - 800 + 1500 = +5200
      // 期望：10000 - 5200 = 4800
      const initialBalanceDate = new Date('2025-12-31T00:00:00')
      const nextDay = new Date('2025-02-01T00:00:00')

      mockPrisma.account.findMany.mockResolvedValue([
        {
          id: 'E',
          name: '账户E',
          type: 'asset',
          initialBalance: new Decimal(10000),
          initialBalanceDate,
          createdAt: new Date('2025-01-01T00:00:00'),
        },
      ])

      mockPrisma.transaction.findMany.mockResolvedValue([
        { id: 't1', date: new Date('2025-01-15T10:00:00'), accountId: 'E', toAccountId: null, type: 'expense', amount: new Decimal(1000), fee: new Decimal(0), coupon: new Decimal(0) },
        { id: 't2', date: new Date('2025-02-20T10:00:00'), accountId: 'E', toAccountId: null, type: 'income', amount: new Decimal(2000), fee: new Decimal(0), coupon: new Decimal(0) },
        { id: 't3', date: new Date('2025-03-15T10:00:00'), accountId: 'E', toAccountId: null, type: 'expense', amount: new Decimal(500), fee: new Decimal(0), coupon: new Decimal(0) },
        { id: 't4', date: new Date('2025-06-10T10:00:00'), accountId: 'E', toAccountId: null, type: 'income', amount: new Decimal(3000), fee: new Decimal(0), coupon: new Decimal(0) },
        { id: 't5', date: new Date('2025-09-20T10:00:00'), accountId: 'E', toAccountId: null, type: 'expense', amount: new Decimal(800), fee: new Decimal(0), coupon: new Decimal(0) },
        { id: 't6', date: new Date('2025-12-20T10:00:00'), accountId: 'E', toAccountId: null, type: 'income', amount: new Decimal(1500), fee: new Decimal(0), coupon: new Decimal(0) },
      ] as never)

      const cache = await calculateBalancesBatch(['E'], [nextDay])
      const balance = cache.get('E', nextDay)
      // backward 范围 { gte: 2025-01-31, lt: 2025-12-31 }
      // 包含 t2, t3, t4, t5, t6，不包含 t1 (2025-01-15)
      // backward 计算：余额 = initialBalance - Σ(交易变动)
      // Σ(交易变动) = +2000 - 500 + 3000 - 800 + 1500 = +5200
      // 10000 - 5200 = 4800
      expect(balance).toBe(4800)
    })

    it('多账户有不同的 initialBalanceDate 时应正确计算各自余额', async () => {
      // 场景：
      // 账户 F：initialBalanceDate = 2025-06-30，余额 5000
      // 账户 G：initialBalanceDate = 2025-12-31，余额 10000
      // 查询 2025-01-31 的余额（传入 nextDay = 2025-02-01）
      // 账户 F 交易：2025-03-15 收入 +1000（在 backward 范围内）
      // 账户 G 交易：2025-02-20 收入 +2000，2025-03-15 支出 -500（在 backward 范围内）
      // 账户 F backward 范围：{ gte: 2025-01-31, lt: 2025-06-30 }
      // 账户 G backward 范围：{ gte: 2025-01-31, lt: 2025-12-31 }
      // 账户 F 期望：5000 - 1000 = 4000
      // 账户 G 期望：10000 - 2000 + 500 = 8500
      const accountFInitialDate = new Date('2025-06-30T00:00:00')
      const accountGInitialDate = new Date('2025-12-31T00:00:00')
      const nextDay = new Date('2025-02-01T00:00:00')

      mockPrisma.account.findMany.mockResolvedValue([
        {
          id: 'F',
          name: '账户F',
          type: 'asset',
          initialBalance: new Decimal(5000),
          initialBalanceDate: accountFInitialDate,
          createdAt: new Date('2025-01-01T00:00:00'),
        },
        {
          id: 'G',
          name: '账户G',
          type: 'asset',
          initialBalance: new Decimal(10000),
          initialBalanceDate: accountGInitialDate,
          createdAt: new Date('2025-01-01T00:00:00'),
        },
      ])

      mockPrisma.transaction.findMany.mockResolvedValue([
        // 账户 F 的交易
        { id: 'f1', date: new Date('2025-03-15T10:00:00'), accountId: 'F', toAccountId: null, type: 'income', amount: new Decimal(1000), fee: new Decimal(0), coupon: new Decimal(0) },
        // 账户 G 的交易
        { id: 'g1', date: new Date('2025-02-20T10:00:00'), accountId: 'G', toAccountId: null, type: 'income', amount: new Decimal(2000), fee: new Decimal(0), coupon: new Decimal(0) },
        { id: 'g2', date: new Date('2025-03-15T10:00:00'), accountId: 'G', toAccountId: null, type: 'expense', amount: new Decimal(500), fee: new Decimal(0), coupon: new Decimal(0) },
      ] as never)

      const cache = await calculateBalancesBatch(['F', 'G'], [nextDay])
      // 账户 F：backward 范围 { gte: 2025-01-31, lt: 2025-06-30 }
      // 包含 f1 (2025-03-15)，5000 - 1000 = 4000
      expect(cache.get('F', nextDay)).toBe(4000)
      // 账户 G：backward 范围 { gte: 2025-01-31, lt: 2025-12-31 }
      // 包含 g1, g2，10000 - 2000 + 500 = 8500
      expect(cache.get('G', nextDay)).toBe(8500)
    })

    it('查询日期在两个账户 initialBalanceDate 之间时应正确计算', async () => {
      // 场景：
      // 账户 H：initialBalanceDate = 2025-03-31，余额 3000
      // 账户 I：initialBalanceDate = 2025-06-30，余额 6000
      // 查询 2025-05-31 的余额（传入 nextDay = 2025-06-01）
      // 账户 H：forward 计算（targetDate > initialBalanceDate）
      // 账户 I：backward 计算（targetDate < initialBalanceDate）
      // 账户 H 交易：2025-04-15 收入 +500（forward 范围内）
      // 账户 I 交易：2025-04-20 支出 -200（backward 范围内）
      // 账户 H 期望：3000 + 500 = 3500（forward）
      // 账户 I 期望：6000 + 200 = 6200（backward）
      const accountHInitialDate = new Date('2025-03-31T00:00:00')
      const accountIInitialDate = new Date('2025-06-30T00:00:00')
      const nextDay = new Date('2025-06-01T00:00:00')

      mockPrisma.account.findMany.mockResolvedValue([
        {
          id: 'H',
          name: '账户H',
          type: 'asset',
          initialBalance: new Decimal(3000),
          initialBalanceDate: accountHInitialDate,
          createdAt: new Date('2025-01-01T00:00:00'),
        },
        {
          id: 'I',
          name: '账户I',
          type: 'asset',
          initialBalance: new Decimal(6000),
          initialBalanceDate: accountIInitialDate,
          createdAt: new Date('2025-01-01T00:00:00'),
        },
      ])

      mockPrisma.transaction.findMany.mockResolvedValue([
        // 账户 H 的交易（forward 范围 { gte: 2025-04-01, lt: 2025-06-01 }）
        { id: 'h1', date: new Date('2025-04-15T10:00:00'), accountId: 'H', toAccountId: null, type: 'income', amount: new Decimal(500), fee: new Decimal(0), coupon: new Decimal(0) },
        // 账户 I 的交易（backward 范围 { gte: 2025-05-31, lt: 2025-06-30 }）
        { id: 'i1', date: new Date('2025-04-20T10:00:00'), accountId: 'I', toAccountId: null, type: 'expense', amount: new Decimal(200), fee: new Decimal(0), coupon: new Decimal(0) },
      ] as never)

      const cache = await calculateBalancesBatch(['H', 'I'], [nextDay])
      // 账户 H：forward 计算，范围 { gte: 2025-04-01, lt: 2025-06-01 }
      // 包含 h1 (2025-04-15)，3000 + 500 = 3500
      expect(cache.get('H', nextDay)).toBe(3500)
      // 账户 I：backward 计算，范围 { gte: 2025-05-31, lt: 2025-06-30 }
      // 不包含 i1 (2025-04-20 < 2025-05-31)，返回初始余额 6000
      expect(cache.get('I', nextDay)).toBe(6000)
    })

    it('负余额场景应正确计算', async () => {
      // 场景：账户 J 初始余额 -5000（负债账户），initialBalanceDate = 2025-04-01
      // 2025-02-15 支出 -1000（backward 范围内，负债减少）
      // 查询 2025-01-31 的余额（传入 nextDay = 2025-02-01）
      // backward 范围：{ gte: 2025-01-31, lt: 2025-04-01 }
      // 包含 2025-02-15 的交易
      // backward 计算：余额 = initialBalance - Σ(交易变动)
      // Σ(交易变动) = -1000（支出）
      // -5000 - (-1000) = -5000 + 1000 = -4000
      const initialBalanceDate = new Date('2025-04-01T00:00:00')
      const nextDay = new Date('2025-02-01T00:00:00')

      mockPrisma.account.findMany.mockResolvedValue([
        {
          id: 'J',
          name: '账户J',
          type: 'liability',
          initialBalance: new Decimal(-5000),
          initialBalanceDate,
          createdAt: new Date('2025-01-01T00:00:00'),
        },
      ])

      mockPrisma.transaction.findMany.mockResolvedValue([
        { id: 't1', date: new Date('2025-02-15T10:00:00'), accountId: 'J', toAccountId: null, type: 'expense', amount: new Decimal(1000), fee: new Decimal(0), coupon: new Decimal(0) },
      ] as never)

      const cache = await calculateBalancesBatch(['J'], [nextDay])
      const balance = cache.get('J', nextDay)
      // backward 范围 { gte: 2025-01-31, lt: 2025-04-01 }
      // 包含 t1 (2025-02-15)
      // backward 计算：余额 = initialBalance - Σ(交易变动)
      // expense: change = -1000
      // Σ(交易变动) = -1000
      // -5000 - (-1000) = -4000
      expect(balance).toBe(-4000)
    })
  })
})
