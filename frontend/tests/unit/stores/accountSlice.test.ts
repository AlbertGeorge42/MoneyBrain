import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAccountSlice, type AccountSlice } from '../../../src/stores/accountSlice'

// Mock API
vi.mock('../../../src/services/api', () => ({
  accountCategoryApi: {
    getAll: vi.fn(),
    update: vi.fn(),
  },
  accountApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

import { accountCategoryApi, accountApi } from '../../../src/services/api'

describe('accountSlice', () => {
  let set: any
  let get: any
  let slice: AccountSlice

  beforeEach(() => {
    vi.clearAllMocks()
    const state: any = {
      loading: false,
      accounts: [],
      accountCategories: [],
    }

    set = (partial: any) => {
      Object.assign(state, partial)
    }

    get = () => state

    slice = createAccountSlice(set, get, state)

    // 将 slice 的方法注入到 state 中，使 get() 可以访问这些方法
    Object.assign(state, slice)
  })

  describe('fetchAccountCategories', () => {
    it('应该获取账户分类并更新状态', async () => {
      const mockCategories = [
        { id: '1', name: '现金', type: 'asset' },
        { id: '2', name: '投资', type: 'asset' },
      ]
      ;(accountCategoryApi.getAll as any).mockResolvedValue({
        data: { success: true, data: mockCategories },
      })

      await slice.fetchAccountCategories()

      expect(accountCategoryApi.getAll).toHaveBeenCalled()
      expect(get().accountCategories).toEqual(mockCategories)
    })

    it('API 失败时不应该更新状态', async () => {
      ;(accountCategoryApi.getAll as any).mockResolvedValue({
        data: { success: false },
      })

      await slice.fetchAccountCategories()

      expect(get().accountCategories).toEqual([])
    })
  })

  describe('fetchAccounts', () => {
    it('应该获取账户列表并更新状态', async () => {
      const mockAccounts = [
        { id: '1', name: '工资卡', balance: 10000 },
        { id: '2', name: '支付宝', balance: 5000 },
      ]
      ;(accountApi.getAll as any).mockResolvedValue({
        data: { success: true, data: mockAccounts },
      })

      await slice.fetchAccounts()

      expect(accountApi.getAll).toHaveBeenCalled()
      expect(get().accounts).toEqual(mockAccounts)
      expect(get().loading).toBe(false)
    })

    it('应该设置 loading 状态', async () => {
      ;(accountApi.getAll as any).mockResolvedValue({
        data: { success: true, data: [] },
      })

      const promise = slice.fetchAccounts()
      expect(get().loading).toBe(true)
      await promise
      expect(get().loading).toBe(false)
    })
  })

  describe('addAccount', () => {
    it('创建成功后应该刷新账户列表', async () => {
      ;(accountApi.create as any).mockResolvedValue({
        data: { success: true, data: { id: '1', name: '新账户' } },
      })
      ;(accountApi.getAll as any).mockResolvedValue({
        data: { success: true, data: [{ id: '1', name: '新账户' }] },
      })

      await slice.addAccount({ name: '新账户', type: 'asset' })

      expect(accountApi.create).toHaveBeenCalledWith({ name: '新账户', type: 'asset' })
      expect(accountApi.getAll).toHaveBeenCalled()
    })
  })

  describe('updateAccount', () => {
    it('更新成功后应该刷新账户列表', async () => {
      ;(accountApi.update as any).mockResolvedValue({
        data: { success: true },
      })
      ;(accountApi.getAll as any).mockResolvedValue({
        data: { success: true, data: [{ id: '1', name: '更新后' }] },
      })

      await slice.updateAccount('1', { name: '更新后' })

      expect(accountApi.update).toHaveBeenCalledWith('1', { name: '更新后' })
    })
  })

  describe('deleteAccount', () => {
    it('删除成功后应该刷新账户列表', async () => {
      ;(accountApi.delete as any).mockResolvedValue({
        data: { success: true },
      })
      ;(accountApi.getAll as any).mockResolvedValue({
        data: { success: true, data: [] },
      })

      await slice.deleteAccount('1')

      expect(accountApi.delete).toHaveBeenCalledWith('1', undefined)
    })

    it('force 删除应该传递参数', async () => {
      ;(accountApi.delete as any).mockResolvedValue({
        data: { success: true },
      })

      await slice.deleteAccount('1', true)

      expect(accountApi.delete).toHaveBeenCalledWith('1', true)
    })
  })
})
