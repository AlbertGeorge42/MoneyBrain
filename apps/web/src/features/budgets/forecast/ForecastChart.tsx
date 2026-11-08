/**
 * 推演图（纯 SVG）。
 *
 * 只画后端字段，不做汇总：柱高取 inflow/outflow.total，折线取 endCash / total.netWorth，
 * 分段高度按 actual / planned / committed 分别给的数值做像素堆叠（几何布局，不产生新合计）。
 * 缺口月份只画灰色短横线并断开折线，不用 0 或上期值连接。
 */
import { useId } from 'react'
import type { Minor } from '@contracts/types'
import { currencyAxisFormatter, formatCurrency } from '@/utils/format'
import { isGap, monthText, type ForecastPoint, type ForecastTab } from './model'

interface ForecastChartProps {
  device: 'desktop' | 'mobile'
  tab: ForecastTab
  points: ForecastPoint[]
  selected: number | null
  onSelect: (index: number) => void
  compact?: boolean
}

interface Box {
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
}

function boxFor(device: 'desktop' | 'mobile', compact: boolean): Box {
  if (compact) {
    return device === 'mobile'
      ? { width: 340, height: 150, left: 40, right: 44, top: 16, bottom: 26 }
      : { width: 380, height: 112, left: 44, right: 48, top: 10, bottom: 20 }
  }
  return device === 'mobile'
    ? { width: 340, height: 240, left: 44, right: 50, top: 18, bottom: 34 }
    : { width: 720, height: 280, left: 56, right: 60, top: 20, bottom: 40 }
}

function ticks(min: number, max: number, count: number): number[] {
  const values: number[] = []
  for (let index = 0; index <= count; index += 1) {
    values.push(min + ((max - min) * index) / count)
  }
  return values
}

function extent(values: number[]): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const value of values) {
    if (value < min) min = value
    if (value > max) max = value
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 0 }
  if (min === max) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.08 : 1
    return { min: min - pad, max: max + pad }
  }
  const pad = (max - min) * 0.08
  return { min: min - pad, max: max + pad }
}

