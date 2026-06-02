import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { transactionCategoryApi } from '../services/api'
import type { TransactionCategory } from '../services/api'
import { queryKeys } from './keys'

export function useTransactionCategories() {
  return useQuery({
    queryKey: queryKeys.transactionCategories.all,
    queryFn: () => transactionCategoryApi.getAll().then((res) => res.data.data ?? []),
  })
}

export function useCreateTransactionCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<TransactionCategory>) => transactionCategoryApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionCategories.all })
    },
  })
}

export function useUpdateTransactionCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TransactionCategory> }) =>
      transactionCategoryApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionCategories.all })
    },
  })
}

export function useDeleteTransactionCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, params }: { id: string; params?: { transferToCategoryId?: string; deleteTransactions?: boolean } }) =>
      transactionCategoryApi.delete(id, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionCategories.all })
    },
  })
}

export function useMoveTransactionCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, newParentId }: { id: string; newParentId: string | null }) =>
      transactionCategoryApi.move(id, { newParentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionCategories.all })
    },
  })
}
