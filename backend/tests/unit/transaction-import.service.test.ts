import { describe, it, expect, vi, beforeEach } from 'vitest'
import { importTransactionsFromRows, type ParsedRow } from '../../src/services/transaction-import.service.js'

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

function makeRow(overrides: Partial<ParsedRow> = {}): ParsedRow {
  return {
    csvId: 'csv1',
    time: '2025/1/15 10:00:00',
    category1: '餐饮',
    category2: '',
    typeStr: '支出',
    amountStr: '100',
    account1: '现金',
    account2: '',
    note: '',
    fee: 0,
    coupon: 0,
    relatedCsvId: '',
    ...overrides,
  }
}

describe('transaction-import.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('importTransactionsFromRows', () => {
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

      const expenseRow = makeRow({
        csvId: 'csv1',
        typeStr: '支出',
        account1: '信用卡A',
        amountStr: '200',
      })

      const transferRow = makeRow({
        csvId: 'csv2',
        time: '2025/1/16 10:00:00',
        typeStr: '还款',
        account1: '储蓄卡',
        account2: '信用卡A',
        amountStr: '500',
      })

      const result = await importTransactionsFromRows([expenseRow, transferRow])

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

      const transferRow = makeRow({
        csvId: 'csv1',
        typeStr: '还款',
        account1: '储蓄卡',
        account2: '信用卡A',
        amountStr: '500',
      })

      const expenseRow = makeRow({
        csvId: 'csv2',
        time: '2025/1/16 10:00:00',
        typeStr: '支出',
        account1: '信用卡A',
        amountStr: '200',
      })

      const result = await importTransactionsFromRows([transferRow, expenseRow])

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

      const rows = [
        makeRow({ csvId: 'csv1', account1: '现金', amountStr: '50' }),
        makeRow({ csvId: 'csv2', account1: '现金', amountStr: '100' }),
      ]

      const result = await importTransactionsFromRows(rows)

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

      const transferRow = makeRow({
        csvId: 'csv1',
        typeStr: '还款',
        account1: '储蓄卡',
        account2: '信用卡A',
        amountStr: '500',
      })

      const result = await importTransactionsFromRows([transferRow])

      expect(result.imported).toBe(1)
      expect(mockPrisma.account.update).toHaveBeenCalledTimes(1)
      const updateCall = (mockPrisma.account.update.mock.calls as any[])[0]
      expect(updateCall[0].data.type).toBe('liability')
      expect(updateCall[0].data.icon).toBe('credit-card')
    })
  })
})
