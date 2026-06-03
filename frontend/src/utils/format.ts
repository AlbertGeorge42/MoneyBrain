export function formatCurrency(value: number, decimals = 2): string {
  const num = typeof value === 'number' ? value : parseFloat(value) || 0
  return `¥${num.toFixed(decimals)}`
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
  return `¥${value.toFixed(0)}`
}

/**
 * 创建 Ant Design Statistic 组件专用的格式化器
 * @param decimals 小数位数
 * @returns 格式化器函数
 */
export function createStatisticFormatter(decimals = 2): (value: string | number) => string {
  return (value: string | number) => formatCurrency(Number(value || 0), decimals)
}
