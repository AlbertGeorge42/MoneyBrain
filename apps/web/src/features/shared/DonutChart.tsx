/**
 * 构成环（唯一实现）：总览支出分类环与报表收支 / 资产负债构成环共用这一份。
 *
 * 纯 SVG，面积按金额占比；一级根分类 Top 6 + 「其余 N 类」，第 7 类起并入「其余」。
 * 「其余」块叠 45° 斜纹并保留文字图例，不靠颜色单独编码。
 * 空态不画环；单条数据画 356° 弧 +「仅 1 类」，不把 360° 满环当成正常构成。
 * 一级类别有子分类时点进二级环（最多 5 个具名 + 其余）；叶子类别直接下钻到流水。
 * 面包屑与 Esc 回到一级；二级环不再有第三级。
 *
 * 金额与分类树都从调用方传入：总览用 category-breakdown 的扁平切片适配成树，
 * 报表用 report 的分类树。环不认识「流水 / 账户」等概念，只消费 id / name / amount。
 */
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { minor } from '@domain/index'
import { formatCurrency } from '@/utils/format'
import { Button } from './Button'
import { SERIES_COLORS, stableSlotMap } from './seriesColor'
import type { DeviceMode } from './types'
import './donut.css'

/** 环的一棵节点：id 为展示 id，children 非空表示可下钻到二级环。 */
export interface DonutNode {
  id: string
  name: string
  amount: number
  count: number
  share: number
  level: 0 | 1
  children: DonutNode[]
  mergedIds?: string[]
}

export type DonutKind = 'income' | 'expense' | 'asset' | 'liability'

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

