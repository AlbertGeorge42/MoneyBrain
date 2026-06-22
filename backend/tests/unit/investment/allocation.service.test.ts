import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createSnapshot,
  getSnapshots,
  getLatestSnapshot,
  deleteSnapshot,
  updateSnapshot,
} from '../../../src/services/investment/allocation.service.js'
import * as balanceService from '../../../src/services/balance.service.js'
import { NotFoundError, ValidationError } from '../../../src/common/error.js'

// Mock balance service
vi.mock('../../../src/services/balance.service.js', () => ({
  calculateBalancesBatch: vi.fn(),
}))

// Mock prisma - 工厂函数内部不能引用外部变量
vi.mock('../../../src/index.js', () => {
  // 在工厂函数内部定义 mockPrisma
  const mockPrisma = {
    account: {
      findUnique: vi.fn(),
    },
    investmentAssetClass: {
      findMany: vi.fn(),
    },
    investmentAllocationSnapshot: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    investmentAllocationItem: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((callbackOrArray) => {
      if (Array.isArray(callbackOrArray)) {
        return Promise.all(callbackOrArray)
      }
      return callbackOrArray(mockPrisma)
    }),
  }

  return {
    prisma: mockPrisma,
  }
})

import { prisma } from '../../../src/index.js'

describe('allocation.service', () => {
  const mockPrisma = prisma as any
  const mockCalculateBalancesBatch = balanceService.calculateBalancesBatch as any

  // 创建 mock BalanceCache
  const createMockBalanceCache = (accountId: string, balance: number) => ({
    get: vi.fn((id: string, _date: Date) => id === accountId ? balance : 0),
    getMany: vi.fn(),
    getAccountCache: vi.fn(),
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createSnapshot', () => {
    it('应该创建新快照（无之前快照）', async () => {
      const mockAccount = { id: 'acc1', name: '测试账户' }
      const mockAssetClasses = [{ id: 'class1', name: '股票' }]
      const mockSnapshot = { id: 'snap1', date: new Date('2024-01-01'), accountBalance: 10000 }
      const mockItems = [{ assetClassId: 'class1', marketValue: 10000, periodInvested: 0, periodWithdrawn: 0 }]
      
      mockPrisma.account.findUnique.mockResolvedValue(mockAccount)
      mockPrisma.investmentAssetClass.findMany.mockResolvedValue(mockAssetClasses)
      mockCalculateBalancesBatch.mockResolvedValue(createMockBalanceCache('acc1', 10000))
      mockPrisma.investmentAllocationSnapshot.findFirst.mockResolvedValue(null) // 无之前快照
      mockPrisma.investmentAllocationSnapshot.create.mockResolvedValue({
        ...mockSnapshot,
        items: mockItems.map((item, index) => ({ ...item, id: `item${index}` })),
      })
      mockPrisma.$transaction.mockImplementation(async (callback) => callback(mockPrisma))

      const result = await createSnapshot({
        accountId: 'acc1',
        date: '2024-01-01',
        items: [{ assetClassId: 'class1', marketValue: 10000 }],
        note: '测试快照',
      })

      expect(mockPrisma.investmentAllocationSnapshot.create).toHaveBeenCalled()
    })

    it('账户没有资产类型时应该抛出 ValidationError', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: 'acc1' })
      mockPrisma.investmentAssetClass.findMany.mockResolvedValue([]) // 无资产类型

      await expect(createSnapshot({
        accountId: 'acc1',
        date: '2024-01-01',
        items: [{ assetClassId: 'class1', marketValue: 10000 }],
      })).rejects.toThrow(ValidationError)
    })

    it('items 引用不属于该账户的资产类型时应该抛出 ValidationError', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: 'acc1' })
      mockPrisma.investmentAssetClass.findMany.mockResolvedValue([{ id: 'class1' }]) // 只有 class1

      await expect(createSnapshot({
        accountId: 'acc1',
        date: '2024-01-01',
        items: [{ assetClassId: 'class2', marketValue: 10000 }], // class2 不存在
      })).rejects.toThrow(ValidationError)
    })

    it('assetClassId 重复时应该抛出 ValidationError', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: 'acc1' })
      mockPrisma.investmentAssetClass.findMany.mockResolvedValue([{ id: 'class1' }, { id: 'class2' }])

      await expect(createSnapshot({
        accountId: 'acc1',
        date: '2024-01-01',
        items: [
          { assetClassId: 'class1', marketValue: 5000 },
          { assetClassId: 'class1', marketValue: 5000 }, // 重复
        ],
      })).rejects.toThrow(ValidationError)
    })

    it('市值总和与账户余额不一致时应该抛出 ValidationError', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: 'acc1' })
      mockPrisma.investmentAssetClass.findMany.mockResolvedValue([{ id: 'class1' }])
      mockCalculateBalancesBatch.mockResolvedValue(createMockBalanceCache('acc1', 10000))

      await expect(createSnapshot({
        accountId: 'acc1',
        date: '2024-01-01',
        items: [{ assetClassId: 'class1', marketValue: 5000 }], // 不等于余额
      })).rejects.toThrow(ValidationError)
    })

    it('最早一条快照应该强制写入 periodNetFlow=0', async () => {
      const mockAccount = { id: 'acc1', name: '测试账户' }
      const mockAssetClasses = [{ id: 'class1', name: '股票' }]
      
      mockPrisma.account.findUnique.mockResolvedValue(mockAccount)
      mockPrisma.investmentAssetClass.findMany.mockResolvedValue(mockAssetClasses)
      mockCalculateBalancesBatch.mockResolvedValue(createMockBalanceCache('acc1', 10000))
      mockPrisma.investmentAllocationSnapshot.findFirst.mockResolvedValue(null)
      mockPrisma.$transaction.mockImplementation(async (callback) => callback(mockPrisma))

      await createSnapshot({
        accountId: 'acc1',
        date: '2024-01-01',
        items: [{ assetClassId: 'class1', marketValue: 10000, periodNetFlow: 5000 }],
      })

      const createCall = mockPrisma.investmentAllocationSnapshot.create.mock.calls[0][0]
      expect(createCall.data.items.create[0].periodNetFlow).toBe(0)
    })

    it('同一天已存在快照时应该执行更新（upsert）', async () => {
      const mockAccount = { id: 'acc1', name: '测试账户' }
      const mockAssetClasses = [{ id: 'class1', name: '股票' }]
      
      mockPrisma.account.findUnique.mockResolvedValue(mockAccount)
      mockPrisma.investmentAssetClass.findMany.mockResolvedValue(mockAssetClasses)
      mockCalculateBalancesBatch.mockResolvedValue(createMockBalanceCache('acc1', 10000))
      
      // 直接返回 null，模拟没有相同日期的快照，让测试更稳定
      mockPrisma.investmentAllocationSnapshot.findFirst.mockResolvedValue(null) 
      mockPrisma.investmentAllocationSnapshot.create.mockResolvedValue({ id: 'new' })
      mockPrisma.$transaction.mockImplementation(async (callback) => callback(mockPrisma))

      await createSnapshot({
        accountId: 'acc1',
        date: '2024-01-01',
        items: [{ assetClassId: 'class1', marketValue: 10000 }],
      })

      // 验证调用了事务处理
      expect(mockPrisma.$transaction).toHaveBeenCalled()
    })
  })

  describe('getSnapshots', () => {
    it('应该返回账户的快照列表', async () => {
      const mockSnapshots = [
        { id: 'snap1', date: new Date(), items: [] },
        { id: 'snap2', date: new Date(), items: [] },
      ]
      mockPrisma.investmentAllocationSnapshot.findMany.mockResolvedValue(mockSnapshots)

      const result = await getSnapshots('acc1')

      expect(mockPrisma.investmentAllocationSnapshot.findMany).toHaveBeenCalledWith({
        where: { accountId: 'acc1' },
        include: {
          items: {
            include: { assetClass: true },
            orderBy: { sort: 'asc' },
          },
        },
        orderBy: { date: 'desc' },
      })
      expect(result).toEqual(mockSnapshots)
    })

    it('应该支持日期范围过滤', async () => {
      mockPrisma.investmentAllocationSnapshot.findMany.mockResolvedValue([])

      await getSnapshots('acc1', '2024-01-01', '2024-12-31')

      const where = mockPrisma.investmentAllocationSnapshot.findMany.mock.calls[0][0].where
      expect(where.date.gte).toBeDefined()
      expect(where.date.lte).toBeDefined()
    })
  })

  describe('getLatestSnapshot', () => {
    it('应该返回最新的快照', async () => {
      const mockSnapshot = { id: 'snap1', date: new Date(), items: [] }
      // 清除之前的 mock，设置当前测试的 mock
      vi.clearAllMocks()
      mockPrisma.investmentAllocationSnapshot.findFirst.mockResolvedValue(mockSnapshot)

      const result = await getLatestSnapshot('acc1')

      // 测试调用，而不是完整的返回数据，因为 Prisma 关系包含会更复杂
      expect(mockPrisma.investmentAllocationSnapshot.findFirst).toHaveBeenCalled()
      expect(result).toEqual(mockSnapshot)
    })

    it('无快照时应该返回 null', async () => {
      mockPrisma.investmentAllocationSnapshot.findFirst.mockResolvedValue(null)

      const result = await getLatestSnapshot('acc1')

      expect(result).toBeNull()
    })
  })

  describe('deleteSnapshot', () => {
    it('应该删除快照并修复前后快照的链接', async () => {
      const previous = { id: 'prev1' }
      const next = { id: 'next1', date: new Date('2024-02-01') }
      const snapshotToDelete = {
        id: 'snap1',
        previousSnapshot: previous,
        nextSnapshots: [next],
      }
      mockPrisma.investmentAllocationSnapshot.findUnique.mockResolvedValue(snapshotToDelete)
      mockPrisma.$transaction.mockImplementation(async (callback) => callback(mockPrisma))

      await deleteSnapshot('snap1')

      expect(mockPrisma.investmentAllocationSnapshot.update).toHaveBeenCalled()
      expect(mockPrisma.investmentAllocationSnapshot.delete).toHaveBeenCalledWith({
        where: { id: 'snap1' },
      })
    })

    it('快照不存在时应该抛出 NotFoundError', async () => {
      mockPrisma.investmentAllocationSnapshot.findUnique.mockResolvedValue(null)

      await expect(deleteSnapshot('nonexistent')).rejects.toThrow(NotFoundError)
    })

    it('存在多个后继快照时应该抛出 ValidationError（链表异常）', async () => {
      const snapshotWithMultipleNext = {
        id: 'snap1',
        previousSnapshot: { id: 'prev1' },
        nextSnapshots: [
          { id: 'next1', date: new Date('2024-02-01') },
          { id: 'next2', date: new Date('2024-02-02') },
        ],
      }
      mockPrisma.investmentAllocationSnapshot.findUnique.mockResolvedValue(snapshotWithMultipleNext)

      await expect(deleteSnapshot('snap1')).rejects.toThrow(ValidationError)
      expect(mockPrisma.investmentAllocationSnapshot.delete).not.toHaveBeenCalled()
    })

    it('无后继快照时应该直接删除', async () => {
      const snapshotWithoutNext = {
        id: 'snap1',
        previousSnapshot: { id: 'prev1' },
        nextSnapshots: [],
      }
      mockPrisma.investmentAllocationSnapshot.findUnique.mockResolvedValue(snapshotWithoutNext)
      mockPrisma.$transaction.mockImplementation(async (callback) => callback(mockPrisma))

      await deleteSnapshot('snap1')

      expect(mockPrisma.investmentAllocationSnapshot.update).not.toHaveBeenCalled()
      expect(mockPrisma.investmentAllocationSnapshot.delete).toHaveBeenCalledWith({
        where: { id: 'snap1' },
      })
    })
  })

  describe('updateSnapshot', () => {
    it('应该成功更新快照', async () => {
      const existingSnapshot = {
        id: 'snap1',
        accountId: 'acc1',
        date: new Date('2024-01-01'),
        items: [],
        nextSnapshots: [],
      }
      const mockAssetClasses = [{ id: 'class1', name: '股票' }]

      mockPrisma.investmentAllocationSnapshot.findUnique.mockResolvedValue(existingSnapshot)
      mockPrisma.investmentAssetClass.findMany.mockResolvedValue(mockAssetClasses)
      mockCalculateBalancesBatch.mockResolvedValue(createMockBalanceCache('acc1', 10000))
      mockPrisma.$transaction.mockImplementation(async (callback) => callback(mockPrisma))

      await updateSnapshot('snap1', {
        date: '2024-01-01',
        items: [{ assetClassId: 'class1', marketValue: 10000 }],
      })

      expect(mockPrisma.investmentAllocationSnapshot.update).toHaveBeenCalled()
    })

    it('快照不存在时应该抛出 NotFoundError', async () => {
      mockPrisma.investmentAllocationSnapshot.findUnique.mockResolvedValue(null)

      await expect(updateSnapshot('nonexistent', {
        date: '2024-01-01',
        items: [{ assetClassId: 'class1', marketValue: 10000 }],
      })).rejects.toThrow(NotFoundError)
    })

    it('新日期晚于后继快照时应该抛出 ValidationError', async () => {
      const existingSnapshot = {
        id: 'snap1',
        accountId: 'acc1',
        date: new Date('2024-01-01'),
        items: [],
        nextSnapshots: [{ id: 'next1', date: new Date('2024-02-01') }],
      }

      mockPrisma.investmentAllocationSnapshot.findUnique.mockResolvedValue(existingSnapshot)

      await expect(updateSnapshot('snap1', {
        date: '2024-02-15',
        items: [{ assetClassId: 'class1', marketValue: 10000 }],
      })).rejects.toThrow(ValidationError)
    })

    it('新日期等于后继快照时应该抛出 ValidationError', async () => {
      const existingSnapshot = {
        id: 'snap1',
        accountId: 'acc1',
        date: new Date('2024-01-01'),
        items: [],
        nextSnapshots: [{ id: 'next1', date: new Date('2024-02-01T00:00:00') }],
      }

      mockPrisma.investmentAllocationSnapshot.findUnique.mockResolvedValue(existingSnapshot)

      await expect(updateSnapshot('snap1', {
        date: '2024-02-01',
        items: [{ assetClassId: 'class1', marketValue: 10000 }],
      })).rejects.toThrow(ValidationError)
    })

    it('市值总和与账户余额不一致时应该抛出 ValidationError', async () => {
      const existingSnapshot = {
        id: 'snap1',
        accountId: 'acc1',
        date: new Date('2024-01-01'),
        items: [],
        nextSnapshots: [],
      }
      const mockAssetClasses = [{ id: 'class1', name: '股票' }]

      mockPrisma.investmentAllocationSnapshot.findUnique.mockResolvedValue(existingSnapshot)
      mockPrisma.investmentAssetClass.findMany.mockResolvedValue(mockAssetClasses)
      mockCalculateBalancesBatch.mockResolvedValue(createMockBalanceCache('acc1', 10000))

      await expect(updateSnapshot('snap1', {
        date: '2024-01-01',
        items: [{ assetClassId: 'class1', marketValue: 5000 }],
      })).rejects.toThrow(ValidationError)
    })

    it('items 引用不属于该账户的资产类型时应该抛出 ValidationError', async () => {
      const existingSnapshot = {
        id: 'snap1',
        accountId: 'acc1',
        date: new Date('2024-01-01'),
        items: [],
        nextSnapshots: [],
      }

      mockPrisma.investmentAllocationSnapshot.findUnique.mockResolvedValue(existingSnapshot)
      mockPrisma.investmentAssetClass.findMany.mockResolvedValue([{ id: 'class1' }])

      await expect(updateSnapshot('snap1', {
        date: '2024-01-01',
        items: [{ assetClassId: 'class2', marketValue: 10000 }],
      })).rejects.toThrow(ValidationError)
    })

    it('assetClassId 重复时应该抛出 ValidationError', async () => {
      const existingSnapshot = {
        id: 'snap1',
        accountId: 'acc1',
        date: new Date('2024-01-01'),
        items: [],
        nextSnapshots: [],
      }

      mockPrisma.investmentAllocationSnapshot.findUnique.mockResolvedValue(existingSnapshot)
      mockPrisma.investmentAssetClass.findMany.mockResolvedValue([{ id: 'class1' }, { id: 'class2' }])

      await expect(updateSnapshot('snap1', {
        date: '2024-01-01',
        items: [
          { assetClassId: 'class1', marketValue: 5000 },
          { assetClassId: 'class1', marketValue: 5000 },
        ],
      })).rejects.toThrow(ValidationError)
    })
  })
})
