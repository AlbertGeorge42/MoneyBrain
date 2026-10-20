import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { transactionApi } from '../services/api'
import type { Transaction } from '../services/api'
import { queryKeys } from './keys'
import { invalidateLedger } from './ledger'

export function useTransactions(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.transactions.list(params),
    queryFn: () => transactionApi.getAll(params).then((res) => res.data.data ?? { list: [], total: 0, page: 1, pageSize: 20 }),
  })
}

export function useTransactionStats(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.transactions.stats(params),
    queryFn: () => transactionApi.getStats(params).then((res) => res.data.data!),
  })
}

export function useTransactionEarliestDate() {
  return useQuery({
    queryKey: queryKeys.transactions.earliest,
    queryFn: () => transactionApi.getEarliestDate().then((res) => res.data.data),
  })
}

export function useTransactionRefundableList() {
  return useQuery({
    queryKey: queryKeys.transactions.refundable,
    queryFn: () => transactionApi.getRefundableList().then((res) => res.data.data ?? []),
  })
}

export function useCreateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Transaction>) => transactionApi.create(data),
    onSuccess: () => invalidateLedger(queryClient),
  })
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Transaction> }) => transactionApi.update(id, data),
    onSuccess: () => invalidateLedger(queryClient),
  })
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => transactionApi.delete(id),
    onSuccess: () => invalidateLedger(queryClient),
  })
}
