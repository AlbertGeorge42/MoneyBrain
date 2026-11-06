/**
 * 报表图表基元（HF 批次 3）
 *
 * 1:1 单位 viewBox + 高度单一来源都来自 features/shared/chartLayout：
 * SVG 的 height 属性取 CHART_HEIGHT，宽度取容器实测宽度，字号与线宽不被缩放。
 * 报表页四个视图共用这里的折线 / 柱状 / 构成条 / 流向条，不复制第二套几何。
 */
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
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
  device = 'desktop',
  onOpen,
}: {
  incomeTrees: FlowTreeNode[]
  expenseTrees: FlowTreeNode[]
  incomeTotal: number
  expenseTotal: number
  device?: DeviceMode
  /** 每一行都可点：打开与行金额同口径的下钻（含被并入的小类）。 */
  onOpen?: (node: FlowTreeNode, kind: 'income' | 'expense') => void
}) {
  return (
    <ChartCard title="收入 / 支出构成">
      <div className={device === 'mobile' ? 'mb-rp-compare is-mobile' : 'mb-rp-compare'}>
        <CompositionSide
          title="收入构成"
          nodes={incomeTrees}
          total={incomeTotal}
          tone="income"
          onOpen={onOpen}
        />
        <div className="mb-rp-compare-side">
          <div className="mb-rp-compare-head">
            <span className="mb-rp-compare-title is-expense">支出构成</span>
            {expenseTotal > 0 && (
              <span
                className="mb-rp-compare-scale"
                aria-label={`支出构成合计 ${currency(expenseTotal)}`}
              >
                合计 {currency(expenseTotal)}
              </span>
            )}
          </div>
          <DonutChart
            nodes={expenseTrees}
            total={expenseTotal}
            device={device}
            onOpen={onOpen}
            title="支出构成"
            emptyText="该期间没有支出"
          />
        </div>
      </div>
    </ChartCard>
  )
}

