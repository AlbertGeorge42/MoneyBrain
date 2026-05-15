/**
 * 深色主题值映射
 * 对应 CSS 变量的实际色值
 */

export const darkThemeValues = {
  // ========== 文本颜色 ==========
  '--mb-color-text-primary': 'rgba(255, 255, 255, 0.88)',
  '--mb-color-text-secondary': '#bfbfbf',
  '--mb-color-text-muted': '#a6a6a6',
  '--mb-color-text-disabled': 'rgba(255, 255, 255, 0.35)',

  // ========== 背景颜色 ==========
  '--mb-color-bg-app': '#141414',
  '--mb-color-bg-panel': '#1f1f1f',
  '--mb-color-bg-surface': '#1f1f1f',
  '--mb-color-bg-elevated': '#262626',
  '--mb-color-bg-hover': '#2c2c2c',
  '--mb-color-bg-selected': '#111b26',

  // ========== 边框颜色 ==========
  '--mb-color-border-subtle': '#424242',
  '--mb-color-border-default': '#5a5a5a',
  '--mb-color-border-strong': '#5a5a5a',
  '--mb-color-border-input': '#434343',

  // ========== 操作/动作颜色 ==========
  '--mb-color-action-primary': '#177ddc',
  '--mb-color-action-primary-hover': '#40a9ff',
  '--mb-color-on-action-primary': '#ffffff',

  // ========== 状态颜色 ==========
  '--mb-color-success': '#49aa19',
  '--mb-color-danger': '#d84a4a',
  '--mb-color-warning': '#d89614',
  '--mb-color-info': '#177ddc',
  '--mb-color-success-bg': 'rgba(73, 170, 25, 0.15)',
  '--mb-color-danger-bg': 'rgba(216, 74, 74, 0.15)',
  '--mb-color-warning-bg': 'rgba(216, 150, 20, 0.15)',
  '--mb-color-info-bg': 'rgba(23, 125, 220, 0.15)',

  // ========== 财务颜色 ==========
  '--mb-color-income': '#5fd05f',
  '--mb-color-expense': '#ff7875',
  '--mb-color-transfer': '#40a9ff',
  '--mb-color-refund': '#ffc069',
  '--mb-color-adjustment': '#b37feb',
  '--mb-color-positive': '#49aa19',
  '--mb-color-negative': '#d84a4a',
  '--mb-color-neutral': '#bfbfbf',

  // ========== 现金流类型颜色 ==========
  '--mb-color-cash': '#177ddc',
  '--mb-color-non-cash': '#36cfc9',
  '--mb-color-operating': '#49aa19',
  '--mb-color-investing': '#177ddc',
  '--mb-color-financing': '#d89614',

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
  '--mb-shadow-card': '0 1px 2px rgba(0, 0, 0, 0.25)',
  '--mb-shadow-panel': '0 2px 8px rgba(0, 0, 0, 0.35)',
  '--mb-shadow-popover': '0 4px 16px rgba(0, 0, 0, 0.4)',
  '--mb-shadow-focus': '0 0 0 2px rgba(23, 125, 220, 0.25)',

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

export type DarkThemeValues = typeof darkThemeValues
