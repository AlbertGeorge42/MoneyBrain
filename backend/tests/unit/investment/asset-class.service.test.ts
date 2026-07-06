import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getAssetClassesByAccount,
  createAssetClass,
  updateAssetClass,
  deleteAssetClass,
  reorderAssetClasses,
} from '../../../src/services/investment/asset-class.service.js'
import { NotFoundError, ValidationError } from '../../../src/common/error.js'

// Mock prisma - 工厂函数内部不能引用外部变量
vi.mock('../../../src/index.js', () => {
  // 在工厂函数内部定义 mockPrisma
  const mockPrisma = {
    account: {
      findUnique: vi.fn(),
    },
    investmentAssetClass: {
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
      take: vi.fn(),
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

describe('asset-class.service', () => {
  const mockPrisma = prisma as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAssetClassesByAccount', () => {
    it('应该返回账户下的资产类型列表', async () => {
      const mockAccount = { id: 'acc1', name: '测试账户' }
      const mockAssetClasses = [
        { id: 'class1', name: '股票', sort: 0, targetRatio: 60 },
        { id: 'class2', name: '债券', sort: 1, targetRatio: 40 },
      ]
      mockPrisma.account.findUnique.mockResolvedValue(mockAccount)
      mockPrisma.investmentAssetClass.findMany.mockResolvedValue(mockAssetClasses)

      const result = await getAssetClassesByAccount('acc1')

      expect(mockPrisma.account.findUnique).toHaveBeenCalledWith({
        where: { id: 'acc1' },
      })
      expect(mockPrisma.investmentAssetClass.findMany).toHaveBeenCalledWith({
        where: { accountId: 'acc1' },
        orderBy: { sort: 'asc' },
      })
      expect(result).toEqual(mockAssetClasses)
    })

    it('账户不存在时应该抛出 NotFoundError', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null)

      await expect(getAssetClassesByAccount('nonexistent')).rejects.toThrow(NotFoundError)
    })
  })

  describe('createAssetClass', () => {
    it('应该创建新的资产类型', async () => {
      const mockAccount = { id: 'acc1', name: '测试账户' }
      const mockAssetClass = { id: 'class1', name: '股票', sort: 0, targetRatio: 60 }
      mockPrisma.account.findUnique.mockResolvedValue(mockAccount)
      mockPrisma.investmentAssetClass.findFirst.mockResolvedValue(null) // 无名称重复
      mockPrisma.investmentAssetClass.findMany.mockResolvedValue([]) // 总和校验
      mockPrisma.investmentAssetClass.create.mockResolvedValue(mockAssetClass)

      const result = await createAssetClass('acc1', { name: '股票', targetRatio: 60 })

      expect(mockPrisma.investmentAssetClass.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accountId: 'acc1',
          name: '股票',
          targetRatio: 60,
          sort: 0,
        }),
      })
      expect(result).toEqual(mockAssetClass)
    })

    it('应该正确计算排序值（已有资产类型时）', async () => {
      const mockAccount = { id: 'acc1', name: '测试账户' }
      const existingMaxSort = { sort: 5 }
      mockPrisma.account.findUnique.mockResolvedValue(mockAccount)
      // 第一个 findFirst：检查名称重复，返回 null
      // 第二个 findFirst：获取最大 sort，返回 existingMaxSort
      mockPrisma.investmentAssetClass.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(existingMaxSort)
      mockPrisma.investmentAssetClass.findMany.mockResolvedValue([])
      mockPrisma.investmentAssetClass.create.mockResolvedValue({ id: 'class1', name: '股票', sort: 6 })

      await createAssetClass('acc1', { name: '股票' })

      expect(mockPrisma.investmentAssetClass.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sort: 6,
          }),
        })
      )
    })

    it('空名称时应该抛出 ValidationError', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: 'acc1' })

      await expect(createAssetClass('acc1', { name: '' })).rejects.toThrow(ValidationError)
    })

    it('名称重复时应该抛出 ValidationError', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: 'acc1' })
      mockPrisma.investmentAssetClass.findFirst.mockResolvedValue({ id: 'existing', name: '股票' })

      await expect(createAssetClass('acc1', { name: '股票' })).rejects.toThrow(ValidationError)
    })

    it('targetRatio 超出范围时应该抛出 ValidationError', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: 'acc1' })
      mockPrisma.investmentAssetClass.findFirst.mockResolvedValue(null)

      await expect(createAssetClass('acc1', { name: '股票', targetRatio: 150 })).rejects.toThrow(ValidationError)
      await expect(createAssetClass('acc1', { name: '股票', targetRatio: -10 })).rejects.toThrow(ValidationError)
    })

    it('targetRatio 总和超过 100 时应该抛出 ValidationError', async () => {
      mockPrisma.account.findUnique.mockResolvedValue({ id: 'acc1' })
      mockPrisma.investmentAssetClass.findFirst.mockResolvedValue(null)
      mockPrisma.investmentAssetClass.create.mockResolvedValue({ id: 'class1', name: '股票', targetRatio: 60 })
      mockPrisma.investmentAssetClass.findMany.mockResolvedValue([
        { targetRatio: 50 },
        { targetRatio: 60 }, // 新创建的
      ])

      await expect(createAssetClass('acc1', { name: '股票', targetRatio: 60 })).rejects.toThrow(ValidationError)
    })

    it('账户不存在时应该抛出 NotFoundError', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null)

      await expect(createAssetClass('nonexistent', { name: '股票' })).rejects.toThrow(NotFoundError)
    })
  })

  describe('updateAssetClass', () => {
    it('应该更新资产类型', async () => {
      const existing = { id: 'class1', name: '旧名称', icon: null, targetRatio: null, accountId: 'acc1' }
      const updated = { id: 'class1', name: '新名称', icon: 'icon', targetRatio: 50 }
      mockPrisma.investmentAssetClass.findUnique.mockResolvedValue(existing)
      mockPrisma.investmentAssetClass.findMany.mockResolvedValue([])
      mockPrisma.investmentAssetClass.update.mockResolvedValue(updated)

      const result = await updateAssetClass('class1', { name: '新名称', icon: 'icon', targetRatio: 50 })

      expect(mockPrisma.investmentAssetClass.update).toHaveBeenCalledWith({
        where: { id: 'class1' },
        data: {
          name: '新名称',
          icon: 'icon',
          targetRatio: 50,
        },
      })
      expect(result).toEqual(updated)
    })

    it('资产类型不存在时应该抛出 NotFoundError', async () => {
      mockPrisma.investmentAssetClass.findUnique.mockResolvedValue(null)

      await expect(updateAssetClass('nonexistent', { name: '新名称' })).rejects.toThrow(NotFoundError)
    })

    it('名称重复时应该抛出 ValidationError', async () => {
      const existing = { id: 'class1', name: '旧名称', accountId: 'acc1' }
      mockPrisma.investmentAssetClass.findUnique.mockResolvedValue(existing)
      mockPrisma.investmentAssetClass.findFirst.mockResolvedValue({ id: 'other', name: '已存在' })

      await expect(updateAssetClass('class1', { name: '已存在' })).rejects.toThrow(ValidationError)
    })
  })

  describe('deleteAssetClass', () => {
    it('无快照引用时应该成功删除', async () => {
      mockPrisma.investmentAssetClass.findUnique.mockResolvedValue({
        id: 'class1',
        allocationItems: [],
      })

      const result = await deleteAssetClass('class1')

      expect(mockPrisma.investmentAssetClass.delete).toHaveBeenCalledWith({ where: { id: 'class1' } })
      expect(result.message).toBe('删除成功')
    })

    it('有快照引用时应该返回二次确认信息', async () => {
      mockPrisma.investmentAssetClass.findUnique.mockResolvedValue({
        id: 'class1',
        allocationItems: [{ id: 'item1' }],
      })

      const result = await deleteAssetClass('class1')
      expect(result).toEqual({
        message: '需要二次确认',
        snapshotsCount: 1,
        needConfirm: true,
      })
      expect(mockPrisma.investmentAssetClass.delete).not.toHaveBeenCalled()
    })

    it('资产类型不存在时应该抛出 NotFoundError', async () => {
      mockPrisma.investmentAssetClass.findUnique.mockResolvedValue(null)

      await expect(deleteAssetClass('nonexistent')).rejects.toThrow(NotFoundError)
    })
  })

  describe('reorderAssetClasses', () => {
    it('应该批量更新排序', async () => {
      mockPrisma.$transaction.mockResolvedValue([])

      const result = await reorderAssetClasses('acc1', ['id1', 'id2', 'id3'])

      expect(mockPrisma.$transaction).toHaveBeenCalled()
      expect(mockPrisma.investmentAssetClass.updateMany).toHaveBeenCalledTimes(3)
      expect(result.message).toBe('排序已更新')
    })
  })
})
