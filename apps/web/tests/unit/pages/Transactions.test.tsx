/**
 * 流水页数据状态（HF）
 *
 * 旧版分别断言「列表失败 / 统计失败 / 重试」，高保真把读写错误统一成一个
 * ErrorPanel：错误态不得退化成空列表，且必须给重试入口。
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { createSeedLedger } from '@/dev-fixtures/seed'
import { TransactionsPage } from '@/features/transactions/TransactionsPage'
import type { DataState } from '@/features/shared/types'
import { hfTheme } from '@/styles/theme/hf-theme'

function renderTransactions(state: DataState, onRetry = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={hfTheme}>
        <LedgerProvider initialLedger={createSeedLedger()} dataMode="seed">
          <TransactionsPage
            device="desktop"
            dataState={state}
            batchMode={false}
            onBatchModeChange={vi.fn()}
            displayOpen={false}
            onDisplayToggle={vi.fn()}
            onRetry={onRetry}
            onCreateAccount={vi.fn()}
            onImport={vi.fn()}
          />
        </LedgerProvider>
      </MantineProvider>
    </QueryClientProvider>,
  )
  return { onRetry, view }
}

describe('Transactions Page 数据状态', () => {
  it('加载失败时展示错误与重试，而不是空列表', () => {
    const { onRetry } = renderTransactions('error')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('数据没取出来')).toBeInTheDocument()
    expect(screen.queryByText('还没有流水')).not.toBeInTheDocument()
    screen.getByRole('button', { name: '重试' }).click()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('加载态暴露 status 并标记 aria-busy', () => {
    renderTransactions('loading')
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', '正在加载流水')
  })

  it('空账本复用冷启动引导', () => {
    renderTransactions('empty')
    expect(screen.getByText('还没有流水')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建账户' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导入账单' })).toBeInTheDocument()
  })
})
