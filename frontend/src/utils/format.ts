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
