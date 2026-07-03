import { describe, it, expect, vi, beforeEach } from 'vitest'
import { importTransactionsFromCsv } from '../../src/services/import/transaction-import.service.js'

vi.mock('../../src/index.js', () => {
  const mockPrisma = {
    account: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
    },
    accountCategory: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    transactionCategory: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    investmentAssetClass: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    transaction: {
      create: vi.fn(),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  }

  return {
    prisma: mockPrisma,
  }
})

vi.mock('../../src/services/account.service.js', () => ({
  getNextAccountSort: vi.fn().mockResolvedValue(1),
}))

vi.mock('../../src/services/account-category.service.js', () => ({
  getNextAccountCategorySort: vi.fn().mockResolvedValue(1),
}))

vi.mock('../../src/services/transaction-category.service.js', () => ({
  getNextTransactionCategorySort: vi.fn().mockResolvedValue(1),
}))

import { prisma } from '../../src/index.js'

const mockPrisma = prisma as any

function makeCsvRow(fields: string[]): string {
  return fields.join(',')
}

function makeCsvBuffer(rows: string[][]): Buffer {
  const header = ['ID', '时间', '分类', '二级分类', '类型', '金额', '币种', '账户1', '账户2', '备注', '已报销', '手续费', '优惠券', '记账者', '账单标记', '标签', '账单图片', '关联账单']
  const lines = [header.join(','), ...rows.map(r => makeCsvRow(r))]
  return Buffer.from(lines.join('\n'), 'utf-8')
}

