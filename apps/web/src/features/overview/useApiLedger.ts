import { useQuery } from '@tanstack/react-query'
import { fetchLedgerFromApi } from './apiLedger'

export function useApiLedger() {
  const query = useQuery({
    queryKey: ['hf', 'overview', 'ledger'],
    queryFn: fetchLedgerFromApi,
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
