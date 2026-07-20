import { useQuery } from '@tanstack/react-query'
import { analyticsApi, investmentApi } from '../services/api'
import { queryKeys } from './keys'

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: () => analyticsApi.getDashboardSummary().then((res) => res.data.data!),
  })
}

export function useTrends(type: 'income' | 'expense', period?: string) {
  return useQuery({
    queryKey: queryKeys.analytics.trends(type, period),
    queryFn: () => analyticsApi.getTrends(type, period).then((res) => res.data.data ?? []),
  })
}

export function useCategoryBreakdown(type: 'income' | 'expense', startDate?: string, endDate?: string, parentCategoryId?: string) {
  return useQuery({
    queryKey: queryKeys.analytics.categoryBreakdown(type, startDate, endDate, parentCategoryId),
    queryFn: () => analyticsApi.getCategoryBreakdown(type, startDate, endDate, parentCategoryId).then((res) => res.data.data ?? []),
  })
}

export function useAssetTrend() {
  return useQuery({
    queryKey: queryKeys.analytics.assetTrend,
    queryFn: () => analyticsApi.getAssetTrend().then((res) => res.data.data ?? []),
  })
}

export function useInvestmentSnapshots(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.investments.snapshots(accountId!),
    queryFn: () => investmentApi.getSnapshots(accountId!).then((res) => res.data.data ?? []),
    enabled: !!accountId,
  })
}
