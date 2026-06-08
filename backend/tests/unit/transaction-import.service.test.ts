import { describe, it, expect, vi, beforeEach } from 'vitest'
import { importTransactionsFromCsv } from '../../src/services/import.service.js'

vi.mock('../../src/index.js', () => {
  const mockPrisma = {
    account: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    accountCategory: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    transactionCategory: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
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
  })
})
