/**
 * 设计令牌工具函数
 * 提供令牌值读取、主题切换等实用功能
 */

import { initTheme, toggleTheme, setTheme, getCurrentTheme, listenSystemThemeChange, type Theme } from './themes'

export { initTheme, toggleTheme, setTheme, getCurrentTheme, listenSystemThemeChange }
export type { Theme }

/**
 * 获取 CSS 变量的当前计算值
 * 用于 ECharts 等需要具体色值的场景
 * @param varName CSS 变量名，如 '--mb-color-success'
 * @returns 当前主题下的实际色值，如 '#3f8600'
 */
export function getTokenValue(varName: string): string {
  if (typeof window === 'undefined') return ''
  const computedStyle = getComputedStyle(document.documentElement)
  return computedStyle.getPropertyValue(varName).trim()
}

/**
 * 批量获取 CSS 变量值
 * @param varNames CSS 变量名数组
 * @returns 变量名到值的映射对象
 */
export function getTokenValues(varNames: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  varNames.forEach((name) => {
    result[name] = getTokenValue(name)
  })
  return result
}

/**
 * 获取所有图表颜色值
 * 用于 ECharts 配置
 */
export function getChartColors(): Record<string, string> {
  return {
    income: getTokenValue('--mb-chart-color-income'),
    expense: getTokenValue('--mb-chart-color-expense'),
    transfer: getTokenValue('--mb-chart-color-transfer'),
    investment: getTokenValue('--mb-chart-color-investment'),
    refund: getTokenValue('--mb-chart-color-refund'),
    cash: getTokenValue('--mb-chart-color-cash'),
    nonCash: getTokenValue('--mb-chart-color-non-cash'),
    operating: getTokenValue('--mb-chart-color-operating'),
    investing: getTokenValue('--mb-chart-color-investing'),
    financing: getTokenValue('--mb-chart-color-financing'),
    primary: getTokenValue('--mb-chart-color-primary'),
    secondary: getTokenValue('--mb-chart-color-secondary'),
    tertiary: getTokenValue('--mb-chart-color-tertiary'),
    quaternary: getTokenValue('--mb-chart-color-quaternary'),
  }
}
