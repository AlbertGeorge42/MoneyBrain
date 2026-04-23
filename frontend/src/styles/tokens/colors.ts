/**
 * 颜色设计令牌
 * 定义语义化颜色与功能颜色，支持浅色/暗色主题
 */

// ============================================
// 语义化颜色 - 财务业务语义
// ============================================

/** 成功/收入/资产/正数 */
export const colorSuccess = 'var(--mb-color-success)'

/** 危险/支出/负债/负数 */
export const colorDanger = 'var(--mb-color-danger)'

/** 警告/退款/预警 */
export const colorWarning = 'var(--mb-color-warning)'

/** 信息/转账/链接 */
export const colorInfo = 'var(--mb-color-info)'

/** 主品牌色 */
export const colorPrimary = 'var(--mb-color-primary)'

/** 正数/盈利（财务语义） */
export const colorPositive = 'var(--mb-color-positive)'

/** 负数/亏损（财务语义） */
export const colorNegative = 'var(--mb-color-negative)'

/** 投资/平账等特殊标识 */
export const colorInvestment = 'var(--mb-color-investment)'

// ============================================
// 文本颜色
// ============================================

/** 主要文本 */
export const colorText = 'var(--mb-color-text)'

/** 次要文本 */
export const colorNeutral = 'var(--mb-color-neutral)'

/** 辅助文本/占位符 */
export const colorMuted = 'var(--mb-color-muted)'

/** 禁用状态文本 */
export const colorDisabled = 'var(--mb-color-disabled)'

// ============================================
// 背景与表面颜色
// ============================================

/** 页面背景 */
export const colorBackground = 'var(--mb-color-background)'

/** 卡片/浮层面板背景 */
export const colorSurface = 'var(--mb-color-surface)'

/** 悬停背景 */
export const colorSurfaceHover = 'var(--mb-color-surface-hover)'

/** 选中背景 */
export const colorSurfaceSelected = 'var(--mb-color-surface-selected)'

// ============================================
// 边框与分割线
// ============================================

/** 标准分割线/边框 */
export const colorBorder = 'var(--mb-color-border)'

/** 输入框边框 */
export const colorBorderInput = 'var(--mb-color-border-input)'

// ============================================
// CSS 变量名常量（用于 getTokenValue 等场景）
// ============================================

export const colorVars = {
  colorSuccess: '--mb-color-success',
  colorDanger: '--mb-color-danger',
  colorWarning: '--mb-color-warning',
  colorInfo: '--mb-color-info',
  colorPrimary: '--mb-color-primary',
  colorPositive: '--mb-color-positive',
  colorNegative: '--mb-color-negative',
  colorInvestment: '--mb-color-investment',
  colorText: '--mb-color-text',
  colorNeutral: '--mb-color-neutral',
  colorMuted: '--mb-color-muted',
  colorDisabled: '--mb-color-disabled',
  colorBackground: '--mb-color-background',
  colorSurface: '--mb-color-surface',
  colorSurfaceHover: '--mb-color-surface-hover',
  colorSurfaceSelected: '--mb-color-surface-selected',
  colorBorder: '--mb-color-border',
  colorBorderInput: '--mb-color-border-input',
} as const
