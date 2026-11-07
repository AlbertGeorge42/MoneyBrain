/**
 * 报表页全局期间（HF）
 *
 * 旧版验收「四张报表共享一个全局期间」迁到高保真：资产负债保持时点控件，
 * 其余三张共用同一条起止期间；切换 tab 期间不变。
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { ToastProvider } from '@/features/shared/toast'
import { createSeedLedger } from '@/dev-fixtures/seed'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { hfTheme } from '@/styles/theme/hf-theme'

function renderReports() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={hfTheme}>
        <LedgerProvider initialLedger={createSeedLedger()} dataMode="seed">
          <ToastProvider>
            <ReportsPage
              device="desktop"
              dataState="normal"
              settingsOpen={false}
              onSettingsToggle={vi.fn()}
              onRetry={vi.fn()}
              onImport={vi.fn()}
              onViewFlow={vi.fn()}
            />
          </ToastProvider>
        </LedgerProvider>
      </MantineProvider>
    </QueryClientProvider>,
  )
}

describe('Reports Page 全局期间', () => {
  it('资产负债是时点控件，四张报表共用同一个页面期间', () => {
    renderReports()

    const tabs = screen.getByRole('tablist', { name: '报表视图' })
    expect(within(tabs).getAllByRole('tab')).toHaveLength(4)
    // 资产负债看时点：显示「时点」控件而不是起止区间。
    expect(screen.getByRole('button', { name: /时点，当前/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /起始日期，当前/ })).not.toBeInTheDocument()

    fireEvent.click(within(tabs).getByRole('tab', { name: '收支明细' }))
    const start = screen.getByRole('button', { name: /起始日期，当前/ }).textContent
    const end = screen.getByRole('button', { name: /结束日期，当前/ }).textContent

    fireEvent.click(within(tabs).getByRole('tab', { name: '现金流' }))
    expect(within(tabs).getByRole('tab', { name: '现金流' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('button', { name: /起始日期，当前/ }).textContent).toBe(start)
    expect(screen.getByRole('button', { name: /结束日期，当前/ }).textContent).toBe(end)
  })
})
