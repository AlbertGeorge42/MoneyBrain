import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from './keys'

/**
 * 账务数据的统一失效入口。
 *
 * 余额、收支、预算、报表、分析都由同一份交易派生；任何写操作后
 * 必须整体失效，禁止在每个 mutation 里手写零散的 key 列表。
 */
const LEDGER_ROOTS = [
  queryKeys.accounts.all,
  queryKeys.transactions.all,
  queryKeys.budgets.all,
  ['reports'],
  ['analytics'],
  ['investments'],
] as const

export function invalidateLedger(queryClient: QueryClient): Promise<void> {
  return Promise.all(
    LEDGER_ROOTS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  ).then(() => undefined)
}
