/**
 * 统一金额格式化与着色工具
 *
 * 数据约定（API 层契约）：
 * - 资产账户：余额 > 0 表示有资产，< 0 表示透支
 * - 负债账户：金额 > 0 表示欠款，< 0 表示多还款（API 已统一为正数表示欠款）
 * - 现金流：inflow > 0，outflow < 0，net = inflow + outflow 直接成立
 *
 * 显示规则（用户需求）：
 * - asset:     value >= 0 → 绿色（正向）；value < 0 → 红色（负向）
 * - liability: value >= 0 → 红色（欠款）；value < 0 → 绿色（多还款）
 * - flow:      value >= 0 → 绿色（正向）；value < 0 → 红色（负向）
 *
 * 现金流量表等"始终显示正数"的场景：使用 displayAbs 选项，
 * 文本基于 |value|，颜色仍然基于原始符号判断方向。
 */

import { formatCurrency } from './format'
import { getFlatFinancialTokens } from '../styles/theme/financial-tokens'

export type AmountType = 'asset' | 'liability' | 'flow'

export interface AmountFormatOptions {
  /** 是否显示货币符号（默认 true） */
  showSymbol?: boolean
  /** 是否显示正号前缀（默认 false） */
  showSign?: boolean
  /** 小数位数（默认 2） */
  decimals?: number
  /** 文本基于绝对值显示（颜色仍按原值符号判断），默认 false */
  displayAbs?: boolean
  /** 是否为深色主题，用于颜色 Token 派生 */
  isDark?: boolean
}

export interface AmountDisplay {
  text: string
  color: string
}

/**
 * 根据金额类型与符号推导显示颜色
 *
 * 颜色即方向：调用方传入的 value 应已符合"正负符号即方向"约定，
 * 函数不主动取反。
 */
export function getAmountColor(value: number, type: AmountType, isDark = false): string {
  const tokens = getFlatFinancialTokens(isDark)
  const isPositive = value >= 0
  if (type === 'liability') {
    // 负债语义：正数=欠款（红），负数=多还款（绿）
    return isPositive ? tokens.negative : tokens.positive
  }
  // asset / flow 语义相同：正数=正向（绿），负数=负向（红）
  return isPositive ? tokens.positive : tokens.negative
}

/**
 * 同时获取格式化文本与颜色，用于"显示一个数字 + 自动着色"的场景
 */
export function formatAmount(
  value: number,
  type: AmountType = 'asset',
  options: AmountFormatOptions = {}
): AmountDisplay {
  const { showSymbol = true, showSign = false, decimals = 2, displayAbs = false, isDark = false } = options
  // displayAbs 模式下文本用绝对值，但颜色判断仍使用原始符号
  const textValue = displayAbs ? Math.abs(value) : value
  return {
    text: formatCurrency(textValue, { showSymbol, showSign, decimals }),
    color: getAmountColor(value, type, isDark),
  }
}
