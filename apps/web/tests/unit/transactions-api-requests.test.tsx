/**
 * 流水深链筛选的请求数回归（API 模式）
 *
 * 缺陷：筛选状态初始为空，分类异步到达后才 hydration，导致先按空筛选取一轮、
 * 再按深链筛选取一轮。修复后 hydration 完成前不发请求，请求数 =
 * ceil(total / 100)，且第一页就带上最终筛选参数。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { cleanup, render, renderHook, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { ToastProvider } from '@/features/shared/toast'
import { TransactionsPage } from '@/features/transactions/TransactionsPage'
import { fetchFilteredTransactions, useServerTransactions } from '@/features/transactions/apiTransactions'
import { EMPTY_ADVANCED } from '@/features/transactions/filters'
import type { TransactionFilters } from '@/features/transactions/filters'
import type { Ledger } from '@/features/overview/model'

const mocks = vi.hoisted(() => ({ getAll: vi.fn() }))

vi.mock('@/services/api', () => ({
  transactionApi: { getAll: mocks.getAll },
  accountApi: {},
  accountCategoryApi: {},
  auditEventApi: {},
  transactionCategoryApi: {},
}))

const ledger: Ledger = {
  accounts: [{ id: 'cmb', name: '招商储蓄卡', kind: 'deposit', balance: 100_000 }],
  categories: [{ id: 'food', name: '餐饮', type: 'expense' }],
  budgets: [],
  transactions: [],
  ids: {
    categoryReal: { food: 'real-food' },
    categoryDisplay: { 'real-food': 'food' },
  },
}

function makePage(total: number) {
  const pageSize = 100
  return async (params: URLSearchParams) => {
    const page = Number(params.get('page'))
    const start = (page - 1) * pageSize
    const count = Math.max(0, Math.min(pageSize, total - start))
    const list = Array.from({ length: count }, (_, index) => ({
      id: `tx-${start + index}`,
      type: 'expense',
      amount: 1_200,
      date: '2026-10-05T00:00:00.000Z',
      accountId: 'cmb',
      categoryId: 'real-food',
      note: '午餐',
      fee: 0,
    }))
    return {
      data: {
        success: true,
        data: { list, total, page, pageSize },
      },
    }
  }
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <LedgerProvider initialLedger={ledger}>
          <ToastProvider>
            <TransactionsPage
              device="desktop"
              dataState="normal"
              batchMode={false}
              onBatchModeChange={() => {}}
              displayOpen={false}
              onDisplayToggle={() => {}}
              onRetry={() => {}}
              onCreateAccount={() => {}}
              onImport={() => {}}
            />
          </ToastProvider>
        </LedgerProvider>
      </MantineProvider>
    </QueryClientProvider>,
  )
}

const open = (search: string) => {
  window.history.replaceState(null, '', `/${search}`)
}

describe('深链筛选请求数（API 模式）', () => {
  beforeEach(() => {
    mocks.getAll.mockReset()
    open('?page=transactions')
  })

  afterEach(() => {
    cleanup()
    open('?page=transactions')
  })

  it('13 条 + 期间筛选只发 1 次，且首请求带最终筛选', async () => {
    open('?page=transactions&txFrom=2026-10-01&txTo=2026-10-31')
    mocks.getAll.mockImplementation(makePage(13))
    renderPage()

    await waitFor(() => expect(mocks.getAll).toHaveBeenCalledTimes(1), { timeout: 2000 })
    const params = mocks.getAll.mock.calls[0][0] as URLSearchParams
    expect(params.get('page')).toBe('1')
    expect(params.get('from')).toBe('2026-10-01')
    expect(params.get('to')).toBe('2026-10-31')
    // 等过防抖窗口，确认没有「空筛选」的第二轮请求。
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(mocks.getAll).toHaveBeenCalledTimes(1)
  })

  it('223 条 + type=expense 发 3 次，且每次都带筛选', async () => {
    open('?page=transactions&txType=expense')
    mocks.getAll.mockImplementation(makePage(223))
    renderPage()

    await waitFor(() => expect(mocks.getAll).toHaveBeenCalledTimes(3), { timeout: 3000 })
    for (const [params] of mocks.getAll.mock.calls) {
      expect((params as URLSearchParams).get('type')).toBe('expense')
    }
    const pages = mocks.getAll.mock.calls.map(([params]) =>
      (params as URLSearchParams).get('page'),
    )
    expect(pages).toEqual(['1', '2', '3'])
  })

  it('带分类深链只发 1 次，并映射为真实 categoryId', async () => {
    open('?page=transactions&txCategory=food')
    mocks.getAll.mockImplementation(makePage(13))
    renderPage()

    await waitFor(() => expect(mocks.getAll).toHaveBeenCalledTimes(1), { timeout: 2000 })
    const params = mocks.getAll.mock.calls[0][0] as URLSearchParams
    expect(params.getAll('categoryId')).toEqual(['real-food'])
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(mocks.getAll).toHaveBeenCalledTimes(1)
  })
})

describe('按 total 翻页（流水页笔数与合计的取数全集）', () => {
  const noFilters = { query: '', type: 'all' as const, advanced: EMPTY_ADVANCED }

  beforeEach(() => {
    mocks.getAll.mockReset()
  })

  it('3380 条翻完 34 页，不再截断在 2000 条', async () => {
    mocks.getAll.mockImplementation(makePage(3380))

    const result = await fetchFilteredTransactions(noFilters, ledger)

    expect(mocks.getAll).toHaveBeenCalledTimes(34)
    expect(result.requests).toBe(34)
    expect(result.total).toBe(3380)
    expect(result.items).toHaveLength(3380)
    // 第一页之后仍有数据，证明没有在 100 × 20 处提前收尾。
    expect(result.items.at(-1)?.id).toBe('tx-3379')
  })

  it('服务端提前返回空页时抛错，不返回偏小的列表与合计', async () => {
    mocks.getAll.mockImplementation(async (params: URLSearchParams) => {
      const page = Number(params.get('page'))
      const list =
        page > 2
          ? []
          : Array.from({ length: 100 }, (_, index) => ({
              id: `tx-${(page - 1) * 100 + index}`,
              type: 'expense',
              amount: 1_200,
              date: '2026-10-05T00:00:00.000Z',
              accountId: 'cmb',
              categoryId: 'real-food',
              note: '午餐',
              fee: 0,
            }))
      return { data: { success: true, data: { list, total: 3380, page, pageSize: 100 } } }
    })

    await expect(fetchFilteredTransactions(noFilters, ledger)).rejects.toThrow(
      '流水分页未取满：已取 200 笔，共 3380 笔',
    )
  })

  it('signal 中止后不再请求下一页，并把 signal 传到请求层', async () => {
    const controller = new AbortController()
    mocks.getAll.mockImplementation((params: URLSearchParams, signal?: AbortSignal) => {
      const page = Number(params.get('page'))
      if (page > 1) throw new Error('取消后不应继续翻页')
      expect(signal).toBe(controller.signal)
      controller.abort()
      return makePage(3380)(params)
    })

    await expect(
      fetchFilteredTransactions(noFilters, ledger, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.getAll).toHaveBeenCalledTimes(1)
  })
})

describe('筛选批次被取代时中止（不并发跑完、不进错误态）', () => {
  const noFilters: TransactionFilters = { query: '', type: 'all', advanced: EMPTY_ADVANCED }

  beforeEach(() => {
    mocks.getAll.mockReset()
  })

  afterEach(cleanup)

  it('连续三次筛选：前两批各停在第一页，最后一批 34 页跑完，全程无 error', async () => {
    const canceled = () =>
      Object.assign(new Error('canceled'), {
        name: 'CanceledError',
        code: 'ERR_CANCELED',
        __CANCEL__: true,
      })
    const calls: Array<{ keyword: string; page: number; signal?: AbortSignal }> = []

    mocks.getAll.mockImplementation((params: URLSearchParams, signal?: AbortSignal) => {
      const keyword = params.get('keyword') ?? ''
      const page = Number(params.get('page'))
      calls.push({ keyword, page, signal })
      if (keyword !== 'abc') {
        // 模拟 axios：暂停在第一页，signal 中止时以 CanceledError 结束。
        return new Promise((_, reject) => {
          const fail = () => reject(canceled())
          if (signal?.aborted) fail()
          else signal?.addEventListener('abort', fail, { once: true })
        })
      }
      return makePage(3380)(params)
    })

    const statuses: string[] = []
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result, rerender } = renderHook(
      ({ filters }: { filters: TransactionFilters }) => {
        const query = useServerTransactions(filters, ledger, true)
        statuses.push(query.status)
        return query
      },
      { wrapper, initialProps: { filters: { ...noFilters, query: 'a' } } },
    )

    await waitFor(() => expect(calls).toHaveLength(1), { timeout: 2000 })
    rerender({ filters: { ...noFilters, query: 'ab' } })
    await waitFor(() => expect(calls.some((call) => call.keyword === 'ab')).toBe(true), {
      timeout: 2000,
    })
    rerender({ filters: { ...noFilters, query: 'abc' } })
    await waitFor(() => expect(calls.filter((call) => call.keyword === 'abc')).toHaveLength(34), {
      timeout: 4000,
    })
    await waitFor(() => expect(result.current.status).toBe('ready'), { timeout: 2000 })

    // 前两批在第一次翻页后即停；只有最后一批跑完 34 页。
    expect(calls.filter((call) => call.keyword === 'a')).toHaveLength(1)
    expect(calls.filter((call) => call.keyword === 'ab')).toHaveLength(1)
    expect(calls.filter((call) => call.keyword === 'abc')).toHaveLength(34)
    expect(calls.find((call) => call.keyword === 'a')?.signal?.aborted).toBe(true)
    expect(calls.find((call) => call.keyword === 'ab')?.signal?.aborted).toBe(true)
    expect(result.current.items).toHaveLength(3380)
    expect(result.current.total).toBe(3380)
    // 取消不是失败：任何一帧都不应进入错误态（页面据此不弹 ErrorPanel / toast）。
    expect(statuses).not.toContain('error')
  })
})
