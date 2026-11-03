import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dataApi } from '../services/api'
import { unwrapApiData } from '../services/apiResult'
import { queryKeys } from './keys'
import { invalidateLedger } from './ledger'

export function useClearAll() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await dataApi.clearAll()
      return unwrapApiData(res)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.accountCategories.all })
      await queryClient.invalidateQueries({ queryKey: queryKeys.transactionCategories.all })
      await invalidateLedger(queryClient)
    },
  })
}

export function useClearTransactions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await dataApi.clearTransactions()
      return unwrapApiData(res)
    },
    onSuccess: () => invalidateLedger(queryClient),
  })
}

/** 回滚点列表：覆盖导入前自动留下的整库快照。 */
export function useRollbackPoints() {
  return useQuery({
    queryKey: queryKeys.rollbackPoints.all,
    queryFn: async () => {
      const res = await dataApi.listRollbackPoints()
      return unwrapApiData(res)
    },
  })
}

/** 回滚到指定回滚点：会用快照覆盖当前数据。 */
export function useRestoreRollbackPoint() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await dataApi.restoreRollbackPoint(id)
      return unwrapApiData(res)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.accountCategories.all })
      await queryClient.invalidateQueries({ queryKey: queryKeys.transactionCategories.all })
      await invalidateLedger(queryClient)
    },
  })
}

/** 删除回滚点。 */
export function useDeleteRollbackPoint() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await dataApi.deleteRollbackPoint(id)
      return unwrapApiData(res)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rollbackPoints.all }),
  })
}

// ─── 自动定时备份（B3）───

/** 自动备份配置。 */
export function useAutoBackupConfig() {
  return useQuery({
    queryKey: queryKeys.autoBackup.all,
    queryFn: async () => {
      const res = await dataApi.getAutoBackup()
      return unwrapApiData(res)
    },
  })
}

/** 保存自动备份配置；云同步目录会被后端拒绝，需带 confirmCloudDirectory 显式确认。 */
export function useSaveAutoBackupConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: Parameters<typeof dataApi.updateAutoBackup>[0]) => {
      const res = await dataApi.updateAutoBackup(data)
      return unwrapApiData(res)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.autoBackup.all }),
  })
}
