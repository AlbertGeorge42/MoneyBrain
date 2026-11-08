/**
 * 流水列表的服务端查询层（API 模式）
 *
 * 筛选全部交给 GET /transactions：前端只做参数映射，不再本地过滤一遍。
 * - categoryIds（报表「其他」下钻）→ 重复 categoryId
 * - 根分类筛选由后端自动展开子分类
 * - 关键词 / 类型 / 账户 / 期间 / 金额区间都是后端参数
 * 分页在后台自动翻页（页面本身没有分页控件），一次筛选的首屏视觉与种子一致。
 */
import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { Transaction } from '@contracts/types'
import { transactionApi } from '@/services/api'
import { unwrapApiData } from '@/services/apiResult'
import { mapperFromLedger, toLedgerTransaction } from '@/features/overview/apiLedger'
import type { Ledger, LedgerTransaction } from '@/features/overview/model'
import { accountIdsInGroup, type TransactionFilters } from './filters'

/** 单次请求条数；页面无分页控件，靠自动翻页取全量筛选结果。 */
export const TRANSACTION_PAGE_SIZE = 100

function toMinor(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100)
}

/** 把 HF 筛选模型翻译成 /transactions 的 query 参数（真实分类 id 在这里回填）。 */
export function buildTransactionQueryParams(
  filters: TransactionFilters,
  ledger: Ledger,
  page: number,
  pageSize = TRANSACTION_PAGE_SIZE,
): URLSearchParams {
  const params = new URLSearchParams()
  const mapper = mapperFromLedger(ledger)

  params.set('page', String(page))
  params.set('pageSize', String(pageSize))

  const keyword = filters.query.trim()
  if (keyword) params.set('keyword', keyword)

  if (filters.type !== 'all') params.set('type', filters.type)

  // 分组筛选：把一级及其二级分组的账户集合翻译成 accountId（后端支持重复 accountId），只收窄范围。
  if (filters.advanced.groupId) {
    const groupAccountIds = accountIdsInGroup(ledger, filters.advanced.groupId)
    const groupAccounts = ledger.accounts.filter((account) => groupAccountIds.includes(account.id))
    if (groupAccounts.length === 0) {
      // 空分组没有任何账户：用一个不存在的 id 让后端返回空集，而不是静默忽略筛选。
      params.set('accountId', '__empty-group__')
    } else {
      groupAccounts.forEach((account) => params.append('accountId', account.id))
    }
  } else if (filters.advanced.accountId) {
    params.set('accountId', filters.advanced.accountId)
  }

  // 合并分类优先（报表下钻）；普通筛选只有单个根分类。
  const roots =
    filters.advanced.categoryIds.length > 0
      ? filters.advanced.categoryIds
      : filters.advanced.categoryId
        ? [filters.advanced.categoryId]
        : []
  roots.forEach((id) => params.append('categoryId', mapper.realId(id)))

  // 期间：报表下钻带来的日历日闭区间，按 from/to（半开区间）发给后端，与报表主查询口径一致。
  if (filters.advanced.dateFrom) params.set('from', filters.advanced.dateFrom)
  if (filters.advanced.dateTo) params.set('to', filters.advanced.dateTo)

  const min = toMinor(filters.advanced.amountMin)
  const max = toMinor(filters.advanced.amountMax)
  if (min !== null) params.set('amountMin', String(min))
  if (max !== null) params.set('amountMax', String(max))

  return params
}

export interface ServerTransactionList {
  items: LedgerTransaction[]
  total: number
  /** 本次筛选发出的请求数（分页翻页会 >1）。 */
  requests: number
}

/** 按页取完整个筛选结果；首屏等待完整列表，保持与种子版相同的渲染结果。 */
export async function fetchFilteredTransactions(
  filters: TransactionFilters,
  ledger: Ledger,
  pageSize = TRANSACTION_PAGE_SIZE,
): Promise<ServerTransactionList> {
  const mapper = mapperFromLedger(ledger)
  const items: LedgerTransaction[] = []
  let total = 0
  let page = 1
  let requests = 0

  // 按服务端 total 翻到最后一页，不设固定页数上限：
  // 页头/页脚笔数与合计都由完整结果算出，截断会让它们一起偏小；
  // 固定上限只是把同一个错误推迟到下一次数据增长。
  while (true) {
    const params = buildTransactionQueryParams(filters, ledger, page, pageSize)
    const result = await transactionApi.getAll(params).then(unwrapApiData)
    requests += 1
    total = result.total
    items.push(...result.list.map((transaction: Transaction) => toLedgerTransaction(transaction, mapper)))
    if (result.list.length === 0 || items.length >= total) break
    page += 1
  }

  // 服务端 total 与实际取回条数不一致（分页中断/并发写入）：宁可报错进错误态，
  // 也不返回不完整列表让页头与合计静默变小。
  if (items.length < total) {
    throw new Error(`流水分页未取满：已取 ${items.length} 笔，共 ${total} 笔`)
  }

  return { items, total, requests }
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export interface ServerTransactionQuery {
  items: LedgerTransaction[]
  total: number
  status: 'loading' | 'error' | 'ready'
  refetch: () => void
}

/**
 * 页面只读这个 hook：筛选变化 250ms 后发请求（关键词逐字输入不放大请求数）。
 * 上一次结果用 keepPreviousData 保留，避免切换筛选时整页闪空。
 */
export function useServerTransactions(
  filters: TransactionFilters,
  ledger: Ledger,
  enabled: boolean,
): ServerTransactionQuery {
  const debounced = useDebouncedValue(filters, 250)
  const key = buildTransactionQueryParams(debounced, ledger, 1).toString()

  // 防抖尚未落到最新筛选时不要发请求：否则 hydration 完成的那一帧，
  // enabled 已翻真而 debounced 还是空筛选，仍会先发一轮未筛选请求。
  const active = enabled && debounced === filters

  const query = useQuery({
    queryKey: ['hf', 'transactions', key],
    queryFn: () => fetchFilteredTransactions(debounced, ledger),
    enabled: active,
    placeholderData: keepPreviousData,
  })

  const status: ServerTransactionQuery['status'] = !enabled
    ? 'ready'
    : query.isError
      ? 'error'
      : query.isPending || (debounced !== filters && !query.data)
        ? 'loading'
        : 'ready'

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    status,
    refetch: () => void query.refetch(),
  }
}
