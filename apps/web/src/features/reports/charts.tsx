/**
 * 报表图表基元（HF 批次 3）
 *
 * 1:1 单位 viewBox + 高度单一来源都来自 features/shared/chartLayout：
 * SVG 的 height 属性取 CHART_HEIGHT，宽度取容器实测宽度，字号与线宽不被缩放。
 * 报表页四个视图共用这里的折线 / 柱状 / 构成条 / 流向条，不复制第二套几何。
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { currencyAxisFormatter } from '@/utils/format'
import { Card } from '@/features/shared/Card'
import type { DeviceMode } from '@/features/shared/types'
import {
  CHART_TOOLTIP_H,
  CHART_TOOLTIP_RX,
  CHART_TOOLTIP_W,
  buildChartLayout,
} from '@/features/shared/chartLayout'
import { barHeight, currency } from './reportsModel'
import type { FlowTreeNode } from './reportsModel'
import { DonutChart, type DonutKind } from '@/features/shared/DonutChart'

// 构成环的唯一实现已下沉到 shared；这里再导出一次，保持报表侧既有 import 路径不变。
export { DonutChart, type DonutKind, type DonutNode } from '@/features/shared/DonutChart'

function useChartWidth(): [RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => setWidth(node.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

export function ChartCard({
  title,
  desc,
  children,
  className,
}: {
  title: string
  desc?: string
  children: ReactNode
  className?: string
}) {
  return (
    <Card variant="report" className={className ? `mb-rp-chart-card ${className}` : 'mb-rp-chart-card'}>
      <div className="mb-rp-sec-head">
        <div>
          <h3 className="mb-shared-sec-title">{title}</h3>
          {desc && <p className="mb-rp-sec-desc">{desc}</p>}
        </div>
      </div>
      {children}
    </Card>
  )
}

interface LinePoint {
  label: string
  value: number
}

export function ReportLineChart({
  points,
  device,
  title,
  desc,
  ariaLabel,
}: {
  points: LinePoint[]
  device: DeviceMode
  title: string
  desc?: string
  ariaLabel: string
}) {
  const [bodyRef, measuredWidth] = useChartWidth()
  const [hover, setHover] = useState<number | null>(null)
  const values = points.map((point) => point.value)
  const rawMax = Math.max(...values, 1)
  const rawMin = Math.min(...values, 0)
  const headroom = (rawMax - rawMin || 1) * 0.08
  const max = rawMax + headroom
  const min = rawMin - headroom
  const span = max - min
  const axisText = [max, (max + min) / 2, min].map((value) => currencyAxisFormatter(value))
  const layout = buildChartLayout(device, measuredWidth, axisText)
  const { width: viewW, height: viewH, padL, padR, padT, padB } = layout
  const plotW = viewW - padL - padR
  const plotH = viewH - padT - padB
  const baseline = padT + plotH
  const xOf = (index: number) =>
    points.length <= 1 ? padL + plotW / 2 : padL + (plotW * index) / (points.length - 1)
  const yOf = (value: number) => padT + ((max - value) / span) * plotH
  const linePoints = points.map((point, index) => `${xOf(index)},${yOf(point.value)}`).join(' ')
  const areaPath =
    points.length > 1
      ? `M ${xOf(0)} ${baseline} L ${points.map((point, index) => `${xOf(index)} ${yOf(point.value)}`).join(' L ')} L ${xOf(points.length - 1)} ${baseline} Z`
      : ''
  const ticks = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.length === 2 ? [0, 1] : [0]
  const hovered = hover === null ? null : points[hover]
  const tooltipHalf = CHART_TOOLTIP_W / 2
  const tooltipX =
    hover === null
      ? 0
      : Math.min(Math.max(xOf(hover), padL + tooltipHalf), viewW - padR - tooltipHalf)
  const tooltipY =
    hover === null
      ? 0
      : yOf(points[hover].value) - (CHART_TOOLTIP_H + 12) < padT
        ? yOf(points[hover].value) + 14
        : yOf(points[hover].value) - (CHART_TOOLTIP_H + 12)

  return (
    <ChartCard title={title} desc={desc}>
      <div ref={bodyRef} className={device === 'mobile' ? 'mb-rp-chart-body is-mobile' : 'mb-rp-chart-body'}>
        {points.length === 0 ? (
          <ChartEmpty />
        ) : (
          <svg
            className="mb-rp-chart-svg"
            viewBox={`0 0 ${viewW} ${viewH}`}
            height={viewH}
            role="img"
            aria-label={ariaLabel}
          >
            <g className="mb-rp-chart-grid" aria-hidden="true">
              {axisText.map((label, index) => {
                const y = padT + (plotH * index) / 2
                return (
                  <g key={label + index}>
                    <line x1={padL} y1={y} x2={viewW - padR} y2={y} />
                    <text x={padL - 8} y={y + 4} textAnchor="end">
                      {label}
                    </text>
                  </g>
                )
              })}
            </g>
            {areaPath && <path className="mb-rp-chart-area" d={areaPath} aria-hidden="true" />}
            <polyline className="mb-rp-chart-line" points={linePoints} aria-hidden="true" />
            {points.map((point, index) => (
              <circle
                key={point.label + index}
                className={index === points.length - 1 ? 'mb-rp-chart-dot is-last' : 'mb-rp-chart-dot'}
                cx={xOf(index)}
                cy={yOf(point.value)}
                r={index === points.length - 1 ? 4.5 : 2.5}
                aria-hidden="true"
              />
            ))}
            {ticks.map((index) => (
              <text
                key={`tick-${index}`}
                className="mb-rp-chart-axis"
                x={xOf(index)}
                y={viewH - 6}
                textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
              >
                {points[index].label}
              </text>
            ))}
            {points.map((point, index) => (
              <rect
                key={`hit-${point.label}-${index}`}
                className="mb-rp-chart-hit"
                x={xOf(index) - plotW / Math.max(1, points.length - 1) / 2}
                y={padT}
                width={plotW / Math.max(1, points.length - 1)}
                height={plotH}
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
                aria-hidden="true"
              />
            ))}
            {hovered && (
              <g className="mb-rp-chart-tooltip" aria-hidden="true" transform={`translate(${tooltipX}, ${tooltipY})`}>
                <rect x={-tooltipHalf} y={0} width={CHART_TOOLTIP_W} height={CHART_TOOLTIP_H} rx={CHART_TOOLTIP_RX} />
                <text className="mb-rp-chart-tooltip-label" x={0} y={16} textAnchor="middle">
                  {hovered.label}
                </text>
                <text className="mb-rp-chart-tooltip-value" x={0} y={32} textAnchor="middle">
                  {currency(hovered.value)}
                </text>
              </g>
            )}
          </svg>
        )}
      </div>
    </ChartCard>
  )
}

export function ReportBarChart({
  series,
  device,
  title,
  desc,
  ariaLabel,
}: {
  series: { label: string; income: number; expense: number }[]
  device: DeviceMode
  title: string
  desc?: string
  ariaLabel: string
}) {
  const [bodyRef, measuredWidth] = useChartWidth()
  const max = Math.max(...series.flatMap((item) => [item.income, item.expense]), 1)
  const axisText = [max, max / 2, 0].map((value) => currencyAxisFormatter(value))
  const layout = buildChartLayout(device, measuredWidth, axisText)
  const { width: viewW, height: viewH, padL, padR, padT, padB } = layout
  const plotW = viewW - padL - padR
  const plotH = viewH - padT - padB
  const baseline = padT + plotH
  const slot = series.length === 0 ? plotW : plotW / series.length
  const barW = Math.max(3, Math.min(18, slot * 0.3))
  const ticks = series.length > 2 ? [0, Math.floor((series.length - 1) / 2), series.length - 1] : series.length === 2 ? [0, 1] : series.length === 1 ? [0] : []

  return (
    <ChartCard title={title} desc={desc}>
      <div className="mb-rp-chart-legend">
        <span className="mb-rp-legend-dot mb-rp-legend-dot--income" /> 收入
        <span className="mb-rp-legend-dot mb-rp-legend-dot--expense" /> 支出
      </div>
      <div ref={bodyRef} className={device === 'mobile' ? 'mb-rp-chart-body is-mobile' : 'mb-rp-chart-body'}>
        {series.length === 0 ? (
          <ChartEmpty />
        ) : (
          <svg
            className="mb-rp-chart-svg"
            viewBox={`0 0 ${viewW} ${viewH}`}
            height={viewH}
            role="img"
            aria-label={ariaLabel}
          >
            <g className="mb-rp-chart-grid" aria-hidden="true">
              {axisText.map((label, index) => {
                const y = padT + (plotH * index) / 2
                return (
                  <g key={label + index}>
                    <line x1={padL} y1={y} x2={viewW - padR} y2={y} />
                    <text x={padL - 8} y={y + 4} textAnchor="end">
                      {label}
                    </text>
                  </g>
                )
              })}
            </g>
            {series.map((item, index) => {
              const centerX = padL + slot * index + slot / 2
              const incomeH = barHeight(item.income, max, plotH)
              const expenseH = barHeight(item.expense, max, plotH)
              return (
                <g key={item.label + index} aria-hidden="true">
                  <rect
                    className="mb-rp-bar--income"
                    x={centerX - barW - 2}
                    y={baseline - incomeH}
                    width={barW}
                    height={incomeH}
                  />
                  <rect
                    className="mb-rp-bar--expense"
                    x={centerX + 2}
                    y={baseline - expenseH}
                    width={barW}
                    height={expenseH}
                  />
                </g>
              )
            })}
            {ticks.map((index) => (
              <text
                key={`tick-${index}`}
                className="mb-rp-chart-axis"
                x={padL + slot * index + slot / 2}
                y={viewH - 6}
                textAnchor={index === 0 ? 'start' : index === series.length - 1 ? 'end' : 'middle'}
              >
                {series[index].label}
              </text>
            ))}
          </svg>
        )}
      </div>
    </ChartCard>
  )
}

interface DonutSideConfig {
  title: string
  kind: DonutKind
  nodes: FlowTreeNode[]
  total: number
  emptyText: string
  colorUniverse?: readonly string[]
}

/**
 * 构成环唯一版式：一个图表框内左右两环同尺寸。收支构成与资产负债构成
 * 都走这一份，避免各写一套 ChartCard + mb-rp-compare 骨架。
 */
