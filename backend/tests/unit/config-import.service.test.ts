import { describe, it, expect, vi, beforeEach } from 'vitest'
import { importConfig } from '../../src/services/import/config-import.service.js'

vi.mock('../../src/index.js', () => {
  const mockPrisma = {
    $transaction: vi.fn((callback) => callback(mockPrisma)),
    account: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    accountCategory: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    transactionCategory: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    investmentAssetClass: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
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

import { prisma } from '../../src/index.js'

const mockPrisma = prisma as any

describe('config-import.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sortCounter = 1
  })

  describe('importConfig', () => {
    it('overwrite 模式下应导入完整分类树', async () => {
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
                name: '银行',
                type: 'asset',
                sort: 1,
                children: [{ name: '储蓄卡', type: 'asset', sort: 1 }],
              },
            ],
          },
        },
        'overwrite'
      )

      expect(result.imported.accountCategories).toBe(2)
      expect(mockPrisma.accountCategory.create).toHaveBeenCalledTimes(2)

      // 子分类的 parentId 应为父分类 id
      const secondCall = mockPrisma.accountCategory.create.mock.calls[1][0]
      expect(secondCall.data.parentId).toBe('acat-银行')
    })

    it('不同父分类下的同名子分类应保持各自层级', async () => {
      mockPrisma.accountCategory.findFirst.mockResolvedValue(null)
      mockPrisma.accountCategory.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `acat-${data.parentId ?? 'root'}-${data.name}`, ...data })
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
                children: [{ name: '同名子分类', type: 'asset' }],
              },
              {
                name: '父分类B',
                type: 'asset',
                children: [{ name: '同名子分类', type: 'asset' }],
              },
            ],
          },
        },
        'merge'
      )

      expect(result.imported.accountCategories).toBe(4)

      const calls = mockPrisma.accountCategory.create.mock.calls.map((c: any) => c[0].data)
      const childA = calls.find((c: any) => c.name === '同名子分类' && c.parentId === 'acat-root-父分类A')
      const childB = calls.find((c: any) => c.name === '同名子分类' && c.parentId === 'acat-root-父分类B')

      expect(childA).toBeDefined()
      expect(childB).toBeDefined()
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
        'merge'
      )

      expect(result.updated.transactionCategories).toBe(1)
      expect(result.imported.transactionCategories).toBe(1)
      expect(createCallCount).toBe(1)
    })
  })
})
