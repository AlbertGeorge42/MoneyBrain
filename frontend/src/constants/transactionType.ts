/**
 * 交易类型与视觉配置的集中映射
 * 任何需要按交易类型显示颜色或文案的组件，都应从此处导入，避免在多个文件重复维护。
 */

import { useMemo } from 'react'
import { useTheme } from '../styles/ThemeContext'
import { getFlatFinancialTokens } from '../styles/theme/financial-tokens'

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
