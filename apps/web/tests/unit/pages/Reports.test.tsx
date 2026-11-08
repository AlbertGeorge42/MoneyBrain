/**
 * 报表页全局期间（HF）
 *
 * 旧版验收「四张报表共享一个全局期间」迁到高保真：资产负债保持时点控件，
 * 其余三张共用同一条起止期间；切换 tab 期间不变。
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
  it('seed 模式只给「演示数据不提供报表」提示，四个 tab 仍在但不渲染期间控件', () => {
    renderReports()

    const tabs = screen.getByRole('tablist', { name: '报表视图' })
    expect(within(tabs).getAllByRole('tab')).toHaveLength(4)
    // seed 模式不再本地派生报表，四张报表统一由后端计算。
    expect(screen.getByText('演示数据不提供报表')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /时点，当前/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /起始日期，当前/ })).not.toBeInTheDocument()
  })
})
