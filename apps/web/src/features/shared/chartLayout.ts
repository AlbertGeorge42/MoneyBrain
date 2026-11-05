/**
 * 图表几何（HF 共用）
 *
 * 1:1 单位 viewBox：图表宽度取容器实测宽度，1 SVG 单位 = 1 CSS px，
 * 因此字号 / 线宽不会被 viewBox 缩放改变。报表页图表复用同一套边距与常量。
 */
import type { DeviceMode } from './types'

export const CHART_HEIGHT = 200
export const CHART_TOOLTIP_W = 108
export const CHART_TOOLTIP_H = 40
export const CHART_TOOLTIP_RX = 10

const FALLBACK_WIDTH: Record<DeviceMode, number> = { desktop: 1024, mobile: 320 }

/** 移动端左侧留白必须容纳最长刻度（¥139,699），否则标签会落到视图外。 */
const PADDING: Record<DeviceMode, Omit<ChartLayout, 'width' | 'height'>> = {
  desktop: { padL: 68, padR: 18, padT: 8, padB: 26 },
  mobile: { padL: 76, padR: 12, padT: 8, padB: 24 },
}

export interface ChartLayout {
  width: number
  height: number
  padL: number
  padR: number
  padT: number
  padB: number
}

export function buildChartLayout(device: DeviceMode, containerWidth?: number): ChartLayout {
  const width = Math.max(240, Math.round(containerWidth && containerWidth > 0 ? containerWidth : FALLBACK_WIDTH[device]))
  return {
    width,
    height: CHART_HEIGHT,
    ...PADDING[device],
  }
}

/** Y 轴刻度标签需要的最小左缘余量（用于回归断言）。 */
export function yAxisLabelLeftEdge(layout: ChartLayout, labelWidth: number): number {
  return layout.padL - 8 - labelWidth
}
