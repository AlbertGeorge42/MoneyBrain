/**
 * CSS 变量工具函数
 * 用于 ECharts 等需要从 DOM 读取具体色值的场景
 */

export function getTokenValue(varName: string): string {
  if (typeof window === 'undefined') return ''
  const computedStyle = getComputedStyle(document.documentElement)
  return computedStyle.getPropertyValue(varName).trim()
}
