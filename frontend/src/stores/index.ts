import { create } from 'zustand'
import { createAccountSlice, type AccountSlice } from './accountSlice'
import { createTransactionSlice, type TransactionSlice } from './transactionSlice'
import { createCategorySlice, type CategorySlice } from './categorySlice'
import { createBudgetSlice, type BudgetSlice } from './budgetSlice'

export type AppState = AccountSlice & TransactionSlice & CategorySlice & BudgetSlice & {
  loading: boolean
}

export const useStore = create<AppState>()((...a) => ({
  loading: false,
  ...createAccountSlice(...a),
  ...createTransactionSlice(...a),
  ...createCategorySlice(...a),
  ...createBudgetSlice(...a),
}))
