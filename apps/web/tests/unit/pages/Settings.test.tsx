/**
 * 设置页入口（HF）
 *
 * 旧版只断言「配置中心 / 外观主题 / 数据备份等入口存在」，迁到高保真后
 * 保留同样的冒烟范围：左侧分区导航齐全，外观主题可打开且是真实单选控件。
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { CONFIG_SECTIONS, GENERAL_SECTIONS } from '@/features/settings/settingsModel'
import { hfTheme } from '@/styles/theme/hf-theme'

function renderSettings() {
  return render(
    <MantineProvider theme={hfTheme} defaultColorScheme="auto">
      <LedgerProvider>
        <SettingsPage device="desktop" dataState="normal" onRetry={vi.fn()} onImport={vi.fn()} />
      </LedgerProvider>
    </MantineProvider>,
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
