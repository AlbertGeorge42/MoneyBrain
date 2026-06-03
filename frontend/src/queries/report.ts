import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { reportApi, investmentApi } from '../services/api'
import { queryKeys } from './keys'

export function useBalanceSheet(date: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reports.balanceSheet(date),
    queryFn: () => reportApi.getBalanceSheet(date).then((res) => res.data.data!),
    enabled: !!date && enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

export function useIncomeExpense(startDate: string, endDate: string, includePredictions?: boolean, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reports.incomeExpense(startDate, endDate, includePredictions),
    queryFn: () => reportApi.getIncomeExpense(startDate, endDate, includePredictions).then((res) => res.data.data!),
    enabled: !!startDate && !!endDate && enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

export function useCashFlow(startDate: string, endDate: string, includePredictions?: boolean, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reports.cashFlow(startDate, endDate, includePredictions),
    queryFn: () => reportApi.getCashFlow(startDate, endDate, includePredictions).then((res) => res.data.data!),
    enabled: !!startDate && !!endDate && enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

export function useInvestmentAnalysis(startDate: string, endDate: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reports.investmentAnalysis(startDate, endDate),
    queryFn: () => reportApi.getInvestmentAnalysis(startDate, endDate).then((res) => res.data.data!),
    enabled: !!startDate && !!endDate && enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

export function useInvestmentAssetClasses(accountId: string) {
  return useQuery({
    queryKey: queryKeys.investment.assetClasses(accountId),
    queryFn: () => investmentApi.getAssetClasses(accountId).then((res) => res.data.data ?? []),
    enabled: !!accountId,
  })
}

export function useInvestmentSnapshots(accountId: string, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: queryKeys.investment.snapshots(accountId, startDate, endDate),
    queryFn: () => investmentApi.getSnapshots(accountId, startDate, endDate).then((res) => res.data.data ?? []),
    enabled: !!accountId,
  })
}

export function useInvestmentLatestSnapshot(accountId: string, beforeDate?: string) {
  return useQuery({
    queryKey: queryKeys.investment.latestSnapshot(accountId, beforeDate),
    queryFn: () => investmentApi.getLatestSnapshot(accountId, beforeDate).then((res) => res.data.data),
    enabled: !!accountId,
  })
}
