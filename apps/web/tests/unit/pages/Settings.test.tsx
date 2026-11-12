/**
 * 设置页入口（HF）
 *
 * 旧版只断言「配置中心 / 外观主题 / 数据备份等入口存在」，迁到高保真后
 * 保留同样的冒烟范围：左侧分区导航齐全，外观主题可打开且是真实单选控件。
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { ToastProvider } from '@/features/shared/toast'
import { createSeedLedger } from '@/dev-fixtures/seed'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { CONFIG_SECTIONS, GENERAL_SECTIONS } from '@/features/settings/settingsModel'
import { hfTheme } from '@/styles/theme/hf-theme'

const mocks = vi.hoisted(() => ({
  getRecycleBin: vi.fn(),
  dataApi: {
    listImportBatches: vi.fn().mockResolvedValue({ data: { success: true, data: { batches: [] } } }),
    getAutoBackup: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
    updateAutoBackup: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
    exportFull: vi.fn().mockResolvedValue({ data: { success: true, data: { filename: 'x' } } }),
    previewImport: vi.fn().mockResolvedValue({
      data: { success: true, data: { created: 0, updated: 0, transactions: 0 } },
    }),
    importBackup: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
    rollbackImportBatch: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
    clearAll: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
  },
}))
vi.mock('@/services/api', () => ({
  transactionApi: { getRecycleBin: mocks.getRecycleBin, delete: vi.fn() },
  dataApi: mocks.dataApi,
  accountApi: {},
  accountCategoryApi: {},
  auditEventApi: {},
  transactionCategoryApi: {},
  budgetApi: {},
}))

function renderSettings() {
  mocks.getRecycleBin.mockResolvedValue({ data: { list: [], accounts: [], categories: [] } })
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider theme={hfTheme} defaultColorScheme="auto">
        <LedgerProvider initialLedger={createSeedLedger()}>
          <ToastProvider>
            <SettingsPage device="desktop" dataState="normal" onRetry={vi.fn()} />
          </ToastProvider>
        </LedgerProvider>
      </MantineProvider>
    </QueryClientProvider>,
  )
}

describe('Settings Page 入口', () => {
  it('配置中心与通用分区入口齐全', () => {
    renderSettings()
    const nav = screen.getByRole('navigation', { name: '设置分区' })
    for (const section of [...CONFIG_SECTIONS, ...GENERAL_SECTIONS]) {
      expect(
        within(nav).getByRole('button', { name: new RegExp(section.label) }),
      ).toBeInTheDocument()
    }
  })

  it('外观主题是真实单选控件', () => {
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: '外观主题' }))
    const group = screen.getByRole('radiogroup', { name: '外观主题' })
    expect(within(group).getByRole('radio', { name: '浅色' })).toBeInTheDocument()
    expect(within(group).getByRole('radio', { name: '深色' })).toBeInTheDocument()
    expect(within(group).getByRole('radio', { name: '跟随系统' })).toBeInTheDocument()
  })
})
