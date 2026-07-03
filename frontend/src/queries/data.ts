import { useMutation, useQueryClient } from '@tanstack/react-query'
import { dataApi } from '../services/api'
import { queryKeys } from './keys'

export function useClearAll() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await dataApi.clearAll()
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.accountCategories.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionCategories.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.all })
    },
  })
}

export function useClearTransactions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await dataApi.clearTransactions()
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.all })
    },
  })
}
