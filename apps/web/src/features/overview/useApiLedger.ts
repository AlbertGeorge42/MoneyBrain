import { useQuery } from '@tanstack/react-query'
import { fetchLedgerFromApi } from './apiLedger'

/** `/design` 数据源开关：默认 seed（与接入前完全一致），设为 api 时读真实账本。 */
export type HfDataMode = 'seed' | 'api'

export function readHfDataMode(): HfDataMode {
  return import.meta.env.VITE_HF_DATA === 'api' ? 'api' : 'seed'
}

export function useApiLedger(enabled: boolean) {
  const query = useQuery({
    queryKey: ['hf', 'overview', 'ledger'],
    queryFn: fetchLedgerFromApi,
    enabled,
    staleTime: 30_000,
  })

  const status: 'loading' | 'error' | 'ready' = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : 'ready'

  return {
    status,
    ledger: query.data?.ledger,
    isEmpty: query.data?.isEmpty ?? false,
    refetch: () => void query.refetch(),
  }
}
