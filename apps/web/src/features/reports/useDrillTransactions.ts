/**
 * 报表下钻的流水来源：走 /transactions 服务端查询，不再读 Ledger 全量集合。
 *
 * 下钻是用户点开图表后才触发的显式动作（非首屏、非自动预取），
 * 因此按服务端 total 翻页取齐该目标下的候选流水，再由 buildDrillFor 做方向 / 口径精剪。
 * 后端已按分类子树展开、账户含转入侧，与旧前端扫描的匹配集合一致。
 */
import { useQuery } from '@tanstack/react-query'
import type { Transaction } from '@contracts/types'
import { transactionApi } from '@/services/api'
import { unwrapApiData } from '@/services/apiResult'
import { toLedgerTransaction } from '@/features/overview/apiLedger'
import type { LedgerTransaction } from '@/features/overview/model'
import type { DrillTarget } from './reportsModel'

/** 下钻查询的静态指纹：目标身份 + 期间，决定 queryKey。 */
export function drillQueryKey(
  target: DrillTarget | null,
  from: string,
  to: string,
): readonly unknown[] {
  return [
    'hf',
    'report',
    'drill',
    target?.type ?? '',
    target?.ids.join(',') ?? '',
    from,
    to,
  ]
}

/** 按服务端 total 翻页取齐下钻候选流水（分页大小与流水页一致）。 */
export async function fetchDrillTransactions(
  target: DrillTarget,
  from: string,
  to: string,
  signal?: AbortSignal,
  pageSize = 100,
): Promise<LedgerTransaction[]> {
  const paramsFor = (page: number) => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    // 后端把 to 解析成次日零点（不含），因此直接传闭区间末端即等价前端 [from, to]。
    params.set('from', from)
    params.set('to', to)
    if (target.type === 'category') {
      target.ids.forEach((id) => params.append('categoryId', id))
    } else {
      target.ids.forEach((id) => params.append('accountId', id))
    }
    return params
  }

  const items: LedgerTransaction[] = []
  let page = 1
  while (true) {
    signal?.throwIfAborted()
    const result = await transactionApi.getAll(paramsFor(page), signal).then(unwrapApiData)
    items.push(...result.list.map((transaction: Transaction) => toLedgerTransaction(transaction)))
    if (result.list.length === 0 || items.length >= result.total) break
    page += 1
  }
  return items
}

/**
 * 下钻候选流水查询：只在抽屉打开（target 非空且 enabled）时发请求，
 * queryKey 含目标身份与期间，切换目标即换 key，旧请求不会污染新下钻。
 */
export function useDrillTransactions(
  target: DrillTarget | null,
  from: string,
  to: string,
  enabled: boolean,
): { transactions: LedgerTransaction[]; loading: boolean; error: Error | null } {
  const query = useQuery({
    queryKey: drillQueryKey(target, from, to),
    enabled: Boolean(target) && enabled,
    queryFn: ({ signal }) => fetchDrillTransactions(target!, from, to, signal),
  })
  return {
    transactions: query.data ?? [],
    loading: Boolean(target) && enabled && query.isPending,
    error: query.error,
  }
}
