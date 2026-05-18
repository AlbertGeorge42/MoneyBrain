/**
 * CSS 变量工具函数
 * 用于 ECharts 等需要从 DOM 读取具体色值的场景
 */

import { theme as antdTheme } from 'antd'
import { createThemeConfig } from './config'

export function getTokenValue(varName: string): string {
  if (typeof window === 'undefined') return ''
  const computedStyle = getComputedStyle(document.documentElement)
  return computedStyle.getPropertyValue(varName).trim()
}

export function getTokenValues(varNames: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  varNames.forEach((name) => {
    result[name] = getTokenValue(name)
  })
  return result
}

export function getChartColors(): Record<string, string> {
  return {
    income: getTokenValue('--mb-color-income'),
    expense: getTokenValue('--mb-color-expense'),
    transfer: getTokenValue('--mb-color-transfer'),
    investment: getTokenValue('--mb-color-investing'),
    refund: getTokenValue('--mb-color-refund'),
    cash: getTokenValue('--mb-color-cash'),
    nonCash: getTokenValue('--mb-color-non-cash'),
    operating: getTokenValue('--mb-color-operating'),
    investing: getTokenValue('--mb-color-investing'),
    financing: getTokenValue('--mb-color-financing'),
    primary: getTokenValue('--mb-color-action-primary'),
    success: getTokenValue('--mb-color-success'),
    warning: getTokenValue('--mb-color-warning'),
    danger: getTokenValue('--mb-color-danger'),
  }
}

/**
 * 将 antd 计算 token 桥接为旧的 --mb-* CSS 变量
 * 写入 documentElement.style，使页面 CSS 可平滑过渡
 * 后续等 CSS 全部迁移完成后删除此函数
 */
export function syncLegacyCssVars(isDark: boolean): void {
  const config = createThemeConfig(isDark)
  const token = antdTheme.getDesignToken({ token: config.token, algorithm: config.algorithm }) as unknown as Record<string, string>

  const bridge: Record<string, string> = {
    '--mb-color-text-primary': token.colorText,
    '--mb-color-text-secondary': token.colorTextSecondary,
    '--mb-color-text-muted': token.colorTextTertiary,
    '--mb-color-text-disabled': token.colorTextQuaternary,
    '--mb-color-bg-app': token.colorBgLayout,
    '--mb-color-bg-panel': token.colorBgContainer,
    '--mb-color-bg-surface': token.colorBgContainer,
    '--mb-color-bg-elevated': token.colorBgElevated,
    '--mb-color-bg-hover': token.controlItemBgHover || token.colorBgTextHover,
    '--mb-color-bg-selected': token.controlItemBgActive || token.colorPrimaryBg,
    '--mb-color-border-subtle': token.colorBorderSecondary,
    '--mb-color-border-default': token.colorBorder,
    '--mb-color-border-strong': token.colorBorder,
    '--mb-color-border-input': token.colorBorder,
    '--mb-color-action-primary': token.colorPrimary,
    '--mb-color-action-primary-hover': token.colorPrimaryHover,
    '--mb-color-on-action-primary': token.colorWhite,
    '--mb-color-success': token.colorSuccess,
    '--mb-color-danger': token.colorError,
    '--mb-color-warning': token.colorWarning,
    '--mb-color-info': token.colorInfo,
    '--mb-color-success-bg': token.colorSuccessBg,
    '--mb-color-danger-bg': token.colorErrorBg,
    '--mb-color-warning-bg': token.colorWarningBg,
    '--mb-color-info-bg': token.colorInfoBg,
  }

  const el = document.documentElement
  for (const [key, value] of Object.entries(bridge)) {
    if (value) {
      el.style.setProperty(key, value)
    }
  }
}