/**
 * 交易类型与视觉配置的集中映射
 * 任何需要按交易类型显示颜色或文案的组件，都应从此处导入，避免在多个文件重复维护。
 */
export const TRANSACTION_TYPE_CONFIG = {
  income: { color: 'var(--mb-color-income)', text: '收入' },
  expense: { color: 'var(--mb-color-expense)', text: '支出' },
  transfer: { color: 'var(--mb-color-transfer)', text: '转账' },
  refund: { color: 'var(--mb-color-refund)', text: '退款' },
  adjustment: { color: 'var(--mb-color-adjustment)', text: '平账' },
} as const

export type TransactionType = keyof typeof TRANSACTION_TYPE_CONFIG

export const TRANSACTION_COLORS = {
  income: 'var(--mb-color-income)',
  expense: 'var(--mb-color-expense)',
  transfer: 'var(--mb-color-transfer)',
  refund: 'var(--mb-color-refund)',
  adjustment: 'var(--mb-color-adjustment)',
  positive: 'var(--mb-color-positive)',
  negative: 'var(--mb-color-negative)',
} as const

export type TransactionColorKey = keyof typeof TRANSACTION_COLORS
