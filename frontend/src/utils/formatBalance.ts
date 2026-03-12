/**
 * 统一余额显示格式化工具
 * 
 * 显示逻辑：
 * - 资产账户：余额 >= 0 显示绿色正数，余额 < 0 显示红色负数（透支）
 * - 负债账户：余额 <= 0 显示红色绝对值（正常欠款），余额 > 0 显示绿色负数（多还款）
 */

interface BalanceDisplayResult {
  text: string
  color: string
  displayValue: number
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
  const prefix = showSymbol ? '¥' : ''
  
  if (accountType === 'asset') {
    // 资产账户
    if (balance >= 0) {
      return {
        text: `${prefix}${balance.toFixed(2)}`,
        color: '#3f8600',  // 绿色
        displayValue: balance,
      }
    } else {
      return {
        text: `${prefix}${balance.toFixed(2)}`,
        color: '#cf1322',  // 红色（透支）
        displayValue: balance,
      }
    }
  } else {
    // 负债账户
    if (balance <= 0) {
      // 正常欠款：显示绝对值，红色
      return {
        text: `${prefix}${Math.abs(balance).toFixed(2)}`,
        color: '#cf1322',  // 红色
        displayValue: Math.abs(balance),
      }
    } else {
      // 多还款：显示负数，绿色
      return {
        text: `${prefix}${(-balance).toFixed(2)}`,
        color: '#3f8600',  // 绿色
        displayValue: -balance,
      }
    }
  }
}

/**
 * 格式化净资产显示
 * @param netWorth 净资产
 * @param showSymbol 是否显示货币符号
 * @returns 格式化结果
 */
export function formatNetWorth(
  netWorth: number,
  showSymbol: boolean = true
): BalanceDisplayResult {
  const prefix = showSymbol ? '¥' : ''
  
  if (netWorth >= 0) {
    return {
      text: `${prefix}${netWorth.toFixed(2)}`,
      color: '#3f8600',
      displayValue: netWorth,
    }
  } else {
    return {
      text: `${prefix}${netWorth.toFixed(2)}`,
      color: '#cf1322',
      displayValue: netWorth,
    }
  }
}
