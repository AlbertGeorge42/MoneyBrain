import { useState } from 'react'
import { currencyAxisFormatter } from '@/utils/format'
import type { DeviceMode } from '@/features/shared/types'
import { amountText, percentText } from './format'
import type { TrendPoint } from './model'

interface ChartLayout {
  width: number
  height: number
  padL: number
  padR: number
  padT: number
  padB: number
}

const LAYOUTS: Record<DeviceMode, ChartLayout> = {
  desktop: { width: 720, height: 200, padL: 64, padR: 18, padT: 8, padB: 26 },
  mobile: { width: 320, height: 200, padL: 48, padR: 12, padT: 8, padB: 24 },
}

const TOOLTIP_W = 108
const TOOLTIP_H = 40
const TOOLTIP_RX = 10

function monthLabel(month: string): string {
  const [year, value] = month.split('-')
  return `${year.slice(2)}.${value}`
}

export function NetWorthTrend({ points, device }: { points: TrendPoint[]; device: DeviceMode }) {
  const [hover, setHover] = useState<number | null>(null)
  const layout = LAYOUTS[device]
  const { width: VIEW_W, height: VIEW_H, padL: PAD_L, padR: PAD_R, padT: PAD_T, padB: PAD_B } = layout

  const values = points.map((point) => point.value)
  const rawMax = Math.max(...values)
  const rawMin = Math.min(...values)
  const headroom = (rawMax - rawMin || 1) * 0.08
  const max = rawMax + headroom
  const min = rawMin - headroom
  const span = max - min
  const plotW = VIEW_W - PAD_L - PAD_R
  const plotH = VIEW_H - PAD_T - PAD_B
  const baseline = PAD_T + plotH

  const xOf = (index: number) => PAD_L + (plotW * index) / (points.length - 1)
  const yOf = (value: number) => PAD_T + ((max - value) / span) * plotH

  const linePoints = points.map((point, index) => `${xOf(index)},${yOf(point.value)}`).join(' ')
  const areaPath = `M ${xOf(0)} ${baseline} L ${points
    .map((point, index) => `${xOf(index)} ${yOf(point.value)}`)
    .join(' L ')} L ${xOf(points.length - 1)} ${baseline} Z`

  const change =
    points.length > 1
      ? ((points[points.length - 1].value - points[points.length - 2].value) /
          points[points.length - 2].value) *
        100
      : 0

  const axisLabels = [max, (max + min) / 2, min]
  const monthTicks = [0, Math.floor(points.length / 2), points.length - 1]

  const hovered = hover === null ? null : points[hover]
  const tooltipHalf = TOOLTIP_W / 2
  const tooltipX =
    hover === null
      ? 0
      : Math.min(
          Math.max(xOf(hover), PAD_L + tooltipHalf),
          VIEW_W - PAD_R - tooltipHalf,
        )
  const tooltipY =
    hover === null
      ? 0
      : yOf(points[hover].value) - (TOOLTIP_H + 12) < PAD_T
        ? yOf(points[hover].value) + 14
        : yOf(points[hover].value) - (TOOLTIP_H + 12)

  return (
    <section className="mb-card mb-trend-card">
      <div className="mb-sec-head">
        <div>
          <h2 className="mb-sec-title">净资产走势</h2>
          <p className="mb-sec-desc">近 12 个月 · 月底快照</p>
        </div>
        <span className={change >= 0 ? 'mb-trend-delta is-positive' : 'mb-trend-delta is-negative'}>
          {percentText(change)}
        </span>
      </div>
      <div className={device === 'mobile' ? 'mb-chart-body is-mobile' : 'mb-chart-body'}>
        <svg
          className="mb-chart-svg"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label="近 12 个月净资产走势，单位元"
        >
          <g className="mb-chart-grid" aria-hidden="true">
            {axisLabels.map((label, index) => {
              const y = PAD_T + (plotH * index) / 2
              return (
                <g key={label + index}>
                  <line x1={PAD_L} y1={y} x2={VIEW_W - PAD_R} y2={y} />
                  <text x={PAD_L - 8} y={y + 4} textAnchor="end">
                    {currencyAxisFormatter(Math.round(label))}
                  </text>
                </g>
              )
            })}
          </g>
          <path className="mb-chart-area" d={areaPath} aria-hidden="true" />
          <polyline className="mb-chart-line" points={linePoints} aria-hidden="true" />
          {points.map((point, index) => (
            <circle
              key={point.month}
              className={index === points.length - 1 ? 'mb-chart-dot is-last' : 'mb-chart-dot'}
              cx={xOf(index)}
              cy={yOf(point.value)}
              r={index === points.length - 1 ? 4.5 : 2.5}
              aria-hidden="true"
            />
          ))}
          {monthTicks.map((index) => (
            <text
              key={points[index].month}
              className="mb-chart-month"
              x={xOf(index)}
              y={VIEW_H - 6}
              textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
            >
              {monthLabel(points[index].month)}
            </text>
          ))}
          {points.map((point, index) => (
            <rect
              key={`hit-${point.month}`}
              className="mb-chart-hit"
              x={xOf(index) - plotW / (points.length - 1) / 2}
              y={PAD_T}
              width={plotW / (points.length - 1)}
              height={plotH}
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
              aria-hidden="true"
            />
          ))}
          {hovered && (
            <g className="mb-chart-tooltip" aria-hidden="true" transform={`translate(${tooltipX}, ${tooltipY})`}>
              <rect
                x={-tooltipHalf}
                y={0}
                width={TOOLTIP_W}
                height={TOOLTIP_H}
                rx={TOOLTIP_RX}
              />
              <text className="mb-chart-tooltip-label" x={0} y={16} textAnchor="middle">
                {monthLabel(hovered.month)}
              </text>
              <text className="mb-chart-tooltip-value" x={0} y={32} textAnchor="middle">
                {amountText(hovered.value)}
              </text>
            </g>
          )}
        </svg>
        <p className="mb-visually-hidden">
          近 12 个月净资产从 {amountText(rawMin)} 变化到 {amountText(rawMax)}。
        </p>
      </div>
    </section>
  )
}
