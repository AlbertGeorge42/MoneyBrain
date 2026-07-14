/**
 * MoneyBrain 主题配置
 * 统一管理 Seed Token、组件 Token、财务色 Seed、主题配置工厂和 CSS 变量同步
 * 所有颜色（信息色 + 财务色 + 阴影）由 syncCssVars() 统一派生
 */

import { theme, type ThemeConfig } from 'antd'
import { generate } from '@ant-design/colors'

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

// ===== 财务色 Seed =====
// 只需定义浅色 seed 值，深色值通过 generate(seed, {theme:'dark'})[5] 自动派生
// 与 AntD darkAlgorithm 使用完全一致的派生逻辑
const FINANCIAL_SEEDS: Record<string, string> = {
  income: '#52c41a',
  expense: '#ff4d4f',
  transfer: '#1890ff',
  refund: '#fa8c16',
  adjustment: '#722ed1',
  positive: '#3f8600',
  negative: '#cf1322',
  neutral: '#595959',
  cash: '#1890ff',
  'non-cash': '#13c2c2',
  investing: '#1890ff',
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
// 将 AntD 算法计算的 token + 财务色派生 token + 阴影 token 同步为全局 CSS 变量
// 用于 FOUC 防闪烁和 CSS 文件中的全局引用
export function syncCssVars(isDark: boolean): void {
  const config = createThemeConfig(isDark)
  const token = theme.getDesignToken(config) as unknown as Record<string, string>

  const vars: Record<string, string> = {
    // 文本色
    '--mb-color-text-primary': token.colorText,
    '--mb-color-text-secondary': token.colorTextSecondary,
    '--mb-color-text-tertiary': token.colorTextTertiary,
    // 背景色
    '--mb-color-bg-app': token.colorBgLayout,
    '--mb-color-bg-panel': token.colorBgContainer,
    '--mb-color-bg-hover': token.controlItemBgHover || token.colorBgTextHover,
    '--mb-color-bg-selected': token.controlItemBgActive || token.colorPrimaryBg,
    // 中性背景（图标默认容器，无颜色时使用）
    // - bold 组：浅色模式使用，与彩色实心色块视觉一致
    // - pale 组：深色模式使用，与彩色淡色色块视觉一致
    '--mb-color-bg-neutral-bold': token.colorTextSecondary,
    '--mb-color-fg-neutral-bold': token.colorBgContainer,
    '--mb-color-bg-neutral-pale': token.colorFillSecondary,
    '--mb-color-fg-neutral-pale': token.colorTextSecondary,
    // 边框色
    '--mb-color-border-subtle': token.colorBorderSecondary,
    '--mb-color-border': token.colorBorder,
    // 操作色
    '--mb-color-action-primary': token.colorPrimary,
    '--mb-color-action-primary-hover': token.colorPrimaryHover,
    '--mb-color-on-action-primary': token.colorWhite,
    // 信息色
    '--mb-color-success': token.colorSuccess,
    '--mb-color-danger': token.colorError,
    '--mb-color-warning': token.colorWarning,
    // 阴影
    '--mb-shadow-card': isDark
      ? '0 1px 2px rgba(0, 0, 0, 0.25)'
      : '0 1px 2px rgba(0, 0, 0, 0.05)',
    '--mb-shadow-panel': isDark
      ? '0 2px 8px rgba(0, 0, 0, 0.35)'
      : '0 2px 8px rgba(0, 0, 0, 0.15)',
  }

  // 财务色：浅色用 seed，深色用 generate() 派生
  for (const [name, seed] of Object.entries(FINANCIAL_SEEDS)) {
    if (isDark) {
      const palette = generate(seed, { theme: 'dark' })
      vars[`--mb-color-${name}`] = palette[5]
    } else {
      vars[`--mb-color-${name}`] = seed
    }
  }

  const el = document.documentElement
  for (const [key, value] of Object.entries(vars)) {
    if (value) {
      el.style.setProperty(key, value)
    }
  }
}
