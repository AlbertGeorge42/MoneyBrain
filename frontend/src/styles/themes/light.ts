/**
 * 浅色主题值映射
 * 对应 CSS 变量的实际色值
 */

export const lightThemeValues = {
  // ========== 文本颜色 ==========
  '--mb-color-text-primary': 'rgba(0, 0, 0, 0.88)',
  '--mb-color-text-secondary': '#595959',
  '--mb-color-text-muted': '#6b6b6b',
  '--mb-color-text-disabled': 'rgba(0, 0, 0, 0.25)',

  // ========== 背景颜色 ==========
  '--mb-color-bg-app': '#f0f2f5',
  '--mb-color-bg-panel': '#ffffff',
  '--mb-color-bg-surface': '#ffffff',
  '--mb-color-bg-elevated': '#ffffff',
  '--mb-color-bg-hover': '#f5f5f5',
  '--mb-color-bg-selected': '#e6f7ff',

  // ========== 边框颜色 ==========
  '--mb-color-border-subtle': '#f0f0f0',
  '--mb-color-border-default': '#d9d9d9',
  '--mb-color-border-strong': '#d9d9d9',
  '--mb-color-border-input': '#d9d9d9',

  // ========== 操作/动作颜色 ==========
  '--mb-color-action-primary': '#1890ff',
  '--mb-color-action-primary-hover': '#40a9ff',
  '--mb-color-on-action-primary': '#ffffff',

  // ========== 状态颜色 ==========
  '--mb-color-success': '#3f8600',
  '--mb-color-danger': '#cf1322',
  '--mb-color-warning': '#faad14',
  '--mb-color-info': '#1890ff',
  '--mb-color-success-bg': 'rgba(63, 134, 0, 0.1)',
  '--mb-color-danger-bg': 'rgba(207, 19, 34, 0.1)',
  '--mb-color-warning-bg': 'rgba(250, 173, 20, 0.1)',
  '--mb-color-info-bg': 'rgba(24, 144, 255, 0.1)',

  // ========== 财务颜色 ==========
  '--mb-color-income': '#52c41a',
  '--mb-color-expense': '#ff4d4f',
  '--mb-color-transfer': '#1890ff',
  '--mb-color-refund': '#fa8c16',
  '--mb-color-adjustment': '#722ed1',
  '--mb-color-positive': '#3f8600',
  '--mb-color-negative': '#cf1322',
  '--mb-color-neutral': '#595959',

  // ========== 现金流类型颜色 ==========
  '--mb-color-cash': '#1890ff',
  '--mb-color-non-cash': '#13c2c2',
  '--mb-color-operating': '#52c41a',
  '--mb-color-investing': '#1890ff',
  '--mb-color-financing': '#fa8c16',

  // ========== 间距 ==========
  '--mb-space-stack-tight': '4px',
  '--mb-space-stack-default': '8px',
  '--mb-space-stack-loose': '12px',

  '--mb-space-inline-tight': '4px',
  '--mb-space-inline-default': '8px',

  '--mb-space-control-gap': '8px',
  '--mb-space-card-padding': '16px',
  '--mb-space-section-gap': '24px',
  '--mb-space-page-padding': '24px',
  '--mb-space-page-gap': '32px',

  // ========== 字体 ==========
  '--mb-font-size-caption': '12px',
  '--mb-font-size-body': '14px',
  '--mb-font-size-body-large': '16px',
  '--mb-font-size-section-title': '18px',
  '--mb-font-size-page-title': '20px',
  '--mb-font-size-metric': '20px',
  '--mb-font-size-mobile-label': '11px',
  '--mb-font-weight-normal': '400',
  '--mb-font-weight-medium': '500',
  '--mb-font-weight-bold': '700',

  // ========== 边框 ==========
  '--mb-border-width': '1px',
  '--mb-border-width-thick': '2px',
  '--mb-border-style': 'solid',

  // ========== 阴影 ==========
  '--mb-shadow-card': '0 1px 2px rgba(0, 0, 0, 0.05)',
  '--mb-shadow-panel': '0 2px 8px rgba(0, 0, 0, 0.15)',
  '--mb-shadow-popover': '0 4px 16px rgba(0, 0, 0, 0.2)',
  '--mb-shadow-focus': '0 0 0 2px rgba(24, 144, 255, 0.2)',

  // ========== 圆角 ==========
  '--mb-radius-control': '6px',
  '--mb-radius-card': '8px',
  '--mb-radius-panel': '12px',
  '--mb-radius-brand': '14px',
  '--mb-radius-pill': '999px',

  // ========== 动效 ==========
  '--mb-motion-fast': '0.15s',
  '--mb-motion-mid': '0.24s',
  '--mb-motion-slow': '0.32s',
  '--mb-ease-standard': 'cubic-bezier(0.2, 0, 0, 1)',

  // ========== 布局 ==========
  '--mb-layout-sider-width': '248px',
  '--mb-layout-mobile-breakpoint': '860px',
  '--mb-page-max-width': '1440px',
  '--mb-mobile-tab-height': '64px',

  // ========== Z-index ==========
  '--mb-z-mobile-tab': '100',
  '--mb-z-dropdown': '1000',
  '--mb-z-modal': '1100',

  } as const

export type LightThemeValues = typeof lightThemeValues
