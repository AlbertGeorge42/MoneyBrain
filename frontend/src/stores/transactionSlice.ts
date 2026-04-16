import type { StateCreator } from 'zustand'
import { Transaction, transactionApi } from '../services/api'
import type { AppState } from './index'

export interface TransactionStats {
  income: number
  expense: number
  refund: number
  balance: number
  transferCount: number
}

export interface TransactionSlice {
  transactions: Transaction[]
  pagination: { total: number; page: number; pageSize: number }
  stats: TransactionStats
  fetchTransactions: (params?: Record<string, unknown>) => Promise<void>
  fetchTransactionStats: (params?: Record<string, unknown>) => Promise<void>
  addTransaction: (data: Partial<Transaction>) => Promise<void>
  updateTransaction: (id: string, data: Partial<Transaction>) => Promise<void>
  deleteTransaction: (id: string) => Promise<void>
}

export const createTransactionSlice: StateCreator<AppState, [], [], TransactionSlice> = (set, get) => ({
  transactions: [],
  pagination: { total: 0, page: 1, pageSize: 20 },
  stats: { income: 0, expense: 0, refund: 0, balance: 0, transferCount: 0 },

  fetchTransactions: async (params) => {
    try {
      set({ loading: true })
      const res = await transactionApi.getAll(params)
      if (res.data.success && res.data.data) {
        set({ 
          transactions: res.data.data.list || [], 
          loading: false,
          pagination: {
            total: res.data.data.total || 0,
            page: res.data.data.page || 1,
            pageSize: res.data.data.pageSize || 20,
          }
        })
      }
    } catch (error) {
      console.error('获取交易记录失败:', error)
      set({ loading: false })
    }
  },

  fetchTransactionStats: async (params) => {
    try {
      const res = await transactionApi.getStats(params)
      if (res.data.success && res.data.data) {
        set({ stats: res.data.data })
      }
    } catch (error) {
      console.error('获取交易统计失败:', error)
    }
  },

  addTransaction: async (data) => {
    const res = await transactionApi.create(data)
    if (res.data.success) {
      await get().fetchTransactions()
      await get().fetchAccounts()
      await get().fetchTransactionStats()
    }
  },

  updateTransaction: async (id, data) => {
    const res = await transactionApi.update(id, data)
    if (res.data.success) {
      await get().fetchTransactions()
      await get().fetchAccounts()
      await get().fetchTransactionStats()
    }
  },

  deleteTransaction: async (id) => {
    const res = await transactionApi.delete(id)
    if (res.data.success) {
      await get().fetchTransactions()
      await get().fetchAccounts()
      await get().fetchTransactionStats()
    }
  },
})
