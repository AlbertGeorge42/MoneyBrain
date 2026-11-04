/**
 * 总览页纯函数：净资产推导、储蓄率、走势几何与坐标轴简写。
 * 只在 HF 预览的 mock 数据上工作；真实 API 接线留 R 批。
 */

import { formatAmount, formatUnsigned } from '../transactions/transaction-utils'

export type TrendPoint = {
  label: string
  value: number
}

export type TrendGeometry = {
  points: Array<TrendPoint & { x: number; y: number }>
  linePath: string
  areaPath: string
  min: number
  max: number
  mid: number
}

const VIEW_W = 100
const VIEW_H = 100
const PAD_Y = 8

function round(value: number): number {
  return Number(value.toFixed(2))
}

/**
 * 净资产 = 快照基数 + 本次会话对净额的影响。
 * 冷启动账本没有历史快照，净资产直接等于已记流水的净额。
 */
export function deriveNetWorth(options: {
  freshLedger: boolean
  base: number
  baselineNet: number
  currentNet: number
}): number {
  if (options.freshLedger) return options.currentNet
  return options.base + (options.currentNet - options.baselineNet)
}

/** 净资产 / 走势金额：负数带 − 号，正数不带 +（概览里不作为增量展示）。 */
export function formatNetAmount(value: number): string {
  return value < 0 ? formatAmount(value) : formatUnsigned(value)
}

/** 储蓄率 = 本月结余 / 本月收入；没有收入时不显示（返回 null）。 */
export function savingsRate(income: number, net: number): number | null {
  if (income <= 0) return null
  return net / income
}

/** 图表纵轴简写：万元以上保留一位小数（28.6万），以下取整。 */
export function formatCompactMoney(value: number): string {
  const sign = value < 0 ? '−' : ''
  const abs = Math.abs(value)
  if (abs >= 10000) return `${sign}¥${(abs / 10000).toFixed(1)}万`
  return `${sign}¥${Math.round(abs)}`
}

/**
 * 把走势点映射到 100×100 的 viewBox（配合 preserveAspectRatio="none" 拉满容器）。
 * 少于两个点返回 null，由调用方显示「刚起步」占位。
 */
export function buildTrendGeometry(
  points: TrendPoint[],
  width = VIEW_W,
  height = VIEW_H,
  padY = PAD_Y,
): TrendGeometry | null {
  if (points.length < 2) return null

  const values = points.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const innerHeight = height - padY * 2

  const mapped = points.map((point, index) => ({
    ...point,
    x: round((index / (points.length - 1)) * width),
    y: round(height - padY - ((point.value - min) / span) * innerHeight),
  }))

  const linePath = mapped
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
    .join(' ')
  const areaPath = `${linePath} L${width} ${height} L0 ${height} Z`

  return {
    points: mapped,
    linePath,
    areaPath,
    min,
    max,
    mid: (min + max) / 2,
  }
}
