import { useMemo } from 'react'
import { ChartLine } from 'lucide-react'
import { getChartTokens, type ColorScheme } from '../../styles/theme/tokens'
import { formatAmount, formatUnsigned } from '../transactions/transaction-utils'
import { buildTrendGeometry, formatCompactMoney, type TrendPoint } from './overview-utils'

type NetWorthTrendProps = {
  points: TrendPoint[]
  scheme: ColorScheme
}

function money(value: number): string {
  return value < 0 ? formatAmount(value) : formatUnsigned(value)
}

/**
 * 净资产走势：纯 SVG + ChartTokens，不引 ECharts。
 * 坐标轴文字用 HTML 排布，避免 preserveAspectRatio 拉伸字形。
 */
export function NetWorthTrend({ points, scheme }: NetWorthTrendProps) {
  const tokens = getChartTokens(scheme)
  const geometry = useMemo(() => buildTrendGeometry(points), [points])

  if (!geometry) {
    return (
      <div className="ov-chart-empty">
        <ChartLine aria-hidden />
        <span className="mb-text-1">至少两天的记录后，走势会出现在这里</span>
      </div>
    )
  }

  const first = points[0]
  const last = points[points.length - 1]
  const labelStep = Math.ceil(points.length / 4)

  return (
    <div className="ov-chart">
      <div className="ov-chart-y" aria-hidden style={{ color: tokens.axis }}>
        <span>{formatCompactMoney(geometry.max)}</span>
        <span>{formatCompactMoney(geometry.mid)}</span>
        <span>{formatCompactMoney(geometry.min)}</span>
      </div>
      <div className="ov-chart-main">
        <svg
          className="ov-chart-svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={`近 ${points.length} 个月净资产走势：从 ${money(first.value)} 到 ${money(last.value)}`}
        >
          {[8, 50, 92].map((y) => (
            <line
              key={y}
              x1={0}
              x2={100}
              y1={y}
              y2={y}
              stroke={tokens.grid}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={geometry.areaPath} fill={tokens.series[0]} fillOpacity={0.14} stroke="none" />
          <path
            d={geometry.linePath}
            fill="none"
            stroke={tokens.series[0]}
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="ov-chart-x" aria-hidden style={{ color: tokens.axis }}>
          {points.map((point, index) => {
            const visible = index % labelStep === 0 || index === points.length - 1
            if (!visible) return null
            const edge = index === 0 ? 'start' : index === points.length - 1 ? 'end' : undefined
            return (
              <span
                key={`${point.label}-${index}`}
                data-edge={edge}
                style={{ left: `${(index / (points.length - 1)) * 100}%` }}
              >
                {point.label}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
