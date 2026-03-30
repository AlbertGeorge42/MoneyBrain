import type { StateCreator } from 'zustand'
import { TransactionCategory, transactionCategoryApi } from '../services/api'
import type { AppState } from './index'

export interface CategorySlice {
  transactionCategories: TransactionCategory[]
  fetchTransactionCategories: () => Promise<void>
  addTransactionCategory: (data: Partial<TransactionCategory>) => Promise<void>
  updateTransactionCategory: (id: string, data: Partial<TransactionCategory>) => Promise<void>
  deleteTransactionCategory: (id: string) => Promise<void>
}

export const createCategorySlice: StateCreator<AppState, [], [], CategorySlice> = (set, get) => ({
  transactionCategories: [],

  fetchTransactionCategories: async () => {
    try {
      const res = await transactionCategoryApi.getAll()
      if (res.data.success && res.data.data) {
        set({ transactionCategories: res.data.data })
      }
    } catch (error) {
      console.error('获取收支分类失败:', error)
    }
  },

  addTransactionCategory: async (data) => {
    const res = await transactionCategoryApi.create(data)
    if (res.data.success) {
      await get().fetchTransactionCategories()
    }
  },

  updateTransactionCategory: async (id, data) => {
    const res = await transactionCategoryApi.update(id, data)
    if (res.data.success) {
      await get().fetchTransactionCategories()
    }
  },

  deleteTransactionCategory: async (id) => {
    const res = await transactionCategoryApi.delete(id)
    if (res.data.success) {
      await get().fetchTransactionCategories()
    }
  },
})
