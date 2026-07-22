import { generate } from '@ant-design/colors'

// ===== 交易类型色 - 表达业务类型 =====
const TRANSACTION_SEEDS = {
  income: '#52c41a',     // 绿色
  expense: '#ff4d4f',    // 红色
  transfer: '#1890ff',   // 蓝色
  refund: '#fa8c16',     // 橙色
  adjustment: '#722ed1', // 紫色
}

// ===== 现金流色 - 表达资金属性 =====
const CASH_FLOW_SEEDS = {
  cash: '#1890ff',       // 蓝色 - 现金
  'non-cash': '#13c2c2', // 青色 - 非现金
  investing: '#2f54eb',  // 极客蓝 - 投资（区别于 transfer）
}

// ===== 数值状态色 - 表达数值增减方向（专用于数字显示） =====
// 与交易类型色分离：数字显示用深绿/深红，交易标识用亮绿/亮红
const VALUE_SEEDS = {
  positive: '#3f8600',   // 深绿 - 数字显示用（沉稳，适合阅读）
  negative: '#cf1322',   // 深红 - 数字显示用（沉稳，适合阅读）
  neutral: '#595959',    // 中性灰
}

// ===== 类型定义 =====
export interface TransactionTokens {
  income: string
  expense: string
  transfer: string
  refund: string
  adjustment: string
}

export interface CashFlowTokens {
  cash: string
  'non-cash': string
  investing: string
}

export interface ValueTokens {
  positive: string   // 深绿 - 数字显示用
  negative: string   // 深红 - 数字显示用
  neutral: string
}

export interface FinancialTokens {
  transaction: TransactionTokens
  cashFlow: CashFlowTokens
  value: ValueTokens
}

// ===== 向后兼容的扁平化类型 =====
export interface FlatFinancialTokens {
  income: string
  expense: string
  transfer: string
  refund: string
  adjustment: string
  positive: string
  negative: string
  neutral: string
  cash: string
  'non-cash': string
  investing: string
}

function generateTokensFromSeeds(
  seeds: Record<string, string>,
  isDark: boolean,
  darkIndex = 4
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, seed] of Object.entries(seeds)) {
    if (isDark) {
      const palette = generate(seed, { theme: 'dark' })
      result[key] = palette[darkIndex]
    } else {
      result[key] = seed
    }
  }
  return result
}

/**
 * 获取财务色 Token（三层结构）
 */
export function getFinancialTokens(isDark: boolean): FinancialTokens {
  const transaction = generateTokensFromSeeds(TRANSACTION_SEEDS, isDark) as unknown as TransactionTokens
  const cashFlow = generateTokensFromSeeds(CASH_FLOW_SEEDS, isDark) as unknown as CashFlowTokens
  // 数值状态色暗色模式使用更亮的色档（palette[6]）以保证可读性
  const value = generateTokensFromSeeds(VALUE_SEEDS, isDark, 6) as unknown as ValueTokens

  return {
    transaction,
    cashFlow,
    value,
  }
}

/**
 * 获取扁平化的财务色 Token（向后兼容）
 * 用于 CSS 变量输出
 */
export function getFlatFinancialTokens(isDark: boolean): FlatFinancialTokens {
  const tokens = getFinancialTokens(isDark)
  
  return {
    // 交易类型色
    income: tokens.transaction.income,
    expense: tokens.transaction.expense,
    transfer: tokens.transaction.transfer,
    refund: tokens.transaction.refund,
    adjustment: tokens.transaction.adjustment,
    // 数值状态色（别名）
    positive: tokens.value.positive,
    negative: tokens.value.negative,
    neutral: tokens.value.neutral,
    // 现金流色
    cash: tokens.cashFlow.cash,
    'non-cash': tokens.cashFlow['non-cash'],
    investing: tokens.cashFlow.investing,
  }
}