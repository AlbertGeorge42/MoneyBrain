/**
 * 报表图表基元（HF 批次 3）
 *
 * 1:1 单位 viewBox + 高度单一来源都来自 features/shared/chartLayout：
 * SVG 的 height 属性取 CHART_HEIGHT，宽度取容器实测宽度，字号与线宽不被缩放。
 * 报表页四个视图共用这里的折线 / 柱状 / 构成条 / 流向条，不复制第二套几何。
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { currencyAxisFormatter } from '@/utils/format'
import type { DeviceMode } from '@/features/shared/types'
import {
  CHART_TOOLTIP_H,
  CHART_TOOLTIP_RX,
  CHART_TOOLTIP_W,
  buildChartLayout,
} from '@/features/shared/chartLayout'
import { currency } from './reportsModel'
import type { FlowTreeNode } from './reportsModel'

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
    <section className={className ? `mb-rp-card mb-rp-chart-card ${className}` : 'mb-rp-card mb-rp-chart-card'}>
      <div className="mb-rp-sec-head">
        <div>
          <h3 className="mb-rp-sec-title">{title}</h3>
          {desc && <p className="mb-rp-sec-desc">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
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
        <span className="mb-rp-legend-dot is-income" /> 收入
        <span className="mb-rp-legend-dot is-expense" /> 支出
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
              const incomeH = (item.income / max) * plotH
              const expenseH = (item.expense / max) * plotH
              return (
                <g key={item.label + index} aria-hidden="true">
                  <rect
                    className="mb-rp-bar is-income"
                    x={centerX - barW - 2}
                    y={baseline - incomeH}
                    width={barW}
                    height={incomeH}
                  />
                  <rect
                    className="mb-rp-bar is-expense"
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

export function CompositionBars({
  incomeTrees,
  expenseTrees,
  incomeTotal,
  expenseTotal,
  onOpen,
}: {
  incomeTrees: FlowTreeNode[]
  expenseTrees: FlowTreeNode[]
  incomeTotal: number
  expenseTotal: number
  /** 每一行都可点：打开与行金额同口径的下钻（含被并入的小类）。 */
  onOpen?: (node: FlowTreeNode, kind: 'income' | 'expense') => void
}) {
  return (
    <ChartCard title="收入 / 支出构成">
      <div className="mb-rp-compare">
        <CompositionSide
          title="收入构成"
          nodes={incomeTrees}
          total={incomeTotal}
          tone="income"
          onOpen={onOpen}
        />
        <CompositionSide
          title="支出构成"
          nodes={expenseTrees}
          total={expenseTotal}
          tone="expense"
          onOpen={onOpen}
        />
      </div>
    </ChartCard>
  )
}

function topNodes(nodes: FlowTreeNode[], limit: number): FlowTreeNode[] {
  if (nodes.length <= limit) return nodes
  const visible = nodes.slice(0, limit - 1)
  const rest = nodes.slice(limit - 1)
  const amount = rest.reduce((sum, node) => sum + node.amount, 0)
  const count = rest.reduce((sum, node) => sum + node.count, 0)
  return [
    ...visible,
    {
      id: 'rest',
      // 与根分类「其他」区分：这里的金额是多个小类之和，不是同名分类本身。
      name: `其余 ${rest.length} 类`,
      amount,
      count,
      share: visible.length ? 100 - visible.reduce((sum, node) => sum + node.share, 0) : 100,
      level: 0,
      // 与下钻同口径：被并入的根分类原样带过去，点开金额一致。
      children: rest.map((node) => ({ ...node, level: 1 as const, children: [] })),
      mergedIds: rest.map((node) => node.id),
    },
  ]
}

