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
  '--mb-color-investment': '#9254de',

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
  '--mb-color-surface': '#1f1f1f',
  '--mb-color-surface-hover': '#2c2c2c',
  '--mb-color-surface-selected': '#111b26',

  // 边框颜色
  '--mb-color-border': '#424242',
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
} as const

export type DarkThemeValues = typeof darkThemeValues