/**
 * 设置页：外观主题
 *
 * 三档是真实控件：切换立即改写共享 ThemeContext（data-theme + localStorage），
 * 不是只写 localStorage 不改页面。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider, useTheme } from '@/styles/ThemeContext'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { SettingsPage } from '@/features/settings/SettingsPage'
import type { Ledger } from '@/features/overview/model'

vi.mock('@/services/api', () => ({
  dataApi: {},
  accountApi: {},
  transactionCategoryApi: {},
  auditEventApi: {},
}))

const ledger: Ledger = {
  accounts: [{ id: 'a1', name: '招商储蓄卡', kind: 'deposit', balance: 100_000 }],
  categories: [{ id: 'food', name: '餐饮', type: 'expense' }],
  budgets: [],
  transactions: [],
}

function ThemeProbe() {
  const { mode, theme } = useTheme()
  return <span data-testid="theme-probe">{`${mode}:${theme}`}</span>
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MantineProvider>
          <LedgerProvider initialLedger={ledger} dataMode="api">
            <SettingsPage device="desktop" dataState="normal" onRetry={() => {}} onImport={() => {}} />
            <ThemeProbe />
          </LedgerProvider>
        </MantineProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  cleanup()
})

describe('外观主题', () => {
  it('三档切换立即生效：data-theme、ThemeContext 与 localStorage 同步', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /外观主题/ }))

    const group = screen.getByRole('radiogroup', { name: '外观主题' })
    const dark = within(group).getByRole('radio', { name: '深色' })
    const system = within(group).getByRole('radio', { name: '跟随系统' })

    // 默认跟随系统；测试环境 prefers-color-scheme 非深色，解析为浅色。
    expect(screen.getByTestId('theme-probe').textContent).toBe('system:light')

    fireEvent.click(dark)
    expect(dark).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: '浅色' })).toHaveAttribute('aria-checked', 'false')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(window.localStorage.getItem('moneybrain-theme-mode')).toBe('dark')
    expect(screen.getByTestId('theme-probe').textContent).toBe('dark:dark')
    expect(screen.getByRole('status').textContent).toContain('当前生效：深色')

    // 键盘可达：真实 button[role=radio] 可获得焦点，Enter/Space 走原生点击。
    dark.focus()
    expect(dark).toHaveFocus()

    fireEvent.click(system)
    expect(system).toHaveAttribute('aria-checked', 'true')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(window.localStorage.getItem('moneybrain-theme-mode')).toBe('system')
    expect(screen.getByRole('status').textContent).toContain('跟随系统（当前浅色）')
  })
})
