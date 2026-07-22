/**
 * 交易类型与视觉配置的集中映射
 * 任何需要按交易类型显示颜色或文案的组件，都应从此处导入，避免在多个文件重复维护。
 */

import { useMemo } from 'react'
import { useTheme } from '../styles/ThemeContext'
import { getFlatFinancialTokens } from '../styles/theme/financial-tokens'

// 金额语义颜色 — 已废弃，请使用 useAmountColors() 或 formatAmount()/getAmountColor()
export const AMOUNT_COLORS = {
  positive: 'var(--mb-color-positive)',
  negative: 'var(--mb-color-negative)',
  neutral: 'var(--mb-color-neutral)',
} as const

/**
 * 主题感知的金额颜色 Hook
 * 返回当前主题下的 positive（深绿）/ negative（深红）/ neutral（灰）颜色值
 */
export function useAmountColors() {
  const { isDark } = useTheme()
  return useMemo(() => getFlatFinancialTokens(isDark), [isDark])
}

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
} as const

export type TransactionColorKey = keyof typeof TRANSACTION_COLORS