function DonutCompare({
  title,
  left,
  right,
  device = 'desktop',
  onOpen,
  namedCount = 6,
  note,
}: {
  title: string
  left: DonutSideConfig
  right: DonutSideConfig
  device?: DeviceMode
  onOpen?: (node: FlowTreeNode, kind: DonutKind) => void
  namedCount?: number
  note?: ReactNode
}) {
  return (
    <ChartCard title={title}>
      <div className={device === 'mobile' ? 'mb-rp-compare is-mobile' : 'mb-rp-compare'}>
        <CompositionDonutSide {...left} device={device} onOpen={onOpen} namedCount={namedCount} />
        <CompositionDonutSide {...right} device={device} onOpen={onOpen} namedCount={namedCount} />
      </div>
      {note}
    </ChartCard>
  )
}

export function CompositionBars({
  incomeTrees,
  expenseTrees,
  incomeTotal,
  expenseTotal,
  device = 'desktop',
  onOpen,
  namedCount = 6,
  colorUniverse,
}: {
  incomeTrees: FlowTreeNode[]
  expenseTrees: FlowTreeNode[]
  incomeTotal: number
  expenseTotal: number
  device?: DeviceMode
  /** 每一行都可点：打开与行金额同口径的下钻（含被并入的小类）。 */
  onOpen?: (node: FlowTreeNode, kind: DonutKind) => void
  namedCount?: number
  colorUniverse?: { income?: readonly string[]; expense?: readonly string[] }
}) {
  return (
    <DonutCompare
      title="支出 / 收入构成"
      device={device}
      onOpen={onOpen}
      namedCount={namedCount}
      // 用户要求两侧对称：支出在左、收入在右，两环同尺寸。
      left={{
        title: '支出构成',
        kind: 'expense',
        nodes: expenseTrees,
        total: expenseTotal,
        emptyText: '该期间没有支出',
        colorUniverse: colorUniverse?.expense,
      }}
      right={{
        title: '收入构成',
        kind: 'income',
        nodes: incomeTrees,
        total: incomeTotal,
        emptyText: '该期间没有收入',
        colorUniverse: colorUniverse?.income,
      }}
    />
  )
}

