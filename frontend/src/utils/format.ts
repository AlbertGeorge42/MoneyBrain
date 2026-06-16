/**
 * 货币与数字格式化工具
 */

interface FormatCurrencyOptions {
  /** 小数位数，默认 2 */
  decimals?: number
  /** 是否显示正号前缀（+¥），默认 false */
  showSign?: boolean
  /** 是否显示货币符号（¥），默认 true */
  showSymbol?: boolean
}

/**
 * 格式化货币金额
 * @param value 金额数值
 * @param options 格式化选项
 * @returns 格式化后的字符串
 *
 * @example
 * formatCurrency(1234.5)              // "¥1,234.50"
 * formatCurrency(1234.5, { showSign: true })  // "+¥1,234.50"
 * formatCurrency(-1234.5)             // "-¥1,234.50"
 * formatCurrency(1234.5, { showSymbol: false }) // "1,234.50"
 */
export function formatCurrency(value: number, options?: FormatCurrencyOptions): string {
  const num = typeof value === 'number' ? value : parseFloat(String(value)) || 0
  const { decimals = 2, showSign = false, showSymbol = true } = options ?? {}

  const formatted = num.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  const sign = num >= 0 ? (showSign ? '+' : '') : ''
  const symbol = showSymbol ? '¥' : ''

  // 负数时 toLocaleString 已包含负号，需特殊处理
  if (num < 0) {
    const absFormatted = Math.abs(num).toLocaleString('zh-CN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    return `-${symbol}${absFormatted}`
  }

  return `${sign}${symbol}${formatted}`
}

/**
 * 格式化百分比
 * 收益率等指标始终显示正负号，比率不显示正号
 * @param value 百分比值（如 5.2 表示 5.2%）
 * @param decimals 小数位数，默认 1
 * @param showSign 是否显示正号，默认 true
 *
 * @example
 * formatPercent(5.2)    // "+5.2%"
 * formatPercent(-3.1)   // "-3.1%"
 * formatPercent(35.5, 1, false)  // "35.5%"（比率场景）
 */
export function formatPercent(value: number, decimals = 1, showSign = true): string {
  const sign = value >= 0 ? (showSign ? '+' : '') : ''
  return `${sign}${value.toFixed(decimals)}%`
}

interface TooltipParams {
  axisValue?: string
  marker?: string
  seriesName?: string
  value?: number | string
}

export function currencyTooltipFormatter(params: TooltipParams | TooltipParams[]): string {
  if (!Array.isArray(params)) return ''
  const label = params[0]?.axisValue || ''
  const lines = params.map((p) => {
    const numValue = typeof p.value === 'number' ? p.value : parseFloat(String(p.value)) || 0
    return `${p.marker} ${p.seriesName}: ${formatCurrency(numValue)}`
  })
  return [label, ...lines].join('<br/>')
}

export function currencyAxisFormatter(value: number): string {
  return `¥${value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`
}

/**
 * 创建 Ant Design Statistic 组件专用的格式化器
 * @param decimals 小数位数
 * @returns 格式化器函数
 */
export function createStatisticFormatter(decimals = 2): (value: string | number) => string {
  return (value: string | number) => formatCurrency(Number(value || 0), { decimals })
}
