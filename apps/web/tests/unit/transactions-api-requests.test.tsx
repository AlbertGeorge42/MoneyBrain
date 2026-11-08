/**
 * 流水深链筛选的请求数回归（API 模式）
 *
 * 缺陷：筛选状态初始为空，分类异步到达后才 hydration，导致先按空筛选取一轮、
 * 再按深链筛选取一轮。修复后 hydration 完成前不发请求，请求数 =
 * ceil(total / 100)，且第一页就带上最终筛选参数。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { ToastProvider } from '@/features/shared/toast'
import { TransactionsPage } from '@/features/transactions/TransactionsPage'
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
      ruleVersion: 1,
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
        <LedgerProvider initialLedger={ledger} dataMode="api">
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
