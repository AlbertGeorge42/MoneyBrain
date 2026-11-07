/**
 * 图表几何（HF 共用）
 *
 * 1:1 单位 viewBox：图表宽度取容器实测宽度，1 SVG 单位 = 1 CSS px，
 * 因此字号 / 线宽不会被 viewBox 缩放改变。报表页图表复用同一套边距与常量。
 * 高度只在这里定义一次，组件把 CHART_HEIGHT 作为 SVG 的 height 属性，
 * 不再在 CSS 里重复声明。
 */
import type { DeviceMode } from './types'

export const CHART_HEIGHT = 200
export const CHART_TOOLTIP_W = 108
export const CHART_TOOLTIP_H = 40
export const CHART_TOOLTIP_RX = 10

/** 轴标签实测字号（与 CSS 保持同值）；用于按最长刻度推算左侧留白。 */
export const AXIS_FONT_SIZE: Record<DeviceMode, number> = { desktop: 12, mobile: 13 }
/** 数字字体近似字宽比；刻度只用等宽数字与符号。 */
const DIGIT_WIDTH_RATIO = 0.62

const FALLBACK_WIDTH: Record<DeviceMode, number> = { desktop: 1024, mobile: 320 }
const BASE_PADDING: Record<DeviceMode, Omit<ChartLayout, 'width' | 'height' | 'padL'>> = {
  desktop: { padR: 18, padT: 8, padB: 26 },
  mobile: { padR: 12, padT: 8, padB: 24 },
}
const BASE_PAD_L: Record<DeviceMode, number> = { desktop: 68, mobile: 76 }

export interface ChartLayout {
  width: number
  height: number
  padL: number
  padR: number
  padT: number
  padB: number
}

export function estimateLabelWidth(text: string, device: DeviceMode): number {
  return text.length * AXIS_FONT_SIZE[device] * DIGIT_WIDTH_RATIO
}

export function buildChartLayout(
  device: DeviceMode,
  containerWidth?: number,
  axisLabels: readonly string[] = [],
): ChartLayout {
  const width = Math.max(
    240,
    Math.round(containerWidth && containerWidth > 0 ? containerWidth : FALLBACK_WIDTH[device]),
  )
  const longest = axisLabels.reduce(
    (max, label) => Math.max(max, estimateLabelWidth(label, device)),
    0,
  )
  const padL = Math.max(BASE_PAD_L[device], Math.ceil(longest + 12))

  return {
    width,
    height: CHART_HEIGHT,
    padL,
    ...BASE_PADDING[device],
  }
}
