import { useQuery } from '@tanstack/react-query'
import { fetchLedgerFromApi } from './apiLedger'

/**
 * 数据源模式。生产构建（`import.meta.env.PROD`）恒为 api：
 * 任何环境变量都不能让生产包落到种子账本。
 * 种子只在「开发模式 + 显式 VITE_HF_DATA=seed」同时成立时可用。
 */
export type HfDataMode = 'seed' | 'api'

interface HfEnv {
  DEV: boolean
  PROD: boolean
  VITE_HF_DATA?: string
}

/** 纯函数解析，供运行时与守卫测试共用（测试可直接喂 PROD: true + seed）。 */
export function resolveHfDataMode(env: HfEnv): HfDataMode {
  if (env.PROD) return 'api'
  return env.DEV && env.VITE_HF_DATA === 'seed' ? 'seed' : 'api'
}

export function readHfDataMode(): HfDataMode {
  return resolveHfDataMode(import.meta.env)
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
