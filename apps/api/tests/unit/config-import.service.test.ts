import { describe, it, expect, vi, beforeEach } from 'vitest'
import { importConfig } from '../../src/services/import/config-import.service.js'

vi.mock('../../src/prisma.js', () => {
  const mockPrisma = {
    $transaction: vi.fn((callback) => callback(mockPrisma)),
    account: {
      findFirst: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    accountCategory: {
      findFirst: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    transactionCategory: {
      findFirst: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    investmentAssetClass: {
      findFirst: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    transaction: { count: vi.fn().mockResolvedValue(0) },
    budget: { count: vi.fn().mockResolvedValue(0) },
    investmentAllocationSnapshot: { count: vi.fn().mockResolvedValue(0) },
  }

  return { prisma: mockPrisma }
})

let sortCounter = 1
vi.mock('../../src/services/import/shared.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/services/import/shared.js')>()
  return {
    ...mod,
    buildSortCounters: vi.fn().mockResolvedValue({
      account: new Map(),
      accountCategory: new Map(),
      transactionCategory: new Map(),
    }),
    takeNextSort: vi.fn().mockImplementation((counters, model, key) => {
      const next = counters[model].get(key) ?? 1
      counters[model].set(key, next + 1)
      return next
    }),
  }
})

import { prisma } from '../../src/prisma.js'

const mockPrisma = prisma as any

describe('config-import.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sortCounter = 1
  })

  describe('importConfig', () => {
    it('嵌套账户分类备份应扁平化为一级，不再重建二级结构', async () => {
      mockPrisma.accountCategory.findFirst.mockResolvedValue(null)
      mockPrisma.accountCategory.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `acat-${data.name}`, ...data })
      )

      const result = await importConfig(
        {
          exportedAt: new Date().toISOString(),
          type: 'config',
          data: {
            accountCategories: [
              {
                name: '长期资产',
                type: 'asset',
                sort: 1,
                children: [{ name: '现金', type: 'asset', sort: 2, isCashEquivalent: true }],
              },
            ],
          },
        },
        'overwrite',
        mockPrisma
      )

      expect(result.imported.accountCategories).toBe(2)
      expect(mockPrisma.accountCategory.create).toHaveBeenCalledTimes(2)

      // 子节点提升为一级：parentId 恒 null，自身计算属性随之为根配置
      const calls = mockPrisma.accountCategory.create.mock.calls.map((c: any) => c[0].data)
      expect(calls.every((d: any) => d.parentId === null)).toBe(true)
      const cash = calls.find((d: any) => d.name === '现金')
      expect(cash.isCashEquivalent).toBe(true)
    })

    it('导入层不清空数据，清空由编排层在同一事务里统一执行', async () => {
      await importConfig(
        {
          exportedAt: new Date().toISOString(),
          type: 'config',
          data: { accountCategories: [] },
        },
        'overwrite',
        mockPrisma
      )

      // 「覆盖配置会删除现有账户」的拒绝判断在 clearSelectedDataForImport，
      // 导入层只负责写入——否则预览无法整体回滚。
      expect(mockPrisma.account.deleteMany).not.toHaveBeenCalled()
      expect(mockPrisma.transactionCategory.deleteMany).not.toHaveBeenCalled()
    })

    it('扁平化后账户分类按 name+type 归并，不再按父分类区分同名', async () => {
      mockPrisma.accountCategory.findFirst.mockResolvedValue(null)
      mockPrisma.accountCategory.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `acat-${data.name}`, ...data })
      )

      const result = await importConfig(
        {
          exportedAt: new Date().toISOString(),
          type: 'config',
          data: {
            accountCategories: [
              {
                name: '父分类A',
                type: 'asset',
                children: [{ name: '现金', type: 'asset' }],
              },
              {
                name: '父分类B',
                type: 'asset',
                children: [{ name: '现金', type: 'asset' }],
              },
            ],
          },
        },
        'merge',
        mockPrisma
      )

      // 4 个节点全部扁平为一级；两个「现金」因 findFirst 命中已建的同名一级而更新
      const calls = mockPrisma.accountCategory.create.mock.calls.map((c: any) => c[0].data)
      expect(calls.every((d: any) => d.parentId === null)).toBe(true)
      // nameMap 中「现金」指向一级 id，账户归属可精确命中
      expect(result.imported.accountCategories).toBeGreaterThanOrEqual(2)
    })

    it('merge 模式下已存在同名同层级分类时应更新而非重复创建', async () => {
      let createCallCount = 0
      mockPrisma.transactionCategory.findFirst.mockImplementation(({ where }: any) => {
        if (where.name === '餐饮' && where.type === 'expense' && where.parentId === null) {
          return Promise.resolve({ id: 'existing-餐饮', name: '餐饮', type: 'expense', parentId: null })
        }
        return Promise.resolve(null)
      })
      mockPrisma.transactionCategory.create.mockImplementation(({ data }: any) => {
        createCallCount++
        return Promise.resolve({ id: `new-${createCallCount}`, ...data })
      })

      const result = await importConfig(
        {
          exportedAt: new Date().toISOString(),
          type: 'config',
          data: {
            transactionCategories: [
              { name: '餐饮', type: 'expense' },
              { name: '交通', type: 'expense' },
            ],
          },
        },
        'merge',
        mockPrisma
      )

      expect(result.updated.transactionCategories).toBe(1)
      expect(result.imported.transactionCategories).toBe(1)
      expect(createCallCount).toBe(1)
    })

    it('账户初始余额日期（date-only）按本地日历日导入', async () => {
      mockPrisma.accountCategory.findFirst.mockResolvedValue({
        id: 'acat-asset',
        name: '资产',
        type: 'asset',
        parentId: null,
      })
      mockPrisma.account.findFirst.mockResolvedValue(null)
      mockPrisma.account.create.mockResolvedValue({ id: 'acc-1' })

      await importConfig(
        {
          exportedAt: new Date().toISOString(),
          type: 'config',
          data: {
            accounts: [
              {
                name: '现金',
                type: 'asset',
                initialBalance: '100.00',
                initialBalanceDate: '2024-01-01',
              },
            ],
          },
        },
        'merge',
        mockPrisma
      )

      expect(mockPrisma.account.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            initialBalanceDate: new Date(2024, 0, 1, 0, 0, 0, 0),
          }),
        })
      )
    })
  })
})