/** 合并尾部小类：keep 个具名根分类 + 1 个「其余 N 类」，最多 keep + 1 个切块。 */
function mergeTail(nodes: FlowTreeNode[], keep: number): FlowTreeNode[] {
  if (nodes.length <= keep) return nodes
  const visible = nodes.slice(0, keep)
  const rest = nodes.slice(keep)
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

/** 横条保留旧口径：5 个具名 + 1 个「其余」，共 6 行。 */
function topNodes(nodes: FlowTreeNode[], limit: number): FlowTreeNode[] {
  return mergeTail(nodes, limit - 1)
}

const SERIES_FILL = [
  'var(--mb-chart-series-1)',
  'var(--mb-chart-series-2)',
  'var(--mb-chart-series-3)',
  'var(--mb-chart-series-4)',
  'var(--mb-chart-series-5)',
  'var(--mb-chart-series-6)',
  'var(--mb-chart-series-7)',
]

function donutArc(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  start: number,
  sweep: number,
): string {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const outerStart = [cx + rOuter * Math.cos(toRad(start)), cy + rOuter * Math.sin(toRad(start))]
  const outerEnd = [cx + rOuter * Math.cos(toRad(start + sweep)), cy + rOuter * Math.sin(toRad(start + sweep))]
  const innerEnd = [cx + rInner * Math.cos(toRad(start + sweep)), cy + rInner * Math.sin(toRad(start + sweep))]
  const innerStart = [cx + rInner * Math.cos(toRad(start)), cy + rInner * Math.sin(toRad(start))]
  const large = sweep > 180 ? 1 : 0
  return `M ${outerStart[0]} ${outerStart[1]} A ${rOuter} ${rOuter} 0 ${large} 1 ${outerEnd[0]} ${outerEnd[1]} L ${innerEnd[0]} ${innerEnd[1]} A ${rInner} ${rInner} 0 ${large} 0 ${innerStart[0]} ${innerStart[1]} Z`
}

function donutRing(cx: number, cy: number, rOuter: number, rInner: number): string {
  return `M ${cx - rOuter} ${cy} A ${rOuter} ${rOuter} 0 0 1 ${cx + rOuter} ${cy} A ${rOuter} ${rOuter} 0 0 1 ${cx - rOuter} ${cy} L ${cx - rInner} ${cy} A ${rInner} ${rInner} 0 0 0 ${cx + rInner} ${cy} A ${rInner} ${rInner} 0 0 0 ${cx - rInner} ${cy} Z`
}

/**
 * 支出构成环形：纯 SVG，面积按金额占比；一级根分类 Top 6 + 「其余 N 类」，
 * 第 8 类起并入「其余」。「其余」块叠 45° 斜纹并保留文字图例，不靠颜色单独编码。
 * 空态不画环；单条数据画完整环、中心 100%。切块与图例行都可下钻。
 */
export function DonutChart({
  nodes,
  total,
  device = 'desktop',
  onOpen,
  kind = 'expense',
  title,
  emptyText,
}: {
  nodes: FlowTreeNode[]
  total: number
  device?: DeviceMode
  onOpen?: (node: FlowTreeNode, kind: 'income' | 'expense') => void
  kind?: 'income' | 'expense'
  title: string
  emptyText: string
}) {
  const [bodyRef, measuredWidth] = useChartWidth()
  const rawPatternId = useId()
  const patternId = `mb-donut-${rawPatternId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  // 只取一级根分类；0 金额分类不进环。
  const visible = mergeTail(
    nodes.filter((node) => node.level === 0 && node.amount > 0),
    6,
  )
  const amountSum = visible.reduce((sum, node) => sum + node.amount, 0)
  const denom = amountSum > 0 ? amountSum : total
  const items = visible.map((node, index) => ({
    node,
    color: SERIES_FILL[index % SERIES_FILL.length],
    share: denom > 0 ? (node.amount / denom) * 100 : 0,
  }))
  const cap = device === 'mobile' ? 232 : 260
  const size = Math.max(140, Math.min(cap, measuredWidth || (device === 'mobile' ? cap : 200)))
  const cx = size / 2
  const cy = size / 2
  const rOuter = size / 2 - 6
  const thickness = device === 'mobile' ? 20 : 24
  const rInner = Math.max(8, rOuter - thickness)
  let cursor = -90
  const slices = items.map((item) => {
    const raw = (item.share / 100) * 360
    // 切块间留 1°，最细的块保底 1.4°——<2° 的块只靠图例读数。
    const sweep = items.length === 1 ? 360 : Math.max(1.4, raw - 1)
    const start = cursor
    cursor += raw
    return { ...item, start, sweep, rest: item.node.id === 'rest' }
  })
  const isSingle = items.length === 1
  const aria = `${title}：${items.map((item) => `${item.node.name} ${item.share.toFixed(1)}%`).join('，')}`

  return (
    <div ref={bodyRef} className={device === 'mobile' ? 'mb-rp-donut is-mobile' : 'mb-rp-donut'}>
      {items.length === 0 ? (
        <p className="mb-rp-empty-line">{emptyText}</p>
      ) : (
        <>
          <div className="mb-rp-donut-chart">
            <svg
              className="mb-rp-donut-svg"
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              role="img"
              aria-label={aria}
            >
              <defs>
                <pattern
                  id={patternId}
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="6"
                    stroke="rgba(255,255,255,0.62)"
                    strokeWidth="2"
                  />
                </pattern>
              </defs>
              {isSingle ? (
                <g
                  className="mb-rp-donut-slice"
                  data-id={items[0].node.id}
                  data-amount={items[0].node.amount}
                  data-share={items[0].share}
                  onClick={() => onOpen?.(items[0].node, kind)}
                >
                  <path className="mb-rp-donut-arc" d={donutRing(cx, cy, rOuter, rInner)} fill={items[0].color} />
                  {device === 'mobile' && (
                    <path
                      className="mb-rp-donut-hit"
                      d={donutRing(cx, cy, rOuter, Math.max(1, rInner - 24))}
                      fill="transparent"
                      aria-hidden="true"
                    />
                  )}
                </g>
              ) : (
                slices.map((slice) => (
                  <g
                    key={slice.node.id}
                    className="mb-rp-donut-slice"
                    data-id={slice.node.id}
                    data-amount={slice.node.amount}
                    data-share={slice.share}
                    data-sweep={slice.sweep}
                    onClick={() => onOpen?.(slice.node, kind)}
                  >
                    <path
                      className={slice.rest ? 'mb-rp-donut-arc is-rest' : 'mb-rp-donut-arc'}
                      d={donutArc(cx, cy, rOuter, rInner, slice.start, slice.sweep)}
                      fill={slice.color}
                    />
                    {slice.rest && (
                      <path
                        className="mb-rp-donut-rest"
                        d={donutArc(cx, cy, rOuter, rInner, slice.start, slice.sweep)}
                        fill={`url(#${patternId})`}
                        aria-hidden="true"
                      />
                    )}
                    {device === 'mobile' && (
                      <path
                        className="mb-rp-donut-hit"
                        d={donutArc(cx, cy, rOuter, Math.max(1, rInner - 24), slice.start, slice.sweep)}
                        fill="transparent"
                        aria-hidden="true"
                      />
                    )}
                  </g>
                ))
              )}
              <text className="mb-rp-donut-center-label" x={cx} y={cy - 2} textAnchor="middle">
                {isSingle ? '100%' : '合计'}
              </text>
              <text className="mb-rp-donut-center-value" x={cx} y={cy + 17} textAnchor="middle">
                {currency(denom)}
              </text>
            </svg>
          </div>
          <div className="mb-rp-donut-legend">
            {slices.map((slice) => (
              <button
                type="button"
                key={slice.node.id}
                className="mb-rp-compare-row is-interactive mb-rp-donut-legend-row"
                aria-label={`查看 ${slice.node.name} ${currency(slice.node.amount)} 的下钻`}
                onClick={() => onOpen?.(slice.node, kind)}
              >
                <span className="mb-rp-compare-row-head">
                  <span className="mb-rp-compare-name">
                    <span
                      className={slice.rest ? 'mb-rp-donut-swatch is-rest' : 'mb-rp-donut-swatch'}
                      style={{
                        background: slice.color,
                        backgroundImage: slice.rest
                          ? 'repeating-linear-gradient(45deg, transparent 0 2px, rgba(255,255,255,0.62) 2px 3px)'
                          : undefined,
                      }}
                      aria-hidden="true"
                    />
                    {slice.node.name}
                  </span>
                  <span className="mb-rp-donut-meta">
                    <span className="mb-rp-compare-amount">{currency(slice.node.amount)}</span>
                    <span className="mb-rp-donut-pct">{slice.share.toFixed(1)}%</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
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
              className={`mb-rp-progress is-series-${(index % 7) + 1}`}
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