function CompositionSide({
  title,
  nodes,
  total,
  tone,
  onOpen,
}: {
  title: string
  nodes: FlowTreeNode[]
  total: number
  tone: 'income' | 'expense'
  onOpen?: (node: FlowTreeNode, kind: 'income' | 'expense') => void
}) {
  const visible = topNodes(nodes, 6)
  const max = Math.max(...visible.map((node) => node.amount), 1)
  return (
    <div className="mb-rp-compare-side">
      <div className="mb-rp-compare-head">
        <span className={`mb-rp-compare-title is-${tone}`}>{title}</span>
        {visible.length > 0 && (
          <span
            className="mb-rp-compare-scale"
            aria-label={`${title}满格 ${currencyAxisFormatter(max)}，本侧合计 ${currency(total)}`}
          >
            满格 {currencyAxisFormatter(max)}
          </span>
        )}
      </div>
      {visible.length === 0 ? (
        <p className="mb-rp-empty-line">该期间没有{title.slice(0, 2)}</p>
      ) : (
        visible.map((node, index) => (
          <button
            type="button"
            className="mb-rp-compare-row is-interactive"
            key={node.id}
            aria-label={`查看 ${node.name} ${currency(node.amount)} 的下钻`}
            onClick={() => onOpen?.(node, tone)}
          >
            <div className="mb-rp-compare-row-head">
              <span className="mb-rp-compare-name">{node.name}</span>
              <span className="mb-rp-compare-amount">{currency(node.amount)}</span>
            </div>
            <progress
              className={`mb-rp-progress is-${tone} is-cat-${(index % 6) + 1}`}
              value={(node.amount / max) * 100}
              max={100}
              aria-label={`${node.name}占${title}的 ${node.share.toFixed(1)}%`}
            />
          </button>
        ))
      )}
    </div>
  )
}

export function CashFlowBars({
  inflowGroups,
  outflowGroups,
  inflowTotal,
  outflowTotal,
}: {
  inflowGroups: { name: string; total: number }[]
  outflowGroups: { name: string; total: number }[]
  inflowTotal: number
  outflowTotal: number
}) {
  const names = ['经营', '投资', '筹资', '未分类', '账户间转账'].filter(
    (name) =>
      inflowGroups.some((group) => group.name === name) ||
      outflowGroups.some((group) => group.name === name),
  )
  const max = Math.max(
    ...inflowGroups.map((group) => group.total),
    ...outflowGroups.map((group) => group.total),
    1,
  )
  return (
    <ChartCard title="资金流向">
      <div className="mb-rp-flow-legend">
        <span>流出 {currency(outflowTotal)}</span>
        <span>流入 {currency(inflowTotal)}</span>
      </div>
      {names.length === 0 ? (
        <p className="mb-rp-empty-line">该期间没有现金流</p>
      ) : (
        names.map((name) => {
          const out = outflowGroups.find((group) => group.name === name)?.total ?? 0
          const incoming = inflowGroups.find((group) => group.name === name)?.total ?? 0
          return (
            <div className="mb-rp-flow-row" key={name}>
              <div className="mb-rp-flow-left">
                <progress
                  className="mb-rp-flow-progress is-out"
                  value={(out / max) * 100}
                  max={100}
                  aria-label={`${name}流出 ${currency(out)}`}
                />
              </div>
              <span className="mb-rp-flow-name">{name}</span>
              <div className="mb-rp-flow-right">
                <progress
                  className="mb-rp-flow-progress is-in"
                  value={(incoming / max) * 100}
                  max={100}
                  aria-label={`${name}流入 ${currency(incoming)}`}
                />
              </div>
            </div>
          )
        })
      )}
    </ChartCard>
  )
}

export function AllocationBars({
  rows,
}: {
  rows: { id: string; name: string; ratio: number; target: number }[]
}) {
  return (
    <div className="mb-rp-allocation">
      <div className="mb-rp-flow-legend">
        <span>当前占比</span>
        <span>目标比例</span>
      </div>
      {rows.map((row) => (
        <div className="mb-rp-allocation-row" key={row.id}>
          <div className="mb-rp-compare-row-head">
            <span className="mb-rp-compare-name">{row.name}</span>
            <span className="mb-rp-compare-amount">
              {row.ratio.toFixed(1)}% / {row.target.toFixed(1)}%
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
