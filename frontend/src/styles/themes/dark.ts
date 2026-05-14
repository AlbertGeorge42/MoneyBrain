/**
 * 暗色主题值映射
 * 对应 CSS 变量的实际色值
 */

export const darkThemeValues = {
  // 语义化颜色
  '--mb-color-success': '#49aa19',
  '--mb-color-danger': '#d84a4a',
  '--mb-color-warning': '#d89614',
  '--mb-color-info': '#177ddc',
  '--mb-color-primary': '#177ddc',
  '--mb-color-positive': '#49aa19',
  '--mb-color-negative': '#d84a4a',

  // 交易类型颜色
  '--mb-color-income': '#5fd05f',
  '--mb-color-expense': '#ff7875',
  '--mb-color-transfer': '#40a9ff',
  '--mb-color-refund': '#ffc069',
  '--mb-color-adjustment': '#b37feb',

  // 现金流类型
  '--mb-color-cash': '#177ddc',
  '--mb-color-non-cash': '#36cfc9',
  '--mb-color-operating': '#49aa19',
  '--mb-color-investing': '#177ddc',
  '--mb-color-financing': '#d89614',

  // 文本颜色
  '--mb-color-text': 'rgba(255, 255, 255, 0.88)',
  '--mb-color-neutral': '#bfbfbf',
  '--mb-color-muted': '#a6a6a6',
  '--mb-color-disabled': 'rgba(255, 255, 255, 0.35)',

  // 背景颜色
  '--mb-color-background': '#141414',
  '--mb-color-panel': '#1f1f1f',
  '--mb-color-surface': '#1f1f1f',
  '--mb-color-surface-elevated': '#262626',
  '--mb-color-surface-muted': '#2a2a2a',
  '--mb-color-surface-hover': '#2c2c2c',
  '--mb-color-surface-selected': '#111b26',

  // 边框颜色
  '--mb-color-border': '#424242',
  '--mb-color-border-strong': '#5a5a5a',
  '--mb-color-border-input': '#434343',

  // 间距
  '--mb-space-xs': '4px',
  '--mb-space-sm': '8px',
  '--mb-space-md': '16px',
  '--mb-space-lg': '24px',
  '--mb-space-xl': '32px',
  '--mb-space-xxl': '48px',

  // 字体
  '--mb-font-size-xs': '12px',
  '--mb-font-size-sm': '14px',
  '--mb-font-size-md': '16px',
  '--mb-font-size-lg': '18px',
  '--mb-font-size-xl': '20px',
  '--mb-font-weight-normal': '400',
  '--mb-font-weight-medium': '500',
  '--mb-font-weight-bold': '700',

  // 边框
  '--mb-border-width': '1px',
  '--mb-border-width-thick': '2px',
  '--mb-border-style': 'solid',

  // 阴影
  '--mb-shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.25)',
  '--mb-shadow-md': '0 2px 8px rgba(0, 0, 0, 0.35)',
  '--mb-shadow-lg': '0 4px 16px rgba(0, 0, 0, 0.4)',

  // 圆角
  '--mb-radius-sm': '4px',
  '--mb-radius-md': '6px',
  '--mb-radius-lg': '8px',
  '--mb-radius-xl': '12px',
  // 语义化圆角
  '--mb-radius-control': '6px',
  '--mb-radius-card': '8px',
  '--mb-radius-brand': '14px',

  // 动效
  '--mb-motion-fast': '0.15s',
  '--mb-motion-mid': '0.24s',
  '--mb-motion-slow': '0.32s',
  '--mb-ease-standard': 'cubic-bezier(0.2, 0, 0, 1)',

  // 布局
  '--mb-layout-sider-width': '248px',
  '--mb-layout-mobile-breakpoint': '860px',
  '--mb-page-max-width': '1440px',
  '--mb-mobile-tab-height': '64px',

  // Z-index
  '--mb-z-mobile-tab': '100',
  '--mb-z-dropdown': '1000',
  '--mb-z-modal': '1100',

  // 语义化颜色补充
  '--mb-color-on-primary': '#ffffff',
  '--mb-font-size-caption': '13px',
} as const

export type DarkThemeValues = typeof darkThemeValues