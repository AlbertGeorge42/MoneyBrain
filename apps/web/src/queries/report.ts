import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { reportApi } from '../services/api'
import { unwrapApiData } from '../services/apiResult'
import { queryKeys } from './keys'

export function useBalanceSheet(date: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reports.balanceSheet(date),
    queryFn: () => reportApi.getBalanceSheet(date).then(unwrapApiData),
    enabled: !!date && enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

export function useIncomeExpense(startDate: string, endDate: string, includePredictions?: boolean, includeExcluded?: boolean, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reports.incomeExpense(startDate, endDate, includePredictions, includeExcluded),
    queryFn: () => reportApi.getIncomeExpense(startDate, endDate, includePredictions, includeExcluded).then(unwrapApiData),
    enabled: !!startDate && !!endDate && enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

export function useCashFlow(startDate: string, endDate: string, includePredictions?: boolean, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reports.cashFlow(startDate, endDate, includePredictions),
    queryFn: () => reportApi.getCashFlow(startDate, endDate, includePredictions).then(unwrapApiData),
    enabled: !!startDate && !!endDate && enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

export function useInvestmentAnalysis(startDate: string, endDate: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reports.investmentAnalysis(startDate, endDate),
    queryFn: () => reportApi.getInvestmentAnalysis(startDate, endDate).then(unwrapApiData),
    enabled: !!startDate && !!endDate && enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}
