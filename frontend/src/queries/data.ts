import { useMutation } from '@tanstack/react-query'
import { dataApi } from '../services/api'

export function useExportCsv() {
  return useMutation({
    mutationFn: async (params?: { startDate?: string; endDate?: string }) => {
      const res = await dataApi.exportCsv(params)
      return res.data
    },
  })
}

export function useImportCsv() {
  return useMutation({
    mutationFn: async ({ file, params }: { file: File; params?: { startDate?: string; endDate?: string } }) => {
      const res = await dataApi.importCsv(file, params)
      return res.data
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
  return useMutation({
    mutationFn: async (file: File) => {
      const res = await dataApi.importConfig(file)
      return res.data
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
  return useMutation({
    mutationFn: async (file: File) => {
      const res = await dataApi.importBudgets(file)
      return res.data
    },
  })
}

export function useClearAll() {
  return useMutation({
    mutationFn: async () => {
      const res = await dataApi.clearAll()
      return res.data
    },
  })
}

export function useClearTransactions() {
  return useMutation({
    mutationFn: async () => {
      const res = await dataApi.clearTransactions()
      return res.data
    },
  })
}
