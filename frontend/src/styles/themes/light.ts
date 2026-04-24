/**
 * 浅色主题值映射
 * 对应 CSS 变量的实际色值
 */

export const lightThemeValues = {
  // 语义化颜色
  '--mb-color-success': '#3f8600',
  '--mb-color-danger': '#cf1322',
  '--mb-color-warning': '#faad14',
  '--mb-color-info': '#1890ff',
  '--mb-color-primary': '#1890ff',
  '--mb-color-positive': '#3f8600',
  '--mb-color-negative': '#cf1322',
  '--mb-color-investment': '#722ed1',

  // 文本颜色
  '--mb-color-text': 'rgba(0, 0, 0, 0.88)',
  '--mb-color-neutral': '#666666',
  '--mb-color-muted': '#999999',
  '--mb-color-disabled': 'rgba(0, 0, 0, 0.25)',

  // 背景颜色
  '--mb-color-background': '#f0f2f5',
  '--mb-color-surface': '#ffffff',
  '--mb-color-surface-hover': '#f5f5f5',
  '--mb-color-surface-selected': '#e6f7ff',

  // 边框颜色
  '--mb-color-border': '#f0f0f0',
  '--mb-color-border-input': '#d9d9d9',

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
  '--mb-shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
  '--mb-shadow-md': '0 2px 8px rgba(0, 0, 0, 0.15)',
  '--mb-shadow-lg': '0 4px 16px rgba(0, 0, 0, 0.2)',

  // 圆角
  '--mb-radius-sm': '4px',
  '--mb-radius-md': '6px',
  '--mb-radius-lg': '8px',
  '--mb-radius-xl': '12px',

  // 图表颜色
  '--mb-chart-color-income': '#52c41a',
  '--mb-chart-color-expense': '#ff4d4f',
  '--mb-chart-color-transfer': '#1890ff',
  '--mb-chart-color-investment': '#722ed1',
  '--mb-chart-color-refund': '#fa8c16',
  '--mb-chart-color-cash': '#1890ff',
  '--mb-chart-color-non-cash': '#13c2c2',
  '--mb-chart-color-operating': '#52c41a',
  '--mb-chart-color-investing': '#1890ff',
  '--mb-chart-color-financing': '#fa8c16',
  '--mb-chart-color-primary': '#1890ff',
  '--mb-chart-color-secondary': '#52c41a',
  '--mb-chart-color-tertiary': '#fa8c16',
  '--mb-chart-color-quaternary': '#722ed1',
} as const

export type LightThemeValues = typeof lightThemeValues
