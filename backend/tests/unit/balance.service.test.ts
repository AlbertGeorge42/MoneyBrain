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

    it('当账户没有 createdAt 也没有 initialBalanceDate 时回退到 sortedDates[0]', async () => {
      const nextDay = new Date('2025-02-01T00:00:00')

      mockPrisma.account.findMany.mockResolvedValue([
        // createdAt 故意缺失
        { id: 'A', name: 'A', type: 'asset', initialBalance: new Decimal(1000), initialBalanceDate: null },
      ] as never)

      mockPrisma.transaction.findMany.mockImplementation(async (args: Prisma.TransactionFindManyArgs) => {
        const orItem = args.where?.OR?.[0]
        const range = orItem && 'date' in orItem ? orItem.date : undefined
        // 回退到 nextDay 本身
        expect(range?.gte?.getTime()).toBe(nextDay.getTime())
        return []
      })

      const cache = await calculateBalancesBatch(['A'], [nextDay])
      expect(cache.get('A', nextDay)).toBe(1000)
    })
  })
})
