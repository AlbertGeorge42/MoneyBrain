import { create } from 'zustand'
import { Account, AccountCategory, TransactionCategory, Transaction, Budget, accountCategoryApi, accountApi, transactionCategoryApi, transactionApi, budgetApi } from '../services/api'

interface AppState {
  accountCategories: AccountCategory[]
  accounts: Account[]
  transactionCategories: TransactionCategory[]
  transactions: Transaction[]
  budgets: Budget[]
  loading: boolean
  pagination: {
    total: number
    page: number
    pageSize: number
  }
  
  fetchAccountCategories: () => Promise<void>
  fetchAccounts: () => Promise<void>
  fetchTransactionCategories: () => Promise<void>
  fetchTransactions: (params?: Record<string, unknown>) => Promise<void>
  fetchBudgets: () => Promise<void>
  
  addAccount: (data: Partial<Account>) => Promise<void>
  updateAccount: (id: string, data: Partial<Account>) => Promise<void>
  deleteAccount: (id: string, force?: boolean) => Promise<void>
  
  addTransactionCategory: (data: Partial<TransactionCategory>) => Promise<void>
  updateTransactionCategory: (id: string, data: Partial<TransactionCategory>) => Promise<void>
  deleteTransactionCategory: (id: string) => Promise<void>
  
  addTransaction: (data: Partial<Transaction>) => Promise<void>
  updateTransaction: (id: string, data: Partial<Transaction>) => Promise<void>
  deleteTransaction: (id: string) => Promise<void>
  
  addBudget: (data: Partial<Budget>) => Promise<void>
  updateBudget: (id: string, data: Partial<Budget>) => Promise<void>
  deleteBudget: (id: string) => Promise<void>
  
  updateAccountCategoryCashEquivalent: (id: string, isCashEquivalent: boolean) => Promise<void>
}

export const useStore = create<AppState>((set, get) => ({
  accountCategories: [],
  accounts: [],
  transactionCategories: [],
  transactions: [],
  budgets: [],
  loading: false,
  pagination: {
    total: 0,
    page: 1,
    pageSize: 20,
  },

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

  fetchBudgets: async () => {
    try {
      const res = await budgetApi.getAll()
      if (res.data.success && res.data.data) {
        set({ budgets: res.data.data })
      }
    } catch (error) {
      console.error('获取预算失败:', error)
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

  deleteAccount: async (id: string, force?: boolean) => {
    const res = await accountApi.delete(id, force)
    if (res.data.success) {
      await get().fetchAccounts()
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

  addTransaction: async (data) => {
    const res = await transactionApi.create(data)
    if (res.data.success) {
      await get().fetchTransactions()
      await get().fetchAccounts()
    }
  },

  updateTransaction: async (id, data) => {
    const res = await transactionApi.update(id, data)
    if (res.data.success) {
      await get().fetchTransactions()
      await get().fetchAccounts()
    }
  },

  deleteTransaction: async (id) => {
    const res = await transactionApi.delete(id)
    if (res.data.success) {
      await get().fetchTransactions()
      await get().fetchAccounts()
    }
  },

  addBudget: async (data) => {
    const res = await budgetApi.create(data)
    if (res.data.success) {
      await get().fetchBudgets()
    }
  },

  updateBudget: async (id, data) => {
    const res = await budgetApi.update(id, data)
    if (res.data.success) {
      await get().fetchBudgets()
    }
  },

  deleteBudget: async (id) => {
    const res = await budgetApi.delete(id)
    if (res.data.success) {
      await get().fetchBudgets()
    }
  },

  updateAccountCategoryCashEquivalent: async (id: string, isCashEquivalent: boolean) => {
    try {
      await accountCategoryApi.update(id, { isCashEquivalent })
      const res = await accountCategoryApi.getAll()
      set({ accountCategories: res.data.data || [] })
    } catch (error) {
      throw error
    }
  },
}))