describe('import.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('importTransactionsFromCsv', () => {
    it('负债账户先出普通交易后出还款交易时应该修正账户类型', async () => {
      let accountIdCounter = 0
      mockPrisma.account.findFirst.mockResolvedValue(null)

      mockPrisma.account.create.mockImplementation(({ data }: any) => {
        accountIdCounter++
        return Promise.resolve({
          id: `acc-${accountIdCounter}`,
          name: data.name,
          type: data.type,
          categoryId: data.categoryId,
        })
      })

      mockPrisma.account.update.mockImplementation(({ data }: any) => {
        return Promise.resolve({
          id: 'acc-1',
          name: '信用卡A',
          type: data.type,
          categoryId: data.categoryId,
        })
      })

      mockPrisma.accountCategory.findFirst.mockResolvedValue({
        id: 'acat-1',
        name: '资产',
        type: 'asset',
        parentId: null,
      })

      mockPrisma.transactionCategory.findFirst.mockResolvedValue({
        id: 'tcat-1',
        name: '餐饮',
        type: 'expense',
        parentId: null,
      })

      mockPrisma.transaction.create.mockImplementation(({ data }: any) => {
        return Promise.resolve({ id: `tx-${Date.now()}`, ...data })
      })

      const csv = makeCsvBuffer([
        ['csv1', '2025/1/15 10:00:00', '餐饮', '', '支出', '200', 'CNY', '信用卡A', '', '', '', '0', '0', '', '', '', '', ''],
        ['csv2', '2025/1/16 10:00:00', '还款', '', '还款', '500', 'CNY', '储蓄卡', '信用卡A', '', '', '0', '0', '', '', '', '', ''],
      ])

      const result = await importTransactionsFromCsv(csv)

      expect(result.imported).toBe(2)

      const createCalls = mockPrisma.account.create.mock.calls as any[]
      const accountTypes = createCalls.map((c: any) => c[0].data.type)
      expect(accountTypes).toContain('asset')
      expect(accountTypes).toContain('asset')

      expect(mockPrisma.account.update).toHaveBeenCalledTimes(1)
      const updateCall = (mockPrisma.account.update.mock.calls as any[])[0]
      expect(updateCall[0].data.type).toBe('liability')
      expect(updateCall[0].data.icon).toBe('credit-card')
      expect(updateCall[0].where.id).toBe('acc-1')
    })

    it('负债账户先出还款交易后出普通交易时应保持负债类型', async () => {
      let accountIdCounter = 0
      mockPrisma.account.findFirst.mockResolvedValue(null)

      mockPrisma.account.create.mockImplementation(({ data }: any) => {
        accountIdCounter++
        return Promise.resolve({
          id: `acc-${accountIdCounter}`,
          name: data.name,
          type: data.type,
          categoryId: data.categoryId,
        })
      })

      mockPrisma.accountCategory.findFirst.mockImplementation(({ where }: any) => {
        return Promise.resolve({
          id: where.type === 'liability' ? 'lcat-1' : 'acat-1',
          name: where.type === 'liability' ? '负债' : '资产',
          type: where.type,
          parentId: null,
        })
      })

      mockPrisma.transactionCategory.findFirst.mockResolvedValue({
        id: 'tcat-1',
        name: '还款',
        type: 'transfer',
        parentId: null,
      })

      mockPrisma.transaction.create.mockImplementation(({ data }: any) => {
        return Promise.resolve({ id: `tx-${Date.now()}`, ...data })
      })

      const csv = makeCsvBuffer([
        ['csv1', '2025/1/15 10:00:00', '还款', '', '还款', '500', 'CNY', '储蓄卡', '信用卡A', '', '', '0', '0', '', '', '', '', ''],
        ['csv2', '2025/1/16 10:00:00', '餐饮', '', '支出', '200', 'CNY', '信用卡A', '', '', '', '0', '0', '', '', '', '', ''],
      ])

      const result = await importTransactionsFromCsv(csv)

      expect(result.imported).toBe(2)
      expect(mockPrisma.account.update).not.toHaveBeenCalled()

      const createCalls = mockPrisma.account.create.mock.calls as any[]
      const creditCardCreate = createCalls.find((c: any) => c[0].data.name === '信用卡A')
      expect(creditCardCreate[0].data.type).toBe('liability')
    })

    it('普通 asset 账户不应被错误修改', async () => {
      let accountIdCounter = 0
      mockPrisma.account.findFirst.mockResolvedValue(null)

      mockPrisma.account.create.mockImplementation(({ data }: any) => {
        accountIdCounter++
        return Promise.resolve({
          id: `acc-${accountIdCounter}`,
          name: data.name,
          type: data.type,
          categoryId: data.categoryId,
        })
      })

      mockPrisma.accountCategory.findFirst.mockResolvedValue({
        id: 'acat-1',
        name: '资产',
        type: 'asset',
        parentId: null,
      })

      mockPrisma.transactionCategory.findFirst.mockResolvedValue({
        id: 'tcat-1',
        name: '餐饮',
        type: 'expense',
        parentId: null,
      })

      mockPrisma.transaction.create.mockImplementation(({ data }: any) => {
        return Promise.resolve({ id: `tx-${Date.now()}`, ...data })
      })

      const csv = makeCsvBuffer([
        ['csv1', '2025/1/15 10:00:00', '餐饮', '', '支出', '50', 'CNY', '现金', '', '', '', '0', '0', '', '', '', '', ''],
        ['csv2', '2025/1/15 11:00:00', '餐饮', '', '支出', '100', 'CNY', '现金', '', '', '', '0', '0', '', '', '', '', ''],
      ])

      const result = await importTransactionsFromCsv(csv)

      expect(result.imported).toBe(2)
      expect(mockPrisma.account.update).not.toHaveBeenCalled()
    })

    it('账户已在 DB 中存在且类型不匹配时应该更新', async () => {
      mockPrisma.account.findFirst.mockResolvedValue({
        id: 'existing-acc',
        name: '信用卡A',
        type: 'asset',
        categoryId: 'acat-1',
      })

      mockPrisma.account.update.mockImplementation(({ data }: any) => {
        return Promise.resolve({
          id: 'existing-acc',
          name: '信用卡A',
          type: data.type,
          categoryId: data.categoryId,
        })
      })

      mockPrisma.accountCategory.findFirst.mockImplementation(({ where }: any) => {
        return Promise.resolve({
          id: where.type === 'liability' ? 'lcat-1' : 'acat-1',
          name: where.type === 'liability' ? '负债' : '资产',
          type: where.type,
          parentId: null,
        })
      })

      mockPrisma.transactionCategory.findFirst.mockResolvedValue({
        id: 'tcat-1',
        name: '还款',
        type: 'transfer',
        parentId: null,
      })

      mockPrisma.transaction.create.mockImplementation(({ data }: any) => {
        return Promise.resolve({ id: `tx-${Date.now()}`, ...data })
      })

      const csv = makeCsvBuffer([
        ['csv1', '2025/1/15 10:00:00', '还款', '', '还款', '500', 'CNY', '储蓄卡', '信用卡A', '', '', '0', '0', '', '', '', '', ''],
      ])

      const result = await importTransactionsFromCsv(csv)

      expect(result.imported).toBe(1)
      expect(mockPrisma.account.update).toHaveBeenCalledTimes(1)
      const updateCall = (mockPrisma.account.update.mock.calls as any[])[0]
      expect(updateCall[0].data.type).toBe('liability')
      expect(updateCall[0].data.icon).toBe('credit-card')
    })

    it('当 category1 为空、category2 为"餐饮"时，不应创建空名父分类', async () => {
      // 模拟完全空的 DB
      mockPrisma.accountCategory.findFirst.mockImplementation(({ where }: any) => {
        if (where.type === 'asset' && where.parentId === null) {
          return Promise.resolve({ id: 'acat-1', name: '资产', type: 'asset', parentId: null })
        }
        if (where.type === 'liability' && where.parentId === null) {
          return Promise.resolve({ id: 'lcat-1', name: '负债', type: 'liability', parentId: null })
        }
        return Promise.resolve(null)
      })

      mockPrisma.account.findFirst.mockResolvedValue(null)
      mockPrisma.account.create.mockImplementation(({ data }: any) => ({
        id: `acc-${data.name}`,
        name: data.name,
        type: data.type,
        categoryId: data.categoryId,
      }))

      // 交易分类查不到任何东西
      mockPrisma.transactionCategory.findFirst.mockResolvedValue(null)

      const createdCategories: any[] = []
      mockPrisma.transactionCategory.create.mockImplementation(({ data }: any) => {
        createdCategories.push(data)
        return Promise.resolve({ id: `tcat-${createdCategories.length}`, ...data })
      })

      mockPrisma.transaction.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `tx-${Math.random()}`, ...data })
      )

      // CSV 中只有"二级分类"为"餐饮"，"分类"留空
      const csv = makeCsvBuffer([
        ['csv1', '2025/1/15 10:00:00', '', '餐饮', '支出', '100', 'CNY', '现金', '', '', '', '0', '0', '', '', '', '', ''],
      ])

      const result = await importTransactionsFromCsv(csv)
      expect(result.imported).toBe(1)

      // 关键断言：不应该创建空名父分类
      // 创建的分类中，name 不能为空字符串
      for (const cat of createdCategories) {
        expect(cat.name).not.toBe('')
      }

      // 也不应创建两个分类（一个空父 + 一个子），只应创建"餐饮"这一个
      const expenseCreates = createdCategories.filter(c => c.type === 'expense')
      expect(expenseCreates.length).toBe(1)
      expect(expenseCreates[0].name).toBe('餐饮')
      // 应该是顶层分类（无父分类）
      expect(expenseCreates[0].parentId).toBeNull()
    })

    it('transfer 行应正确解析账户后再决定分类（还款 vs 借款 vs 转账）', async () => {
      // 准备：储蓄卡（asset）和信用卡（asset）两个账户
      const accountMap: Record<string, any> = {}
      mockPrisma.account.findFirst.mockImplementation(({ where }: any) => {
        return Promise.resolve(accountMap[where.name] || null)
      })
      mockPrisma.account.create.mockImplementation(({ data }: any) => {
        const acc = {
          id: `acc-${data.name}`,
          name: data.name,
          type: data.type,
          categoryId: data.categoryId,
        }
        accountMap[data.name] = acc
        return Promise.resolve(acc)
      })
      mockPrisma.accountCategory.findFirst.mockImplementation(({ where }: any) => {
        if (where.type === 'asset' && where.parentId === null) {
          return Promise.resolve({ id: 'acat-1', name: '资产', type: 'asset', parentId: null })
        }
        if (where.type === 'liability' && where.parentId === null) {
          return Promise.resolve({ id: 'lcat-1', name: '负债', type: 'liability', parentId: null })
        }
        return Promise.resolve(null)
      })
      mockPrisma.transactionCategory.findFirst.mockResolvedValue(null)

      const createdCategories: any[] = []
      mockPrisma.transactionCategory.create.mockImplementation(({ data }: any) => {
        createdCategories.push(data)
        return Promise.resolve({ id: `tcat-${createdCategories.length}`, ...data })
      })

      mockPrisma.transaction.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `tx-${Math.random()}`, ...data })
      )

      // 测试1: 储蓄卡 → 信用卡（应识别为"还款"，对应 type=transfer + toAccount=liability）
      // 但 credit card 现在是 asset 类型，所以先创建为 asset
      // 关键：先出普通行（让信用卡先被创建为 asset），再出还款行（应触发账户类型修正为 liability）
      const csv = makeCsvBuffer([
        ['csv1', '2025/1/15 10:00:00', '餐饮', '', '支出', '200', 'CNY', '信用卡A', '', '', '', '0', '0', '', '', '', '', ''],
        ['csv2', '2025/1/16 10:00:00', '还款', '', '还款', '500', 'CNY', '储蓄卡', '信用卡A', '', '', '0', '0', '', '', '', '', ''],
      ])

      const result = await importTransactionsFromCsv(csv)
      expect(result.imported).toBe(2)

      // 创建的 transfer 类型分类中应有"还款"
      const transferCreates = createdCategories.filter(c => c.type === 'transfer')
      const names = transferCreates.map(c => c.name)
      expect(names).toContain('还款')
    })

    it('新分类的 sort 应该是递增的且不重复（内存 sort 计数器）', async () => {
      // 模拟完全空的 DB
      mockPrisma.accountCategory.findFirst.mockImplementation(({ where }: any) => {
        if (where.type === 'asset' && where.parentId === null) {
          return Promise.resolve({ id: 'acat-1', name: '资产', type: 'asset', parentId: null })
        }
        if (where.type === 'liability' && where.parentId === null) {
          return Promise.resolve({ id: 'lcat-1', name: '负债', type: 'liability', parentId: null })
        }
        return Promise.resolve(null)
      })

      mockPrisma.account.findFirst.mockResolvedValue(null)
      mockPrisma.account.create.mockImplementation(({ data }: any) => ({
        id: `acc-${data.name}`,
        name: data.name,
        type: data.type,
        categoryId: data.categoryId,
      }))

      // 关键：只有当 name 匹配时返回 null（即不在 DB 中），其他返回 null
      mockPrisma.transactionCategory.findFirst.mockResolvedValue(null)

      const createdCategories: any[] = []
      mockPrisma.transactionCategory.create.mockImplementation(({ data }: any) => {
        createdCategories.push(data)
        return Promise.resolve({ id: `tcat-${createdCategories.length}`, ...data })
      })

      mockPrisma.transaction.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `tx-${Math.random()}`, ...data })
      )

      // 多次创建不同顶层 expense 分类，应有递增的 sort
      const csv = makeCsvBuffer([
        ['csv1', '2025/1/15 10:00:00', '餐饮', '', '支出', '50', 'CNY', '现金', '', '', '', '0', '0', '', '', '', '', ''],
        ['csv2', '2025/1/15 11:00:00', '交通', '', '支出', '30', 'CNY', '现金', '', '', '', '0', '0', '', '', '', '', ''],
        ['csv3', '2025/1/15 12:00:00', '购物', '', '支出', '100', 'CNY', '现金', '', '', '', '0', '0', '', '', '', '', ''],
        ['csv4', '2025/1/15 13:00:00', '娱乐', '', '支出', '80', 'CNY', '现金', '', '', '', '0', '0', '', '', '', '', ''],
        ['csv5', '2025/1/15 14:00:00', '工资', '', '收入', '5000', 'CNY', '现金', '', '', '', '0', '0', '', '', '', '', ''],
        ['csv6', '2025/1/15 15:00:00', '奖金', '', '收入', '1000', 'CNY', '现金', '', '', '', '0', '0', '', '', '', '', ''],
      ])

      const result = await importTransactionsFromCsv(csv)
      expect(result.imported).toBe(6)

      // 收集 expense 类型顶层分类的 sort
      const expenseTopLevel = createdCategories
        .filter(c => c.type === 'expense' && c.parentId === null)
        .sort((a, b) => a.sort - b.sort)
      expect(expenseTopLevel.map(c => c.name)).toEqual(['餐饮', '交通', '购物', '娱乐'])

      // sort 应该是 1, 2, 3, 4（严格递增）
      expect(expenseTopLevel.map(c => c.sort)).toEqual([1, 2, 3, 4])

      // income 类型顶层分类
      const incomeTopLevel = createdCategories
        .filter(c => c.type === 'income' && c.parentId === null)
        .sort((a, b) => a.sort - b.sort)
      expect(incomeTopLevel.map(c => c.name)).toEqual(['工资', '奖金'])
      // sort 应该是 1, 2
      expect(incomeTopLevel.map(c => c.sort)).toEqual([1, 2])
    })

    it('同一分类在多次出现时只创建一次（缓存命中不再查 SQL）', async () => {
      mockPrisma.accountCategory.findFirst.mockImplementation(({ where }: any) => {
        if (where.type === 'asset' && where.parentId === null) {
          return Promise.resolve({ id: 'acat-1', name: '资产', type: 'asset', parentId: null })
        }
        return Promise.resolve(null)
      })

      mockPrisma.account.findFirst.mockResolvedValue(null)
      mockPrisma.account.create.mockImplementation(({ data }: any) => ({
        id: `acc-${data.name}`,
        name: data.name,
        type: data.type,
        categoryId: data.categoryId,
      }))

      mockPrisma.transactionCategory.findFirst.mockResolvedValue(null)

      const createdCategories: any[] = []
      mockPrisma.transactionCategory.create.mockImplementation(({ data }: any) => {
        createdCategories.push(data)
        return Promise.resolve({ id: `tcat-${createdCategories.length}`, ...data })
      })

      mockPrisma.transaction.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `tx-${Math.random()}`, ...data })
      )

      // 5 行都用同一个分类"餐饮"
      const csv = makeCsvBuffer([
        ['csv1', '2025/1/15 10:00:00', '餐饮', '', '支出', '50', 'CNY', '现金', '', '', '', '0', '0', '', '', '', '', ''],
        ['csv2', '2025/1/15 11:00:00', '餐饮', '', '支出', '30', 'CNY', '现金', '', '', '', '0', '0', '', '', '', '', ''],
        ['csv3', '2025/1/15 12:00:00', '餐饮', '', '支出', '100', 'CNY', '现金', '', '', '', '0', '0', '', '', '', '', ''],
        ['csv4', '2025/1/15 13:00:00', '餐饮', '', '支出', '80', 'CNY', '现金', '', '', '', '0', '0', '', '', '', '', ''],
        ['csv5', '2025/1/15 14:00:00', '餐饮', '', '支出', '60', 'CNY', '现金', '', '', '', '0', '0', '', '', '', '', ''],
      ])

      const result = await importTransactionsFromCsv(csv)
      expect(result.imported).toBe(5)

      // 关键断言：只创建了 1 个分类（缓存命中，不再查 SQL）
      const expenseCreates = createdCategories.filter(c => c.type === 'expense')
      expect(expenseCreates.length).toBe(1)
      expect(expenseCreates[0].name).toBe('餐饮')
      expect(expenseCreates[0].sort).toBe(1)
    })
  })
})
