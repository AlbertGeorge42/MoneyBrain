/**
 * 设置页：外观主题 + 自动备份
 *
 * - 主题三档是真实控件：切换立即改写 Mantine 的 colorScheme（data-mantine-color-scheme + localStorage），
 *   不是只写 localStorage 不改页面；
 * - 自动备份走真实 GET/PUT /data/auto-backup；频率与保留份数后端无字段，
 *   必须明确显示「后端未提供」且控件禁用，不能假装保存成功。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MantineProvider, useComputedColorScheme, useMantineColorScheme } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { mbColorSchemeManager } from '@/styles/theme/hf-theme'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { ToastProvider } from '@/features/shared/toast'
import { SettingsPage } from '@/features/settings/SettingsPage'
import type { AutoBackupConfig } from '@/services/api'
import type { Ledger } from '@/features/overview/model'

const mocks = vi.hoisted(() => ({
  getAutoBackup: vi.fn(),
  updateAutoBackup: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  dataApi: {
    getAutoBackup: mocks.getAutoBackup,
    updateAutoBackup: mocks.updateAutoBackup,
  },
  accountApi: {},
  transactionCategoryApi: {},
  auditEventApi: {},
  transactionApi: {
    getRecycleBin: vi.fn().mockResolvedValue({
      data: { success: true, data: { list: [], accounts: [], categories: [] } },
    }),
  },
}))

const ledger: Ledger = {
  accounts: [{ id: 'a1', name: '招商储蓄卡', kind: 'deposit', balance: 100_000 }],
  categories: [{ id: 'food', name: '餐饮', type: 'expense' }],
  budgets: [],
  transactions: [],
}

const config: AutoBackupConfig = {
  enabled: false,
  directory: 'C:\\tmp\\auto-backups',
  defaultDirectory: 'C:\\tmp\\auto-backups',
  intervalHours: 24,
  keepCount: 7,
  lastRunAt: null,
  lastRunError: null,
  nextWindowAt: null,
  backupCount: 0,
}

const ok = <T,>(data: T) => ({ data: { success: true, data } })

function ThemeProbe() {
  const { colorScheme } = useMantineColorScheme()
  const resolved = useComputedColorScheme('light')
  return (
    <span data-testid="theme-probe">
      {`${colorScheme === 'auto' ? 'system' : colorScheme}:${resolved}`}
    </span>
  )
}

function renderPage(dataMode: 'api' | 'seed' = 'api') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider defaultColorScheme="auto" colorSchemeManager={mbColorSchemeManager}>
        <LedgerProvider initialLedger={ledger} dataMode={dataMode}>
          <ToastProvider>
            <SettingsPage device="desktop" dataState="normal" onRetry={() => {}} onImport={() => {}} />
            <ThemeProbe />
          </ToastProvider>
        </LedgerProvider>
      </MantineProvider>
    </QueryClientProvider>,
  )
}

async function openSection(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-mantine-color-scheme')
})

afterEach(() => {
  cleanup()
})

describe('外观主题', () => {
  it('三档切换立即生效：data-mantine-color-scheme、Mantine colorScheme 与 localStorage 同步', async () => {
    renderPage()
    await openSection('外观主题')

    const group = screen.getByRole('radiogroup', { name: '外观主题' })
    const dark = within(group).getByRole('radio', { name: '深色' })
    const system = within(group).getByRole('radio', { name: '跟随系统' })

    // 默认跟随系统；测试环境 prefers-color-scheme 非深色，解析为浅色。
    expect(screen.getByTestId('theme-probe').textContent).toBe('system:light')

    fireEvent.click(dark)
    expect(dark).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: '浅色' })).toHaveAttribute('aria-checked', 'false')
    expect(document.documentElement).toHaveAttribute('data-mantine-color-scheme', 'dark')
    expect(window.localStorage.getItem('moneybrain-theme-mode')).toBe('dark')
    expect(screen.getByTestId('theme-probe').textContent).toBe('dark:dark')
    expect(screen.getByRole('status').textContent).toContain('当前生效：深色')

    // 键盘可达：真实 button[role=radio] 可获得焦点并被 Enter 触发的浏览器默认行为覆盖。
    dark.focus()
    expect(dark).toHaveFocus()

    fireEvent.click(system)
    expect(system).toHaveAttribute('aria-checked', 'true')
    expect(document.documentElement).toHaveAttribute('data-mantine-color-scheme', 'light')
    expect(window.localStorage.getItem('moneybrain-theme-mode')).toBe('auto')
    expect(screen.getByRole('status').textContent).toContain('跟随系统（当前浅色）')
  })
})

describe('自动备份', () => {
  it('读取真实配置，开关与目录通过 PUT 保存并回读', async () => {
    mocks.getAutoBackup
      .mockResolvedValueOnce(ok(config))
      .mockResolvedValueOnce(ok({ ...config, enabled: true, directory: 'D:\\backups' }))
    mocks.updateAutoBackup.mockResolvedValue(ok({ ...config, enabled: true, directory: 'D:\\backups' }))

    renderPage()
    await openSection('自动备份')

    await waitFor(() => expect(mocks.getAutoBackup).toHaveBeenCalledTimes(1))
    const toggle = await screen.findByRole('switch', { name: '开启自动备份' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    fireEvent.change(screen.getByLabelText('备份目录（绝对路径）'), {
      target: { value: 'D:\\backups' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    await waitFor(() =>
      expect(mocks.updateAutoBackup).toHaveBeenCalledWith({
        enabled: true,
        directory: 'D:\\backups',
        intervalHours: 24,
        keepCount: 7,
      }),
    )
    await waitFor(() => expect(mocks.getAutoBackup).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('自动备份设置已保存')).toBeInTheDocument()
    expect(screen.getByLabelText('备份目录（绝对路径）')).toHaveValue('D:\\backups')
  })

  it('备份间隔与保留份数可编辑并随保存提交', async () => {
    mocks.getAutoBackup
      .mockResolvedValueOnce(ok(config))
      .mockResolvedValueOnce(ok({ ...config, intervalHours: 6, keepCount: 3 }))
    mocks.updateAutoBackup.mockResolvedValue(ok({ ...config, intervalHours: 6, keepCount: 3 }))

    renderPage()
    await openSection('自动备份')
    await screen.findByRole('switch', { name: '开启自动备份' })

    const interval = screen.getByLabelText('备份间隔（小时）')
    const keep = screen.getByLabelText('保留份数（份）')
    expect(interval).toHaveValue(24)
    expect(keep).toHaveValue(7)
    expect(interval).not.toBeDisabled()
    expect(keep).not.toBeDisabled()

    fireEvent.change(interval, { target: { value: '6' } })
    fireEvent.change(keep, { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    await waitFor(() =>
      expect(mocks.updateAutoBackup).toHaveBeenCalledWith({
        enabled: false,
        directory: 'C:\\tmp\\auto-backups',
        intervalHours: 6,
        keepCount: 3,
      }),
    )
    await waitFor(() => expect(mocks.getAutoBackup).toHaveBeenCalledTimes(2))
    expect(interval).toHaveValue(6)
    expect(keep).toHaveValue(3)
  })

  it('演示数据源不请求后端，并说明自动备份需要真实后端', async () => {
    renderPage('seed')
    await openSection('自动备份')

    expect(screen.getByText(/当前为演示数据源/)).toBeInTheDocument()
    expect(mocks.getAutoBackup).not.toHaveBeenCalled()
  })
})
