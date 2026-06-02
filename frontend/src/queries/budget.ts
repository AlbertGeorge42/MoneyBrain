import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { budgetApi } from '../services/api'
import type { Budget } from '../services/api'
import { queryKeys } from './keys'

export function useBudgets(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.budgets.list(params),
    queryFn: () => budgetApi.getAll(params).then((res) => res.data.data ?? []),
  })
}

export function useBudgetStatus(id: string) {
  return useQuery({
    queryKey: queryKeys.budgets.status(id),
    queryFn: () => budgetApi.getStatus(id).then((res) => res.data.data!),
    enabled: !!id,
  })
}

export function useBudgetStatuses(ids: string[]) {
  return useQuery({
    queryKey: queryKeys.budgets.statuses(ids),
    queryFn: () => budgetApi.getStatuses(ids).then((res) => res.data.data ?? []),
    enabled: ids.length > 0,
  })
}

export function useBudgetPredictions(startDate: string, endDate: string) {
  return useQuery({
    queryKey: queryKeys.budgets.predictions(startDate, endDate),
    queryFn: () => budgetApi.getPredictions(startDate, endDate).then((res) => res.data.data ?? []),
    enabled: !!startDate && !!endDate,
  })
}

export function useCreateBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Budget>) => budgetApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.all })
    },
  })
}

export function useUpdateBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Budget> }) => budgetApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.all })
    },
  })
}

export function useDeleteBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => budgetApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.all })
    },
  })
}
