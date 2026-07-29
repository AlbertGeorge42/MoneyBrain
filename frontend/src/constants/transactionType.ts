/**
 * 交易类型与视觉配置的集中映射
 * 任何需要按交易类型显示颜色或文案的组件，都应从此处导入，避免在多个文件重复维护。
 */

import { useMemo } from 'react'
import { useTheme } from '../styles/ThemeContext'
import { getFlatFinancialTokens, TRANSACTION_TAG_PRESETS } from '../styles/theme/financial-tokens'

/**
 * 主题感知的金额颜色 Hook
 * 返回当前主题下的 positive（深绿）/ negative（深红）/ neutral（灰）颜色值
 */
export function useAmountColors() {
  const { isDark } = useTheme()
  return useMemo(() => getFlatFinancialTokens(isDark), [isDark])
}

/**
 * 交易类型视觉配置
 * - color: CSS 变量，用于非 Tag 场景（色带、进度条、有色文字等）
 * - tagColor: Ant Design 预设色名，用于 `<Tag color={...}>` 场景
 * - text: 中文展示文案
 */
export const TRANSACTION_TYPE_CONFIG = {
  income:     { color: 'var(--mb-color-income)',  tagColor: TRANSACTION_TAG_PRESETS.income,  text: '收入' },
  expense:    { color: 'var(--mb-color-expense)',  tagColor: TRANSACTION_TAG_PRESETS.expense, text: '支出' },
  transfer:   { color: 'var(--mb-color-transfer)', tagColor: TRANSACTION_TAG_PRESETS.transfer,text: '转账' },
  refund:     { color: 'var(--mb-color-refund)',   tagColor: TRANSACTION_TAG_PRESETS.refund,  text: '退款' },
  adjustment: { color: 'var(--mb-color-adjustment)',tagColor: TRANSACTION_TAG_PRESETS.adjustment,text: '平账' },
} as const

export type TransactionType = keyof typeof TRANSACTION_TYPE_CONFIG
