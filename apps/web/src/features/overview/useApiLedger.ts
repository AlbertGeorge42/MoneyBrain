import { useQuery } from '@tanstack/react-query'
import {
  assembleLedger,
  buildMetadataLedger,
  fetchLedgerAnalytics,
  fetchLedgerCore,
} from './apiLedger'

type LedgerStatus = 'loading' | 'error' | 'ready'

function statusOf(isPending: boolean, isError: boolean): LedgerStatus {
  return isPending ? 'loading' : isError ? 'error' : 'ready'
}

/**
 * 启动数据分两批并行拉取：
 * - core（metadata + dashboard + 摘要）：轻查询，流水页只等它即可渲染；
 * - analytics（余额回放 + 趋势）：慢查询，总览 / 报表 / 预算页等两批都就绪。
 *
 * 两批都用 `['hf','overview','ledger']` 前缀，写操作后 invalidate 该前缀会同时刷新两者。
 */
export function useApiLedger() {
  const coreQuery = useQuery({
    queryKey: ['hf', 'overview', 'ledger', 'core'],
    queryFn: fetchLedgerCore,
    staleTime: 30_000,
  })
  const analyticsQuery = useQuery({
    queryKey: ['hf', 'overview', 'ledger', 'analytics'],
    queryFn: fetchLedgerAnalytics,
    staleTime: 30_000,
  })

  const coreStatus = statusOf(coreQuery.isPending, coreQuery.isError)
  const analyticsStatus = statusOf(analyticsQuery.isPending, analyticsQuery.isError)
  const fullStatus: LedgerStatus =
    coreStatus === 'error' || analyticsStatus === 'error'
      ? 'error'
      : coreStatus === 'ready' && analyticsStatus === 'ready'
        ? 'ready'
        : 'loading'

  // 两批都就绪才产出带完整 snapshot 的账本；否则 core 就绪先给 metadata 账本，
  // 让流水页尽早渲染；两者都没就绪时返回 undefined，由上层用 EMPTY_LEDGER 占位。
  const ledger =
    coreQuery.data && analyticsQuery.data
      ? assembleLedger(coreQuery.data, analyticsQuery.data)
      : coreQuery.data
        ? buildMetadataLedger(coreQuery.data)
        : undefined

  return {
    /** 完整就绪状态：总览 / 报表 / 预算 / 设置页用，等 analytics 也到位。 */
    status: fullStatus,
    /** 快就绪状态：流水页用，只等 metadata。 */
    coreStatus,
    ledger,
    isEmpty: coreQuery.data?.accounts.length === 0,
    refetch: () => {
      void coreQuery.refetch()
      void analyticsQuery.refetch()
    },
  }
}