/** 资产负债构成：与收支同款单框双环，资产在左、负债在右。 */
export function BalanceComposition({
  assetTrees,
  liabilityTrees,
  assetTotal,
  liabilityTotal,
  device = 'desktop',
  onOpen,
  note,
}: {
  assetTrees: FlowTreeNode[]
  liabilityTrees: FlowTreeNode[]
  /** 资产环口径：仅正余额账户（与图注一致）。 */
  assetTotal: number
  liabilityTotal: number
  device?: DeviceMode
  onOpen?: (node: FlowTreeNode, kind: DonutKind) => void
  note?: ReactNode
}) {
  return (
    <DonutCompare
      title="资产 / 负债构成"
      device={device}
      onOpen={onOpen}
      left={{
        title: '资产构成',
        kind: 'asset',
        nodes: assetTrees,
        total: assetTotal,
        emptyText: '暂无正余额资产',
      }}
      right={{
        title: '负债构成',
        kind: 'liability',
        nodes: liabilityTrees,
        total: liabilityTotal,
        emptyText: '暂无负债账户',
      }}
      note={note}
    />
  )
}

/** 一侧构成：标题 + 合计 + 环形。PC 双环的两侧与移动端分段单环共用，保证同尺寸同交互。 */
export function CompositionDonutSide({
  title,
  kind,
  nodes,
  total,
  device,
  onOpen,
  emptyText,
  namedCount = 6,
  colorUniverse,
}: {
  title: string
  kind: DonutKind
  nodes: FlowTreeNode[]
  total: number
  device: DeviceMode
  onOpen?: (node: FlowTreeNode, kind: DonutKind) => void
  emptyText: string
  namedCount?: number
  colorUniverse?: readonly string[]
}) {
  return (
    <div className="mb-rp-compare-side">
      <div className="mb-rp-compare-head">
        <span className={`mb-rp-compare-title --${kind}`}>{title}</span>
        {total > 0 && (
          <span
            className="mb-rp-compare-scale"
            aria-label={`${title}合计 ${currency(total)}`}
          >
            合计 {currency(total)}
          </span>
        )}
      </div>
      <DonutChart
        nodes={nodes}
        total={total}
        device={device}
        onOpen={onOpen}
        kind={kind}
        title={title}
        emptyText={emptyText}
        namedCount={namedCount}
        colorUniverse={colorUniverse}
      />
    </div>
  )
}