export function ForecastChart({ device, tab, points, selected, onSelect, compact = false }: ForecastChartProps) {
  const rawId = useId()
  const uid = rawId.replace(/[^a-zA-Z0-9]/g, '')
  const plannedPattern = `fc-planned-${uid}`
  const committedPattern = `fc-committed-${uid}`

  const box = boxFor(device, compact)
  const plotWidth = box.width - box.left - box.right
  const plotHeight = box.height - box.top - box.bottom
  const slot = points.length > 0 ? plotWidth / points.length : plotWidth
  const barWidth = compact ? Math.min(12, slot * 0.5) : Math.min(18, slot * 0.52)
  const gapWidth = compact ? 20 : 36
  const baselineY = box.top + plotHeight / 2

  const showEvery = device === 'mobile' || compact || points.length >= 10 ? 2 : 1
  const monthLabels = points.map((point, index) => ({
    x: box.left + slot * (index + 0.5),
    text: monthText(point.label),
    show: index % showEvery === 0 || index === points.length - 1,
  }))

  // ---- 现金流：柱（左轴）+ 月末现金折线（右轴） ----
  let upMax = 0
  let downMax = 0
  const lineValues: number[] = []
  for (const point of points) {
    if (isGap(point, 'cash') || !point.cash) continue
    if (point.cash.inflow.total > upMax) upMax = point.cash.inflow.total
    if (point.cash.outflow.total > downMax) downMax = point.cash.outflow.total
    lineValues.push(point.cash.endCash)
  }
  const barHalf = Math.max(upMax, downMax, 1)
  const upHalf = plotHeight / 2
  const barY = (value: number) => baselineY - (value / barHalf) * upHalf
  const barHeight = (value: number) => (Math.abs(value) / barHalf) * upHalf
  const lineExtent = extent(lineValues)
  const lineY = (value: number) => {
    if (lineExtent.max === lineExtent.min) return box.top + plotHeight / 2
    return box.top + ((lineExtent.max - value) / (lineExtent.max - lineExtent.min)) * plotHeight
  }
  const lineTicks = ticks(lineExtent.min, lineExtent.max, compact ? 2 : 3)

  // ---- 资产：净资产折线 + 实际基准虚线 ----
  let baseNetWorth: number | undefined
  const netWorthValues: number[] = []
  for (const point of points) {
    if (!point.asset) continue
    if (baseNetWorth === undefined) baseNetWorth = point.asset.actual.netWorth
    if (isGap(point, 'asset')) continue
    netWorthValues.push(point.asset.total.netWorth)
    netWorthValues.push(point.asset.actual.netWorth)
  }
  const assetExtent = extent(netWorthValues)
  const assetY = (value: number) => {
    if (assetExtent.max === assetExtent.min) return box.top + plotHeight / 2
    return box.top + ((assetExtent.max - value) / (assetExtent.max - assetExtent.min)) * plotHeight
  }
  const assetTicks = ticks(assetExtent.min, assetExtent.max, compact ? 2 : 3)

  const upTicks = ticks(0, barHalf, compact ? 2 : 3)

  function stackSegment(
    x: number,
    index: number,
    y: number,
    height: number,
    kind: 'actual' | 'planned' | 'committed',
    direction: 'up' | 'down',
    value: Minor,
    label: string,
  ) {
    const safeHeight = Math.max(height, 0)
    const fill =
      kind === 'actual'
        ? 'var(--mb-color-income)'
        : `url(#${kind === 'planned' ? plannedPattern : committedPattern})`
    return (
      <rect
        key={`${index}-${direction}-${kind}`}
        x={x}
        y={y}
        width={barWidth}
        height={safeHeight}
        rx={2}
        fill={fill}
        className={`mb-fc-bar mb-fc-bar-${kind}`}
      >
        <title>{`${monthText(label)} ${direction === 'up' ? '流入' : '流出'}${kind === 'actual' ? '已发生' : kind === 'planned' ? '按预算计划' : '已排定'} ${formatCurrency(value)}`}</title>
      </rect>
    )
  }

  return (
    <svg
      className={`mb-fc-chart${compact ? ' mb-fc-chart-compact' : ''}`}
      viewBox={`0 0 ${box.width} ${box.height}`}
      role="img"
      aria-label={tab === 'cash' ? '未来现金流推演图' : '未来净资产推演图'}
    >
      <defs>
        <pattern id={plannedPattern} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--mb-color-surface)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--mb-color-expense-display)" strokeWidth="3" />
        </pattern>
        <pattern id={committedPattern} width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" fill="var(--mb-color-surface)" />
          <circle cx="1" cy="1" r="0.9" fill="var(--mb-color-expense-display)" />
          <circle cx="4" cy="4" r="0.9" fill="var(--mb-color-expense-display)" />
        </pattern>
      </defs>

      {/* 选中月背景 */}
      {selected !== null && points[selected] && (
        <rect
          x={box.left + slot * selected}
          y={box.top}
          width={slot}
          height={plotHeight}
          fill="var(--mb-color-surface-sunken)"
          className="mb-fc-selected-bg"
        />
      )}

      {tab === 'cash' ? (
        <>
          {upTicks.map((tick) => {
            const y = baselineY - (tick / barHalf) * upHalf
            return (
              <g key={`up-${tick}`}>
                <line x1={box.left} y1={y} x2={box.left + plotWidth} y2={y} className="mb-fc-grid" />
                <text x={box.left - 8} y={y + 4} textAnchor="end" className="mb-fc-axis">
                  {currencyAxisFormatter(tick)}
                </text>
              </g>
            )
          })}
          {upTicks.slice(1).map((tick) => {
            const y = baselineY + (tick / barHalf) * upHalf
            return (
              <g key={`down-${tick}`}>
                <line x1={box.left} y1={y} x2={box.left + plotWidth} y2={y} className="mb-fc-grid" />
                <text x={box.left - 8} y={y + 4} textAnchor="end" className="mb-fc-axis">
                  {currencyAxisFormatter(-tick)}
                </text>
              </g>
            )
          })}
          <line x1={box.left} y1={baselineY} x2={box.left + plotWidth} y2={baselineY} className="mb-fc-zero" />
          {lineTicks.map((tick) => (
            <text
              key={`line-${tick}`}
              x={box.left + plotWidth + 8}
              y={lineY(tick) + 4}
              textAnchor="start"
              className="mb-fc-axis mb-fc-axis-right"
            >
              {currencyAxisFormatter(tick)}
            </text>
          ))}

          {points.map((point, index) => {
            const xCenter = box.left + slot * (index + 0.5)
            const barX = xCenter - barWidth / 2
            if (isGap(point, 'cash') || !point.cash) {
              return (
                <g key={point.label}>
                  <line
                    x1={xCenter - gapWidth / 2}
                    y1={baselineY}
                    x2={xCenter + gapWidth / 2}
                    y2={baselineY}
                    className="mb-fc-gap"
                  />
                  {!compact && (
                    <text x={xCenter} y={baselineY - 8} textAnchor="middle" className="mb-fc-gap-label">
                      未设预算
                    </text>
                  )}
                </g>
              )
            }
            const inflow = point.cash.inflow
            const outflow = point.cash.outflow
            const inflowPlannedY = barY(inflow.actual) - barHeight(inflow.planned)
            const inflowCommittedY = inflowPlannedY - barHeight(inflow.committed)
            const outflowActualHeight = barHeight(outflow.actual)
            const outflowPlannedY = baselineY + outflowActualHeight
            const outflowCommittedY = outflowPlannedY + barHeight(outflow.planned)
            return (
              <g key={point.label}>
                {stackSegment(barX, index, barY(inflow.actual), barHeight(inflow.actual), 'actual', 'up', inflow.actual, point.label)}
                {stackSegment(barX, index, inflowPlannedY, barHeight(inflow.planned), 'planned', 'up', inflow.planned, point.label)}
                {stackSegment(barX, index, inflowCommittedY, barHeight(inflow.committed), 'committed', 'up', inflow.committed, point.label)}
                <line
                  x1={barX}
                  y1={barY(inflow.total)}
                  x2={barX + barWidth}
                  y2={barY(inflow.total)}
                  className="mb-fc-total-cap"
                >
                  <title>{`${monthText(point.label)} 流入合计 ${formatCurrency(inflow.total)}（接口合计）`}</title>
                </line>

                {stackSegment(barX, index, baselineY, outflowActualHeight, 'actual', 'down', outflow.actual, point.label)}
                {stackSegment(barX, index, outflowPlannedY, barHeight(outflow.planned), 'planned', 'down', outflow.planned, point.label)}
                {stackSegment(barX, index, outflowCommittedY, barHeight(outflow.committed), 'committed', 'down', outflow.committed, point.label)}
                <line
                  x1={barX}
                  y1={barY(-outflow.total)}
                  x2={barX + barWidth}
                  y2={barY(-outflow.total)}
                  className="mb-fc-total-cap"
                >
                  <title>{`${monthText(point.label)} 流出合计 ${formatCurrency(outflow.total)}（接口合计）`}</title>
                </line>
              </g>
            )
          })}

          {/* 月末现金折线：缺口处断开 */}
          {(() => {
            const segments: Array<Array<{ x: number; y: number }>> = []
            let current: Array<{ x: number; y: number }> = []
            points.forEach((point, index) => {
              if (isGap(point, 'cash') || !point.cash) {
                if (current.length > 1) segments.push(current)
                current = []
                return
              }
              current.push({ x: box.left + slot * (index + 0.5), y: lineY(point.cash.endCash) })
            })
            if (current.length > 1) segments.push(current)
            return segments.map((segment, segmentIndex) => (
              <polyline
                key={`cash-line-${segmentIndex}`}
                points={segment.map((item) => `${item.x},${item.y}`).join(' ')}
                className="mb-fc-line"
                fill="none"
              />
            ))
          })()}
          {points.map((point, index) => {
            if (isGap(point, 'cash') || !point.cash) return null
            return (
              <circle
                key={`cash-dot-${point.label}`}
                cx={box.left + slot * (index + 0.5)}
                cy={lineY(point.cash.endCash)}
                r={3}
                className="mb-fc-dot mb-fc-dot-cash"
              >
                <title>{`${monthText(point.label)} 月末现金 ${formatCurrency(point.cash.endCash)}`}</title>
              </circle>
            )
          })}
        </>
      ) : (
        <>
          {assetTicks.map((tick) => {
            const y = assetY(tick)
            return (
              <g key={`asset-${tick}`}>
                <line x1={box.left} y1={y} x2={box.left + plotWidth} y2={y} className="mb-fc-grid" />
                <text x={box.left - 8} y={y + 4} textAnchor="end" className="mb-fc-axis">
                  {currencyAxisFormatter(tick)}
                </text>
              </g>
            )
          })}
          {baseNetWorth !== undefined && (
            <line
              x1={box.left}
              y1={assetY(baseNetWorth)}
              x2={box.left + plotWidth}
              y2={assetY(baseNetWorth)}
              className="mb-fc-baseline"
            />
          )}
          {(() => {
            const segments: Array<Array<{ x: number; y: number }>> = []
            let current: Array<{ x: number; y: number }> = []
            points.forEach((point, index) => {
              if (isGap(point, 'asset') || !point.asset) {
                if (current.length > 1) segments.push(current)
                current = []
                return
              }
              current.push({ x: box.left + slot * (index + 0.5), y: assetY(point.asset.total.netWorth) })
            })
            if (current.length > 1) segments.push(current)
            return segments.map((segment, segmentIndex) => (
              <polyline
                key={`asset-line-${segmentIndex}`}
                points={segment.map((item) => `${item.x},${item.y}`).join(' ')}
                className="mb-fc-line mb-fc-line-asset"
                fill="none"
              />
            ))
          })()}
          {points.map((point, index) => {
            const xCenter = box.left + slot * (index + 0.5)
            if (isGap(point, 'asset') || !point.asset) {
              return (
                <g key={point.label}>
                  <line
                    x1={xCenter - gapWidth / 2}
                    y1={baselineY}
                    x2={xCenter + gapWidth / 2}
                    y2={baselineY}
                    className="mb-fc-gap"
                  />
                  {!compact && (
                    <text x={xCenter} y={baselineY - 8} textAnchor="middle" className="mb-fc-gap-label">
                      未设预算
                    </text>
                  )}
                </g>
              )
            }
            return <circle key={point.label} cx={xCenter} cy={assetY(point.asset.total.netWorth)} r={3.5} className="mb-fc-dot">
              <title>{`${monthText(point.label)} 净资产合计 ${formatCurrency(point.asset.total.netWorth)}（接口合计）`}</title>
            </circle>
          })}
        </>
      )}

      {/* 月份标签 + 点击区 */}
      {monthLabels.map((item, index) =>
        item.show ? (
          <text key={`label-${index}`} x={item.x} y={box.height - 10} textAnchor="middle" className="mb-fc-axis">
            {item.text}
          </text>
        ) : null,
      )}
      {points.map((point, index) => {
        const x = box.left + slot * index
        return (
          <rect
            key={`hit-${point.label}`}
            x={x}
            y={box.top}
            width={slot}
            height={plotHeight}
            fill="transparent"
            className="mb-fc-hit"
            role="button"
            tabIndex={0}
            aria-label={`${monthText(point.label)}明细`}
            onClick={() => onSelect(index)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(index)
              }
            }}
          />
        )
      })}
    </svg>
  )
}
