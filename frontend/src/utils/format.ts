export function formatCurrency(value: number, decimals = 2): string {
  const num = typeof value === 'number' ? value : parseFloat(value) || 0
  return `¥${num.toFixed(decimals)}`
}

export function currencyTooltipFormatter(params: any): string {
  if (!Array.isArray(params)) return ''
  const label = params[0]?.axisValue || ''
  const lines = params.map((p: any) => {
    const numValue = typeof p.value === 'number' ? p.value : parseFloat(p.value) || 0
    return `${p.marker} ${p.seriesName}: ${formatCurrency(numValue)}`
  })
  return [label, ...lines].join('<br/>')
}

export function currencyAxisFormatter(value: number): string {
  return `¥${value.toFixed(0)}`
}

/**
 * 格式化百分比（带正负号）
 * @param value 数值
 * @param decimals 小数位数
 * @returns 格式化后的百分比字符串，如 "+12.34%" 或 "--"
 */
export function formatPercent(value: number | null, decimals = 2): string {
  if (value === null) return '--'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}%`
}

/**
 * 格式化百分比（不带正负号）
 * @param value 数值
 * @param decimals 小数位数
 * @returns 格式化后的百分比字符串，如 "12.34%" 或 "--"
 */
export function formatPercentPlain(value: number | null, decimals = 2): string {
  if (value === null) return '--'
  return `${value.toFixed(decimals)}%`
}

/**
 * 创建 Ant Design Statistic 组件专用的格式化器
 * @param decimals 小数位数
 * @returns 格式化器函数
 */
export function createStatisticFormatter(decimals = 2): (value: string | number) => string {
  return (value: string | number) => formatCurrency(Number(value || 0), decimals)
}