export function AllocationBars({
  rows,
  showTarget = true,
}: {
  rows: { id: string; name: string; ratio: number; target: number }[]
  showTarget?: boolean
}) {
  return (
    <div className="mb-rp-allocation">
      <div className="mb-rp-flow-legend">
        <span>当前占比</span>
        {showTarget && <span>目标比例</span>}
      </div>
      {rows.map((row) => (
        <div className="mb-rp-allocation-row" key={row.id}>
          <div className="mb-rp-compare-row-head">
            <span className="mb-rp-compare-name">{row.name}</span>
            <span className="mb-rp-compare-amount">
              {showTarget ? `${row.ratio.toFixed(1)}% / ${row.target.toFixed(1)}%` : `${row.ratio.toFixed(1)}%`}
            </span>
          </div>
          <progress
            className="mb-rp-progress is-accent"
            value={Math.min(100, row.ratio)}
            max={100}
            aria-label={`${row.name}当前占比 ${row.ratio.toFixed(1)}%`}
          />
        </div>
      ))}
    </div>
  )
}

export function ChartEmpty() {
  return (
    <div className="mb-rp-chart-empty" role="img" aria-label="该期间没有可绘制的数据">
      <span className="mb-rp-chart-empty-line" aria-hidden="true" />
      <span>该期间没有可绘制的数据</span>
    </div>
  )
}
