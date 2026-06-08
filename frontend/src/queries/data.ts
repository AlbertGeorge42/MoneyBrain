import { useMutation, useQueryClient } from '@tanstack/react-query'
import { dataApi } from '../services/api'
import { queryKeys } from './keys'

export function useExportCsv() {
  return useMutation({
    mutationFn: async (params?: { startDate?: string; endDate?: string }) => {
      const res = await dataApi.exportCsv(params)
      return res.data
    },
  })
}

export function useImportCsv() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, params }: { file: File; params?: { startDate?: string; endDate?: string } }) => {
      const res = await dataApi.importCsv(file, params)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.accountCategories.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionCategories.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all })
    },
  })
}

export function useExportConfig() {
  return useMutation({
    mutationFn: async () => {
      const res = await dataApi.exportConfig()
      return res.data
    },
  })
}

export function useImportConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const res = await dataApi.importConfig(file)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.accountCategories.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.transactionCategories.all })
    },
  })
}

export function useExportBudgets() {
  return useMutation({
    mutationFn: async () => {
      const res = await dataApi.exportBudgets()
      return res.data
    },
  })
}

export function useImportBudgets() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const res = await dataApi.importBudgets(file)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.all })
    },
  })
}

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
