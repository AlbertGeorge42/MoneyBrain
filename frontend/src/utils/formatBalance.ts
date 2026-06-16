/**
 * 统一余额显示格式化工具
 *
 * 显示逻辑：
 * - 资产账户：余额 >= 0 显示绿色正数，余额 < 0 显示红色负数（透支）
 * - 负债账户：余额 <= 0 显示红色绝对值（正常欠款），余额 > 0 显示绿色负数（多还款）
 */

import { formatCurrency } from './format'
import { AMOUNT_COLORS } from '@/constants/transactionType'

interface BalanceDisplayResult {
  text: string
  color: string
  displayValue: number
  sign: 'positive' | 'negative'
}

/**
 * 格式化账户余额显示
 * @param balance 账户余额
 * @param accountType 账户类型 'asset' | 'liability'
 * @param showSymbol 是否显示货币符号
 * @returns 格式化结果
 */
export function formatBalance(
  balance: number,
  accountType: 'asset' | 'liability',
  showSymbol: boolean = true
): BalanceDisplayResult {
  if (accountType === 'asset') {
    // 资产账户
    if (balance >= 0) {
      return {
        text: formatCurrency(balance, { showSymbol }),
        color: AMOUNT_COLORS.positive,
        displayValue: balance,
        sign: 'positive',
      }
    } else {
      return {
        text: formatCurrency(balance, { showSymbol }),
        color: AMOUNT_COLORS.negative,
        displayValue: balance,
        sign: 'negative',
      }
    }
  } else {
    // 负债账户
    if (balance <= 0) {
      // 正常欠款：显示绝对值，红色
      return {
        text: formatCurrency(Math.abs(balance), { showSymbol }),
        color: AMOUNT_COLORS.negative,
        displayValue: Math.abs(balance),
        sign: 'negative',
      }
    } else {
      // 多还款：显示负数，绿色
      return {
        text: formatCurrency(-balance, { showSymbol }),
        color: AMOUNT_COLORS.positive,
        displayValue: -balance,
        sign: 'positive',
      }
    }
  }
}
