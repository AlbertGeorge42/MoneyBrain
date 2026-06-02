import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { accountApi, accountCategoryApi } from '../services/api'
import type { Account } from '../services/api'
import { queryKeys } from './keys'

export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts.all,
    queryFn: () => accountApi.getAll().then((res) => res.data.data ?? []),
  })
}

export function useAccountStats(id: string) {
  return useQuery({
    queryKey: queryKeys.accounts.stats(id),
    queryFn: () => accountApi.getStats(id).then((res) => res.data.data!),
    enabled: !!id,
  })
}

export function useAccountBalanceAt(id: string, date: string) {
  return useQuery({
    queryKey: queryKeys.accounts.balanceAt(id, date),
    queryFn: () => accountApi.getBalanceAt(id, date).then((res) => res.data.data!),
    enabled: !!id && !!date,
  })
}

export function useAccountCategories() {
  return useQuery({
    queryKey: queryKeys.accountCategories.all,
    queryFn: () => accountCategoryApi.getAll().then((res) => res.data.data ?? []),
  })
}

export function useCreateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Account>) => accountApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
    },
  })
}

export function useUpdateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Account> }) => accountApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
    },
  })
}

export function useDeleteAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) => accountApi.delete(id, force),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
    },
  })
}

export function useUpdateAccountCategoryAssetType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, assetType }: { id: string; assetType: 'cash' | 'investment' | 'other' }) => {
      const updateData = {
        isCashEquivalent: assetType === 'cash',
        isInvestment: assetType === 'investment',
      }
      return accountCategoryApi.update(id, updateData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accountCategories.all })
    },
  })
}
