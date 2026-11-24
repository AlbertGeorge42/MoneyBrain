/**
 * 流水查询边界（Transaction Query）
 *
 * 流水页的唯一交易数据源。与 Ledger 解耦：Ledger 只提供 metadata
 * （accountId / categoryId 的筛选选项），交易行只从这里按页取。
 *
 * - fetchTransactionPage：单页查询，一个请求周期只依赖服务端的 total。
 * - useTransactionQuery：React Query 无限查询，首屏只取 page 1，
 *   loadMore 显式取下一页；不再自动翻完整个结果集。
 * - 竞态：queryKey 含筛选指纹，筛选变化即换 key，旧批次不会覆盖新批次；
 *   useInfiniteQuery 在卸载 / key 变化时中止在途请求。
 */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { Transaction } from '@contracts/types'
import { transactionApi } from '@/services/api'
import { unwrapApiData } from '@/services/apiResult'
import { EMPTY_LEDGER, toLedgerTransaction } from '@/features/overview/apiLedger'
import type { Ledger, LedgerTransaction } from '@/features/overview/model'
import {
  buildTransactionQueryParams,
  isRequestCanceled,
  useDebouncedValue,
} from './apiTransactions'
import { EMPTY_ADVANCED, type TransactionFilters } from './filters'

/** 服务端分页大小：首屏只取一页，其余按需加载。 */
export const TRANSACTION_PAGE_SIZE = 100

export interface TransactionPage {
  list: LedgerTransaction[]
  total: number
  page: number
}

/** 单次请求 = 单页；total 由服务端随每页返回，前端不再重复 count。 */
export async function fetchTransactionPage(
  filters: TransactionFilters,
  ledger: Ledger,
  page: number,
  signal?: AbortSignal,
  pageSize = TRANSACTION_PAGE_SIZE,
): Promise<TransactionPage> {
  const params = buildTransactionQueryParams(filters, ledger, page, pageSize)
  const result = await transactionApi.getAll(params, signal).then(unwrapApiData)
  return {
    list: result.list.map((transaction: Transaction) => toLedgerTransaction(transaction)),
    total: result.total,
    page,
  }
}

/**
 * 账户是否已有流水（含转入）：用列表端点的 total 判断，不再扫 Ledger 全量。
 * `/transactions` 的 accountId 同时匹配 accountId 与 toAccountId（后端口径），
 * 不能用 /accounts/:id/stats 替代（后者只数转出）。
 */
export function useAccountHasTransactions(accountId: string | null | undefined): boolean {
  const query = useQuery({
    queryKey: ['hf', 'account-has-transactions', accountId ?? ''],
    queryFn: ({ signal }) => {
      const params = buildTransactionQueryParams(
        { query: '', type: 'all', advanced: { ...EMPTY_ADVANCED, accountId: accountId! } },
        EMPTY_LEDGER,
        1,
        1,
      )
      return transactionApi.getAll(params, signal).then(unwrapApiData).then((result) => result.total > 0)
    },
    enabled: Boolean(accountId),
  })
  return query.data ?? false
}

/**
 * 按 id 取单笔详情（关联跳转用）：已加载的行直接命中，零请求；
 * 仅在本地找不到时才打 /transactions/:id。DTO 自带 relatedTransaction / refunds。
 */
export function useTransactionDetail(
  id: string | null,
  loaded: readonly LedgerTransaction[],
): { detail: LedgerTransaction | null; loading: boolean } {
  const local = id ? loaded.find((transaction) => transaction.id === id) ?? null : null
  const query = useQuery({
    queryKey: ['hf', 'transaction', id],
    queryFn: () =>
      transactionApi.getById(id!).then(unwrapApiData).then((dto) => toLedgerTransaction(dto)),
    enabled: Boolean(id) && !local,
  })
  return {
    detail: local ?? query.data ?? null,
    loading: Boolean(id) && !local && query.isPending,
  }
}

export interface TransactionQuery {
  /** 当前已加载的全部行（按服务端顺序，不重排）。 */
  items: LedgerTransaction[]
  /** 服务端报告的总笔数（当前筛选）。 */
  total: number
  /** 是否还有下一页可加载。 */
  hasMore: boolean
  /** 首屏加载中 / 翻页中 / 错误 / 就绪。 */
  status: 'initialLoading' | 'pageLoading' | 'error' | 'ready'
  loadMore: () => void
  refetch: () => void
}

/**
 * 首屏只请求 page 1；筛选变化（250ms 防抖后）换 queryKey 重新取第一页。
 * `enabled` 只决定是否发请求——不再依赖 Ledger 全量就绪，
 * 只依赖调用方确认 metadata 可用（hydrated）。
 */
export function useTransactionQuery(
  filters: TransactionFilters,
  ledger: Ledger,
  enabled: boolean,
): TransactionQuery {
  const debounced = useDebouncedValue(filters, 250)
  const key = buildTransactionQueryParams(debounced, ledger, 1).toString()
  const active = enabled && debounced === filters

  const query = useInfiniteQuery({
    queryKey: ['hf', 'transactions', key],
    queryFn: ({ pageParam, signal }) =>
      fetchTransactionPage(debounced, ledger, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.list.length, 0)
      return loaded < lastPage.total ? allPages.length + 1 : undefined
    },
    enabled: active,
  })

  const items = query.data?.pages.flatMap((page) => page.list) ?? []
  const total = query.data?.pages[0]?.total ?? 0

  const status: TransactionQuery['status'] = !enabled
    ? 'ready'
    : query.isError && !isRequestCanceled(query.error)
      ? 'error'
      : query.isPending || (debounced !== filters && !query.data)
        ? 'initialLoading'
        : query.isFetchingNextPage
          ? 'pageLoading'
          : 'ready'

  return {
    items,
    total,
    hasMore: query.hasNextPage ?? false,
    status,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
    },
    refetch: () => void query.refetch(),
  }
}
