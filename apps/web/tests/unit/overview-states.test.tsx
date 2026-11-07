/**
 * 总览页四态渲染单测（HF 第一批）
 *
 * 正常：净资产主卡 + 最近流水固定表格；
 * 加载：role=status + aria-busy；
 * 冷启动：共享引导组件；
 * 错误：role=alert + 重试回调。
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { createSeedLedger } from '@/dev-fixtures/seed'
import { OverviewPage } from '@/features/overview/OverviewPage'
import type { DataState, DeviceMode } from '@/features/shared/types'
import { hfTheme } from '@/styles/theme/hf-theme'

function renderOverview(
  state: DataState,
  options: { device?: DeviceMode; onRetry?: () => void } = {},
) {
  const { device = 'desktop', onRetry = vi.fn() } = options
  const view = render(
    <MantineProvider theme={hfTheme}>
      <LedgerProvider initialLedger={createSeedLedger()} dataMode="seed">
        <OverviewPage
          device={device}
          dataState={state}
          onOpenDetail={vi.fn()}
          onOpenTransactions={vi.fn()}
          onOpenBudgets={vi.fn()}
          onOpenAccounts={vi.fn()}
          onRetry={onRetry}
          onCreateAccount={vi.fn()}
          onImport={vi.fn()}
        />
      </LedgerProvider>
    </MantineProvider>,
  )
  return { onRetry, container: view.container }
}

describe('总览四态', () => {
  it('正常态渲染净资产主卡与最近交易两段式行（无表格）', () => {
    const { container } = renderOverview('normal')
    expect(screen.getByRole('heading', { name: '总览' })).toBeInTheDocument()
    expect(screen.getByText('净资产')).toBeInTheDocument()
    expect(screen.getAllByText('¥137,388.35').length).toBeGreaterThan(0)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(container.querySelectorAll('.mb-tx-row').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: '最近交易', level: 2 })).toBeInTheDocument()
  })

  it('正常态移动端渲染收入/支出快照与移动流水', () => {
    renderOverview('normal', { device: 'mobile' })
    expect(screen.getByText('本月收入')).toBeInTheDocument()
    expect(screen.getByText('本月支出')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '最近交易', level: 2 })).toBeInTheDocument()
  })

  it('加载态暴露 status 并标记 aria-busy', () => {
    renderOverview('loading')
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveAttribute('aria-label', '正在加载总览')
    expect(screen.getByText('正在加载总览数据')).toBeInTheDocument()
  })

  it('空账本态复用冷启动引导', () => {
    renderOverview('empty')
    expect(screen.getByText('从一个账户开始')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建账户' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导入账单' })).toBeInTheDocument()
  })

  it('错误态暴露 alert 并可重试', () => {
    const { onRetry } = renderOverview('error')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('数据没取出来')).toBeInTheDocument()
    screen.getByRole('button', { name: '重试' }).click()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
