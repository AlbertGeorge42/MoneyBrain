import type { StateCreator } from 'zustand'
import { Budget, budgetApi } from '../services/api'
import type { AppState } from './index'

export interface BudgetSlice {
  budgets: Budget[]
  fetchBudgets: () => Promise<void>
  addBudget: (data: Partial<Budget>) => Promise<void>
  updateBudget: (id: string, data: Partial<Budget>) => Promise<void>
  deleteBudget: (id: string) => Promise<void>
}

export const createBudgetSlice: StateCreator<AppState, [], [], BudgetSlice> = (set, get) => ({
  budgets: [],

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
      set((state) => ({
        budgets: state.budgets.filter((b) => b.id !== id),
      }))
    }
  },
})