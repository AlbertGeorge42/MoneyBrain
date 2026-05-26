import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library.js'
import {
  getAccounts,
  createAccount,
  updateAccountProfile,
  deleteAccount,
  getAccountStats,
  adjustAccountBalance,
  getAccountDetail,
  updateAccountSorts,
} from '../../src/services/account.service.js'
import { NotFoundError, ValidationError } from '../../src/common/error.js'

// Mock prisma - 工厂函数内部不能引用外部变量
vi.mock('../../src/index.js', () => {
  // 在工厂函数内部定义 mockPrisma
  const mockPrisma = {
    account: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    accountCategory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    transactionCategory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    budget: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    budgetAlert: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    investmentAssetClass: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    investmentAllocationSnapshot: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
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
    $disconnect: vi.fn(),
  }

  return {
    prisma: mockPrisma,
  }
})

import { prisma } from '../../src/index.js'

describe('account.service', () => {
  const mockPrisma = prisma as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAccounts', () => {
    it('应该返回账户列表并按 sort 和 createdAt 排序', async () => {
      const mockAccounts = [
        { id: '1', name: '账户A', sort: 0, createdAt: new Date() },
        { id: '2', name: '账户B', sort: 1, createdAt: new Date() },
      ]
      mockPrisma.account.findMany.mockResolvedValue(mockAccounts)

      const result = await getAccounts()

      expect(mockPrisma.account.findMany).toHaveBeenCalledWith({
        include: { category: true },
        orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
      })
      expect(result).toEqual(mockAccounts)
    })
  })

  describe('getAccountDetail', () => {
    it('应该返回带关联数据的账户详情', async () => {
      const mockAccount = {
        id: '1',
        name: '测试账户',
        category: { id: 'cat1', name: '现金' },
        fromTransactions: [],
      }
      mockPrisma.account.findUnique.mockResolvedValue(mockAccount)

      const result = await getAccountDetail('1')

      expect(mockPrisma.account.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        include: {
          category: true,
          fromTransactions: {
            take: 10,
            orderBy: { date: 'desc' },
            include: { category: true },
          },
        },
      })
      expect(result).toEqual(mockAccount)
    })
  })

  describe('createAccount', () => {
    it('应该使用 initialBalance 创建账户', async () => {
      const mockAccount = { id: '1', name: '新账户', initialBalance: new Decimal(1000) }
      mockPrisma.account.create.mockResolvedValue(mockAccount)

      const result = await createAccount({
        name: '新账户',
        type: 'asset',
        initialBalance: 1000,
      })

      expect(mockPrisma.account.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: '新账户',
          type: 'asset',
          initialBalance: 1000,
        }),
        include: { category: true },
      })
      expect(result).toEqual(mockAccount)
    })

    it('无余额时应该默认 0', async () => {
      mockPrisma.account.create.mockResolvedValue({ id: '1' })

      await createAccount({
        name: '新账户',
        type: 'asset',
      })

      expect(mockPrisma.account.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            initialBalance: 0,
          }),
        })
      )
    })
  })

  describe('updateAccountProfile', () => {
    it('应该更新账户基本信息', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({
        id: '1',
        name: '旧名称',
        type: 'asset',
      })
      mockPrisma.account.update.mockResolvedValue({
        id: '1',
        name: '新名称',
        type: 'asset',
      })

      const result = await updateAccountProfile('1', { name: '新名称' })

      expect(mockPrisma.account.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: expect.objectContaining({ name: '新名称' }),
        include: { category: true },
      })
      expect(result.name).toBe('新名称')
    })

    it('修改类型时应该自动查找默认分类', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({
        id: '1',
        name: '账户',
        type: 'asset',
      })
      mockPrisma.accountCategory.findFirst.mockResolvedValue({
        id: 'cat2',
        name: '负债分类',
      })
      mockPrisma.account.update.mockResolvedValue({ id: '1', categoryId: 'cat2' })

      await updateAccountProfile('1', { type: 'liability' })

      expect(mockPrisma.accountCategory.findFirst).toHaveBeenCalledWith({
        where: { type: 'liability', parentId: null },
      })
    })

    it('账户不存在时应该抛出 NotFoundError', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null)

      await expect(updateAccountProfile('999', { name: '新名称' })).rejects.toThrow(NotFoundError)
    })

    it('修改 initialBalance 时应该更新 initialBalance', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({
        id: '1',
        name: '账户',
        type: 'asset',
        initialBalance: new Decimal(1000),
      })
      mockPrisma.account.update.mockResolvedValue({ id: '1', initialBalance: new Decimal(2000) })

      await updateAccountProfile('1', { initialBalance: 2000 })

      expect(mockPrisma.account.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            initialBalance: 2000,
          }),
        })
      )
    })
  })

  describe('deleteAccount', () => {
    it('无关联数据时应该直接删除', async () => {
      mockPrisma.transaction.count.mockResolvedValue(0)
      mockPrisma.investmentAssetClass.count.mockResolvedValue(0)
      mockPrisma.investmentAllocationSnapshot.count.mockResolvedValue(0)
      mockPrisma.account.delete.mockResolvedValue({ id: '1' })

      const result = await deleteAccount('1')

      expect(result.message).toBe('删除成功')
      expect(result.deletedTransactions).toBe(0)
      expect(result.deletedAssetClasses).toBe(0)
      expect(result.deletedSnapshots).toBe(0)
    })

    it('有交易记录且非 force 删除时应该抛出 ValidationError', async () => {
      mockPrisma.transaction.count.mockResolvedValue(5)
      mockPrisma.investmentAssetClass.count.mockResolvedValue(0)
      mockPrisma.investmentAllocationSnapshot.count.mockResolvedValue(0)

      await expect(deleteAccount('1')).rejects.toThrow(ValidationError)
      expect(mockPrisma.account.delete).not.toHaveBeenCalled()
    })

    it('有投资大类且非 force 删除时应该抛出 ValidationError', async () => {
      mockPrisma.transaction.count.mockResolvedValue(0)
      mockPrisma.investmentAssetClass.count.mockResolvedValue(2)
      mockPrisma.investmentAllocationSnapshot.count.mockResolvedValue(0)

      await expect(deleteAccount('1')).rejects.toThrow(ValidationError)
      expect(mockPrisma.account.delete).not.toHaveBeenCalled()
    })

    it('有投资快照且非 force 删除时应该抛出 ValidationError', async () => {
      mockPrisma.transaction.count.mockResolvedValue(0)
      mockPrisma.investmentAssetClass.count.mockResolvedValue(0)
      mockPrisma.investmentAllocationSnapshot.count.mockResolvedValue(3)

      await expect(deleteAccount('1')).rejects.toThrow(ValidationError)
      expect(mockPrisma.account.delete).not.toHaveBeenCalled()
    })

    it('force 删除时应该级联删除交易和投资数据', async () => {
      mockPrisma.transaction.count.mockResolvedValue(3)
      mockPrisma.investmentAssetClass.count.mockResolvedValue(2)
      mockPrisma.investmentAllocationSnapshot.count.mockResolvedValue(3)
      mockPrisma.transaction.findMany.mockResolvedValue([
        { id: 't1', type: 'income', amount: new Decimal(1000), fee: new Decimal(0), coupon: new Decimal(0), accountId: '1' },
        { id: 't2', type: 'expense', amount: new Decimal(500), fee: new Decimal(0), coupon: new Decimal(0), accountId: '1' },
        { id: 't3', type: 'transfer', amount: new Decimal(300), fee: new Decimal(0), coupon: new Decimal(0), accountId: '1', toAccountId: '2' },
      ])
      mockPrisma.account.update.mockResolvedValue({ id: '1' })
      mockPrisma.transaction.deleteMany.mockResolvedValue({ count: 3 })
      mockPrisma.investmentAllocationItem.deleteMany.mockResolvedValue({ count: 5 })
      mockPrisma.investmentAllocationSnapshot.deleteMany.mockResolvedValue({ count: 3 })
      mockPrisma.investmentAssetClass.deleteMany.mockResolvedValue({ count: 2 })
      mockPrisma.account.delete.mockResolvedValue({ id: '1' })

      const result = await deleteAccount('1', true)

      expect(mockPrisma.transaction.deleteMany).toHaveBeenCalledWith({
        where: { accountId: '1' },
      })
      expect(mockPrisma.investmentAllocationSnapshot.deleteMany).toHaveBeenCalledWith({
        where: { accountId: '1' },
      })
      expect(mockPrisma.investmentAssetClass.deleteMany).toHaveBeenCalledWith({
        where: { accountId: '1' },
      })
      expect(mockPrisma.account.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      })
      expect(result.deletedTransactions).toBe(3)
      expect(result.deletedAssetClasses).toBe(2)
      expect(result.deletedSnapshots).toBe(3)
    })
  })

  describe('getAccountStats', () => {
    it('应该正确统计收入和支出', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([
        { id: 't1', type: 'income', amount: new Decimal(5000) },
        { id: 't2', type: 'expense', amount: new Decimal(2000) },
        { id: 't3', type: 'expense', amount: new Decimal(1000) },
        { id: 't4', type: 'transfer', amount: new Decimal(3000) },
      ])

      const result = await getAccountStats('1')

      expect(result.transactionCount).toBe(4)
      expect(result.totalIncome).toBe(5000)
      expect(result.totalExpense).toBe(3000)
    })

    it('无交易记录时应该返回 0', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([])

      const result = await getAccountStats('1')

      expect(result.transactionCount).toBe(0)
      expect(result.totalIncome).toBe(0)
      expect(result.totalExpense).toBe(0)
    })
  })

  describe('adjustAccountBalance', () => {
    it('应该创建调整交易', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({
        id: '1',
        name: '账户',
        initialBalance: new Decimal(1000),
      })
      mockPrisma.transaction.create.mockResolvedValue({
        id: 'adj1',
        type: 'adjustment',
        amount: new Decimal(500),
      })

      const result = await adjustAccountBalance('1', 500)

      expect(result.transaction).toBeDefined()
      expect(result.transaction.type).toBe('adjustment')
    })

    it('账户不存在时应该抛出 NotFoundError', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null)

      await expect(adjustAccountBalance('999', 100)).rejects.toThrow(NotFoundError)
    })
  })

  describe('updateAccountSorts', () => {
    it('应该批量更新排序', async () => {
      mockPrisma.$transaction.mockImplementation(async (array: any) => {
        return Promise.all(array)
      })
      mockPrisma.account.update.mockResolvedValue({ id: '1' })

      await updateAccountSorts([
        { id: '1', sort: 0, categoryId: null },
        { id: '2', sort: 1, categoryId: 'cat1' },
      ])

      expect(mockPrisma.$transaction).toHaveBeenCalled()
      expect(mockPrisma.account.update).toHaveBeenCalledTimes(2)
    })
  })
})