/** 合并尾部小类：金额最大的 keep 个具名分类 + 1 个「其余 N 类」，最多 keep + 1 个切块。 */
function mergeTail(nodes: DonutNode[], keep: number): DonutNode[] {
  // 必须先按金额降序再切：报表树是后端拖拽顺序，直接 slice 会把排靠后的大分类
  // 误并进「其余」，让其余切块虚高。取色按分类身份哈希、与这里顺序无关，不会跳色。
  const sorted = [...nodes].sort((left, right) => right.amount - left.amount)
  if (sorted.length <= keep) return sorted
  const visible = sorted.slice(0, keep)
  const rest = sorted.slice(keep)
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

/** 「其余 N 类」优先用第 7 槽（索引 6）的中性灰；该槽被具名分类占用时，退到本图未用的槽。 */
const REST_SLOT = 6

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

/**
 * 二级环配色：父色只作锚点，子级明度阶梯整段不含 100%（任一子级都不等于父色）。
 * 浅色向深调（90%→40%），暗色向浅调（84%→32%）；只有 1 个子类时取阶梯中点。
 */
function subFill(parentColor: string, index: number, count: number): string {
  const fraction = count <= 1 ? 0.5 : index / (count - 1)
  return `color-mix(in srgb, ${parentColor} calc(var(--mb-chart-sub-from) + (var(--mb-chart-sub-to) - var(--mb-chart-sub-from)) * ${fraction.toFixed(4)}), var(--mb-chart-sub-tint))`
}

const currency = (value: number) => formatCurrency(minor(value))

export function DonutChart({
  nodes,
  total,
  device = 'desktop',
  onOpen,
  kind = 'expense',
  title,
  emptyText,
  namedCount = 6,
  colorUniverse,
}: {
  nodes: DonutNode[]
  total: number
  device?: DeviceMode
  onOpen?: (node: DonutNode, kind: DonutKind) => void
  kind?: DonutKind
  title: string
  emptyText: string
  /** 一级具名类别上限（固定 6）；其余并入「其余 N 类」。 */
  namedCount?: number
  /** 全账本分类名；同一分类在总览/报表共用槽位，月份切换不改色。 */
  colorUniverse?: readonly string[]
}) {
  const [bodyRef, measuredWidth] = useChartWidth()
  const [drillId, setDrillId] = useState<string | null>(null)
  const rawPatternId = useId()
  const patternId = `mb-donut-${rawPatternId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  // 只取一级根分类；0 金额分类不进环。
  const roots = mergeTail(
    nodes.filter((node) => node.level === 0 && node.amount > 0),
    namedCount,
  )
  const drilled = drillId ? roots.find((node) => node.id === drillId) ?? null : null
  const subChildren = drilled
    ? drilled.children.filter((child) => child.level === 1 && child.amount > 0)
    : []
  const isDrilled = Boolean(drilled && subChildren.length > 0)
  const levelNodes = isDrilled ? mergeTail(subChildren, 5) : roots
  const rootIndex = drilled ? roots.findIndex((node) => node.id === drilled.id) : -1
  // 一级具名分类按分类名取色，金额排序不参与；「其余 N 类」优先占中性槽。
  const rootSlots = stableSlotMap(
    [
      ...(colorUniverse ?? []),
      ...roots.filter((node) => node.id !== 'rest').map((node) => node.name.trim()),
    ],
    SERIES_COLORS.length,
  )
  const usedSlots = new Set(rootSlots.values())
  const restSlot = usedSlots.has(REST_SLOT)
    ? [...SERIES_COLORS.keys()].find((slot) => !usedSlots.has(slot)) ?? REST_SLOT
    : REST_SLOT
  const rootColorOf = (node: DonutNode) =>
    SERIES_COLORS[node.id === 'rest' ? restSlot : rootSlots.get(node.name.trim()) ?? restSlot]
  const parentColor = drilled ? rootColorOf(drilled) : SERIES_COLORS[REST_SLOT]
  const amountSum = levelNodes.reduce((sum, node) => sum + node.amount, 0)
  const denom = amountSum > 0 ? amountSum : drilled?.amount ?? total
  const items = levelNodes.map((node, index) => ({
    node,
    color: isDrilled ? subFill(parentColor, index, levelNodes.length) : rootColorOf(node),
    share: denom > 0 ? (node.amount / denom) * 100 : 0,
    rest: node.id === 'rest',
  }))
  // 一级类别：有子分类进二级环；叶子与「其余 N 类」直接下钻到流水。
  const activate = (node: DonutNode) => {
    if (!isDrilled && node.id !== 'rest') {
      const children = node.children.filter((child) => child.level === 1 && child.amount > 0)
      if (children.length > 0) {
        setDrillId(node.id)
        return
      }
    }
    onOpen?.(node, kind)
  }
  useEffect(() => {
    if (!isDrilled) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setDrillId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isDrilled])
  const cap = device === 'mobile' ? 232 : 260
  const size = Math.max(140, Math.min(cap, measuredWidth || (device === 'mobile' ? cap : 200)))
  const cx = size / 2
  const cy = size / 2
  const rOuter = size / 2 - 6
  const thickness = device === 'mobile' ? 20 : 24
  const rInner = Math.max(8, rOuter - thickness)
  /** 命中层：桌面也必须有（弧本身 pointer-events:none），移动向内加厚到 44 触控带。 */
  const hitInner = Math.max(1, rInner - (device === 'mobile' ? 24 : 6))
  const hitBand = device === 'mobile' ? 44 : 30
  // 切块角：先按金额占比扣 1° 白隙；<2° 的块保底 1.4°。保底增量不是从最大块扣，
  // 而是按各块富余（sweep − 1.4°）占比分摊（富余为 0 的块不扣），保证总角 ≤ 360 − 白隙，
  // 最细的块不会压到相邻块（含 270° 处的首块）。
  const TOO_THIN = 1.4
  const SLICE_GAP = 1
  const rawSweeps =
    items.length === 1
      ? [360]
      : items.map((item) => Math.max(TOO_THIN, (item.share / 100) * 360 - SLICE_GAP))
  const budget = 360 - items.length * SLICE_GAP
  const rawTotal = rawSweeps.reduce((sum, sweep) => sum + sweep, 0)
  const deficit = Math.max(0, rawTotal - budget)
  const slack = rawSweeps.map((sweep) => Math.max(0, sweep - TOO_THIN))
  const slackTotal = slack.reduce((sum, value) => sum + value, 0)
  const fitted =
    deficit > 0 && slackTotal > 0
      ? rawSweeps.map((sweep, index) => sweep - deficit * (slack[index] / slackTotal))
      : rawSweeps
  let cursor = -90
  const slices = items.map((item, index) => {
    const sweep = fitted[index]
    const start = cursor
    cursor += sweep + (items.length === 1 ? 0 : SLICE_GAP)
    return { ...item, start, sweep }
  })
  const isSingle = items.length === 1
  const sideLabel =
    kind === 'income' ? '收入' : kind === 'asset' ? '资产' : kind === 'liability' ? '负债' : '支出'
  const centerLabel = isDrilled && drilled
    ? drilled.name
    : isSingle
      ? `${sideLabel} · 仅 1 类`
      : sideLabel
  const centerValue = currency(isDrilled && drilled ? drilled.amount : denom)
  const aria = `${isDrilled && drilled ? `${drilled.name}构成` : title}：${items.map((item) => `${item.node.name} ${item.share.toFixed(1)}%`).join('，')}`

  return (
    <div
      ref={bodyRef}
      className={device === 'mobile' ? 'mb-rp-donut is-mobile' : 'mb-rp-donut'}
      data-view={isDrilled ? 'sub' : 'root'}
    >
      {items.length === 0 ? (
        <p className="mb-rp-donut-empty">{emptyText}</p>
      ) : (
        <>
          {/* 面包屑槽位常驻：任一侧下钻时，两侧环形顶部仍对齐。 */}
          <div className="mb-rp-donut-crumb">
            {isDrilled && drilled && (
              <>
                <Button
                  className="mb-rp-donut-back"
                  onClick={() => setDrillId(null)}
                  aria-label={`返回${title}一级`}
                >
                  <span aria-hidden="true">‹</span> 返回一级
                </Button>
                <span className="mb-rp-donut-crumb-name">{drilled.name}</span>
              </>
            )}
          </div>
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
                  patternTransform="rotate(-45)"
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
                  data-view={isDrilled ? 'sub' : 'root'}
                  data-sub-step={isDrilled ? 0 : undefined}
                  data-sub-parent={isDrilled ? rootIndex : undefined}
                  data-start={-90}
                  data-sweep={356}
                  onClick={() => activate(items[0].node)}
                >
                  <path
                    className="mb-rp-donut-arc"
                    d={donutArc(cx, cy, rOuter, rInner, -90, 356)}
                    style={{ fill: items[0].color }}
                  />
                  <path
                    className="mb-rp-donut-hit"
                    d={donutArc(cx, cy, rOuter, hitInner, -90, 356)}
                    fill="transparent"
                    data-hit={hitBand}
                    aria-hidden="true"
                  />
                </g>
              ) : (
                slices.map((slice, index) => (
                  <g
                    key={slice.node.id}
                    className="mb-rp-donut-slice"
                    data-id={slice.node.id}
                    data-amount={slice.node.amount}
                    data-share={slice.share}
                    data-sweep={slice.sweep}
                    data-start={slice.start}
                    data-view={isDrilled ? 'sub' : 'root'}
                    data-sub-step={isDrilled ? index : undefined}
                    data-sub-parent={isDrilled ? rootIndex : undefined}
                    onClick={() => activate(slice.node)}
                  >
                    <path
                      className={slice.rest ? 'mb-rp-donut-arc is-rest' : 'mb-rp-donut-arc'}
                      d={donutArc(cx, cy, rOuter, rInner, slice.start, slice.sweep)}
                      style={{ fill: slice.color }}
                    />
                    {slice.rest && (
                      <path
                        className="mb-rp-donut-rest"
                        d={donutArc(cx, cy, rOuter, rInner, slice.start, slice.sweep)}
                        fill={`url(#${patternId})`}
                        aria-hidden="true"
                      />
                    )}
                    <path
                      className="mb-rp-donut-hit"
                      d={donutArc(cx, cy, rOuter, hitInner, slice.start, slice.sweep)}
                      fill="transparent"
                      data-hit={hitBand}
                      aria-hidden="true"
                    />
                  </g>
                ))
              )}
              <text className="mb-rp-donut-center-label" x={cx} y={cy - 2} textAnchor="middle">
                {centerLabel}
              </text>
              <text className="mb-rp-donut-center-value" x={cx} y={cy + 17} textAnchor="middle">
                {centerValue}
              </text>
            </svg>
          </div>
          <div className="mb-rp-donut-legend">
            {slices.map((slice) => (
              <Button
                key={slice.node.id}
                className="mb-rp-compare-row is-interactive mb-rp-donut-legend-row"
                aria-label={`查看 ${slice.node.name} ${currency(slice.node.amount)} 的下钻`}
                onClick={() => activate(slice.node)}
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
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
