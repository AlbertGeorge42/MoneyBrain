/**
 * MoneyBrain 主题配置
 * 合并了 seed token、组件 token、主题配置工厂和 CSS 变量同步
 */

import { theme, type ThemeConfig } from 'antd'

// ===== Seed Token =====
// AntD 算法式 token 的种子，所有颜色由 algorithm 自动派生
const baseSeed: Partial<ThemeConfig['token']> = {
  colorPrimary: '#1890ff',
  colorSuccess: '#52c41a',
  colorWarning: '#faad14',
  colorError: '#ff4d4f',
  colorInfo: '#1890ff',

  fontFamily: '"Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif',
  fontSize: 14,
  borderRadius: 8,
  controlHeight: 44,
}

// ===== 组件 Token =====
function getComponentTokens(): ThemeConfig['components'] {
  return {
    Button: {
      borderRadius: 8,
      paddingInline: 16,
      paddingInlineSM: 12,
      paddingInlineLG: 20,
      fontWeight: 500,
    },
    Input: {
      borderRadius: 6,
    },
    Select: {
      borderRadius: 6,
    },
    DatePicker: {
      borderRadius: 6,
    },
    Card: {
      paddingLG: 16,
      headerBg: 'transparent',
      borderRadiusLG: 8,
    },
    Menu: {
      itemBorderRadius: 14,
      itemMarginInline: 12,
      itemMarginBlock: 4,
    },
    Table: {
      headerBg: 'transparent',
    },
    Modal: {
      borderRadiusLG: 12,
    },
    Tag: {
      borderRadiusSM: 999,
      borderRadius: 999,
    },
    Segmented: {
      borderRadius: 8,
    },
  }
}

// ===== 主题配置 =====
export function createThemeConfig(isDark: boolean): ThemeConfig {
  return {
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    cssVar: {
      prefix: 'mb',
    },
    token: baseSeed,
    components: getComponentTokens(),
  }
}

// ===== CSS 变量同步 =====
// 将 AntD 算法计算的 token 同步为全局 CSS 变量
// 用于 FOUC 防闪烁和 CSS 文件中的全局引用
export function syncCssVars(isDark: boolean): void {
  const config = createThemeConfig(isDark)
  const token = theme.getDesignToken({ token: config.token, algorithm: config.algorithm }) as unknown as Record<string, string>

  const bridge: Record<string, string> = {
    // 文本色
    '--mb-color-text-primary': token.colorText,
    '--mb-color-text-secondary': token.colorTextSecondary,
    '--mb-color-text-muted': token.colorTextTertiary,
    '--mb-color-text-tertiary': token.colorTextTertiary,
    '--mb-color-text-disabled': token.colorTextQuaternary,
    // 背景色
    '--mb-color-bg-app': token.colorBgLayout,
    '--mb-color-bg-panel': token.colorBgContainer,
    '--mb-color-bg-elevated': token.colorBgElevated,
    '--mb-color-bg-hover': token.controlItemBgHover || token.colorBgTextHover,
    '--mb-color-bg-selected': token.controlItemBgActive || token.colorPrimaryBg,
    // 边框色
    '--mb-color-border-subtle': token.colorBorderSecondary,
    '--mb-color-border-default': token.colorBorder,
    '--mb-color-border': token.colorBorder,
    // 操作色
    '--mb-color-action-primary': token.colorPrimary,
    '--mb-color-action-primary-hover': token.colorPrimaryHover,
    '--mb-color-on-action-primary': token.colorWhite,
    // 语义色
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
