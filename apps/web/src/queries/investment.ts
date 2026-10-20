import { useQuery } from '@tanstack/react-query'
import { investmentApi } from '../services/api'
import { unwrapApiData } from '../services/apiResult'
import { queryKeys } from './keys'

export function useInvestmentSnapshots(accountId: string | null) {
  return useQuery({
    queryKey: queryKeys.investments.snapshots(accountId!),
    queryFn: () => investmentApi.getSnapshots(accountId!).then(unwrapApiData),
    enabled: !!accountId,
  })
}
