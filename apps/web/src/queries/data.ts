import { useMutation, useQueryClient } from '@tanstack/react-query'
import { dataApi } from '../services/api'
import { queryKeys } from './keys'
import { invalidateLedger } from './ledger'

export function useClearAll() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await dataApi.clearAll()
      return res.data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.accountCategories.all })
      await queryClient.invalidateQueries({ queryKey: queryKeys.transactionCategories.all })
      await invalidateLedger(queryClient)
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
    onSuccess: () => invalidateLedger(queryClient),
  })
}
