import { formatPercent } from './format'

// 预算进度条固定色相：收入=绿、支出=红、转账=蓝
const BUDGET_PROGRESS_HUES: Record<string, number> = {
  income: 100,
  expense: 0,
  transfer: 209,
}

/**
 * 计算预算进度条颜色（HSLA 渐变）
 * @param type 预算类型（income / expense / transfer）
 * @param percentage 已用占比（0-100+）
 * @param isOverBudget 是否超预算（超预算时使用高饱和深色）
 */
export function getProgressColor(type: string, percentage: number, isOverBudget: boolean): string {
  const hue = BUDGET_PROGRESS_HUES[type] ?? 209
  if (isOverBudget) {
    return `hsla(${hue}, 85%, 45%, 1)`
  }
  const sat = 55 + percentage * 0.3
  const light = 72 - percentage * 0.27
  return `hsla(${hue}, ${Math.round(sat)}%, ${Math.round(light)}%, 1)`
}

/**
 * 计算预算进度状态文案
 * @param type 预算类型（income / expense / transfer）
 * @param percentage 已用占比（0-100+）
 * @param isOverBudget 是否超预算
 */
export function getStatusLabel(type: string, percentage: number, isOverBudget: boolean): string {
  if (type === 'income') {
    return isOverBudget ? `超额完成: ${formatPercent(percentage, 1, false)}` : `达成率: ${formatPercent(percentage, 1, false)}`
  }
  if (type === 'transfer') {
    return isOverBudget ? `超预算: ${formatPercent(percentage, 1, false)}` : `流转率: ${formatPercent(percentage, 1, false)}`
  }
  return isOverBudget ? `超预算: ${formatPercent(percentage, 1, false)}` : `使用率: ${formatPercent(percentage, 1, false)}`
}
