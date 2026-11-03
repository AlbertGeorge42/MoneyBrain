import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { budgetApi } from '../services/api'
import { unwrapApiData } from '../services/apiResult'
import type { Budget } from '../services/api'
import { queryKeys } from './keys'

export function useBudgets(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.budgets.list(params),
    queryFn: () => budgetApi.getAll(params).then(unwrapApiData),
  })
}

export function useBudgetStatuses(ids: string[]) {
  return useQuery({
    queryKey: queryKeys.budgets.statuses(ids),
    queryFn: () => budgetApi.getStatuses(ids).then(unwrapApiData),
    enabled: ids.length > 0,
  })
}

// 预算下钻明细（C2）：与用量同一口径
export function useBudgetUsageDetails(budgetId: string | null) {
  return useQuery({
    queryKey: queryKeys.budgets.usageDetails(budgetId ?? ''),
    queryFn: () => budgetApi.getUsageDetails(budgetId!).then(unwrapApiData),
    enabled: budgetId != null,
  })
}

export function useBudgetPredictions(startDate: string, endDate: string) {
  return useQuery({
    queryKey: queryKeys.budgets.predictions(startDate, endDate),
    queryFn: () => budgetApi.getPredictions(startDate, endDate).then(unwrapApiData),
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
