import type { StateCreator } from 'zustand'
import { AccountCategory, Account, accountCategoryApi, accountApi } from '../services/api'
import type { AppState } from './index'

export interface AccountSlice {
  accountCategories: AccountCategory[]
  accounts: Account[]
  fetchAccountCategories: () => Promise<void>
  fetchAccounts: () => Promise<void>
  addAccount: (data: Partial<Account>) => Promise<void>
  updateAccount: (id: string, data: Partial<Account>) => Promise<void>
  deleteAccount: (id: string, force?: boolean) => Promise<void>
  updateAccountCategoryAssetType: (id: string, assetType: 'cash' | 'investment' | 'other') => Promise<void>
}

export const createAccountSlice: StateCreator<AppState, [], [], AccountSlice> = (set, get) => ({
  accountCategories: [],
  accounts: [],

  fetchAccountCategories: async () => {
    try {
      const res = await accountCategoryApi.getAll()
      if (res.data.success && res.data.data) {
        set({ accountCategories: res.data.data })
      }
    } catch (error) {
      console.error('获取账户分类失败:', error)
    }
  },

  fetchAccounts: async () => {
    try {
      set({ loading: true })
      const res = await accountApi.getAll()
      if (res.data.success && res.data.data) {
        set({ accounts: res.data.data, loading: false })
      }
    } catch (error) {
      console.error('获取账户失败:', error)
      set({ loading: false })
    }
  },

  addAccount: async (data) => {
    const res = await accountApi.create(data)
    if (res.data.success) {
      await get().fetchAccounts()
    }
  },

  updateAccount: async (id, data) => {
    const res = await accountApi.update(id, data)
    if (res.data.success) {
      await get().fetchAccounts()
    }
  },

  deleteAccount: async (id, force) => {
    const res = await accountApi.delete(id, force)
    if (res.data.success) {
      await get().fetchAccounts()
    }
  },

  updateAccountCategoryAssetType: async (id: string, assetType: 'cash' | 'investment' | 'other') => {
    try {
      const updateData = {
        isCashEquivalent: assetType === 'cash',
        isInvestment: assetType === 'investment',
      }
      await accountCategoryApi.update(id, updateData)
      await get().fetchAccountCategories()
    } catch (error) {
      console.error('更新账户分类资产类型失败:', error)
    }
  },
})
