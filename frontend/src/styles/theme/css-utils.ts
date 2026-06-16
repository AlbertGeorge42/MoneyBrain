/**
 * CSS 变量工具函数
 * 用于 ECharts 等需要从 DOM 读取具体色值的场景
 */

export function getTokenValue(varName: string): string {
  if (typeof window === 'undefined') return ''
  const computedStyle = getComputedStyle(document.documentElement)
  return computedStyle.getPropertyValue(varName).trim()
}

export function getTokenValues(varNames: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  varNames.forEach((name) => {
    result[name] = getTokenValue(name)
  })
  return result
}

export function getChartColors(): Record<string, string> {
  return {
    income: getTokenValue('--mb-color-income'),
    expense: getTokenValue('--mb-color-expense'),
    transfer: getTokenValue('--mb-color-transfer'),
    investment: getTokenValue('--mb-color-investing'),
    refund: getTokenValue('--mb-color-refund'),
    cash: getTokenValue('--mb-color-cash'),
    nonCash: getTokenValue('--mb-color-non-cash'),
    operating: getTokenValue('--mb-color-operating'),
    investing: getTokenValue('--mb-color-investing'),
    financing: getTokenValue('--mb-color-financing'),
    primary: getTokenValue('--mb-color-action-primary'),
    success: getTokenValue('--mb-color-success'),
    warning: getTokenValue('--mb-color-warning'),
    danger: getTokenValue('--mb-color-danger'),
  }
}
