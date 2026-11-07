import { useState } from 'react'
import { Card } from '@/features/shared/Card'
import { HfButton } from '@/features/shared/HfButton'
import type { DeviceMode } from '@/features/shared/types'
import { amountText } from './format'
import type { ExpenseCategorySlice } from './model'

const SERIES_FILL = [
  'var(--mb-chart-series-1)',
  'var(--mb-chart-series-2)',
  'var(--mb-chart-series-3)',
  'var(--mb-chart-series-4)',
  'var(--mb-chart-series-5)',
  'var(--mb-chart-series-6)',
  'var(--mb-chart-series-7)',
]

export interface ExpenseCategoryDrill {
  categoryId: string
  from: string
  to: string
}

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
 * 支出分类环形图（近 12 个月）。
 *
 * 金额直接来自后端 /analytics/category-breakdown 的一级分类聚合；
 * 占比只用于展示，不按流水重算。点击任一分类（或图例行）下钻到该分类的流水，
 * 期间与分类条件由调用方写入流水页，分类 id 使用账本的展示 id。
 * 0 元与负值分类不画弧；总额为 0 时走空态，不做除零。
 */
export function ExpenseCategoryPie({
  slices,
  range,
  device,
  onDrill,
}: {
  slices: ExpenseCategorySlice[]
  range: { from: string; to: string }
  device: DeviceMode
  onDrill?: (target: ExpenseCategoryDrill) => void
}) {
  const [legendOpen, setLegendOpen] = useState(device !== 'mobile')

  const items = slices
    .filter((slice) => slice.amount > 0)
    .map((slice, index) => {
      const color = SERIES_FILL[index % SERIES_FILL.length]
      return { slice, color }
    })
  const total = items.reduce((sum, item) => sum + item.slice.amount, 0)

  const size = device === 'mobile' ? 216 : 220
  const cx = size / 2
  const cy = size / 2
  const rOuter = size / 2 - 4
  const rInner = rOuter * 0.62
  const hitInner = Math.max(1, rInner - (device === 'mobile' ? 24 : 6))

  // 先按金额占比扣 1° 白隙；过细的块保底 1.4°，富余按占比分摊，避免相邻块重叠。
  const TOO_THIN = 1.4
  const SLICE_GAP = 1
  const shares = items.map((item) => (total > 0 ? (item.slice.amount / total) * 100 : 0))
  const rawSweeps =
    items.length === 1
      ? [360]
      : shares.map((share) => Math.max(TOO_THIN, (share / 100) * 360 - SLICE_GAP))
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
  const arcs = items.map((item, index) => {
    const sweep = fitted[index]
    const start = cursor
    cursor += sweep + (items.length === 1 ? 0 : SLICE_GAP)
    return { ...item, share: shares[index], start, sweep }
  })

  const activate = (slice: ExpenseCategorySlice) => {
    if (!onDrill || !slice.id) return
    onDrill({ categoryId: slice.id, from: range.from, to: range.to })
  }

  const aria =
    items.length === 0
      ? '近 12 个月支出分类构成：暂无支出'
      : `近 12 个月支出分类构成：${arcs
          .map((item) => `${item.slice.name} ${item.share.toFixed(1)}%`)
          .join('，')}`

  return (
    <Card className="mb-expense-pie-card">
      <div className="mb-sec-head">
        <div>
          <h2 className="mb-sec-title">支出分类</h2>
          <p className="mb-sec-desc">近 12 个月 · 点击分类查看流水</p>
        </div>
      </div>
      <div className={device === 'mobile' ? 'mb-expense-pie-body is-mobile' : 'mb-expense-pie-body'}>
        {items.length === 0 ? (
          <p className="mb-empty-inline">近 12 个月没有支出数据</p>
        ) : (
          <>
            <div className="mb-expense-pie-chart">
              <svg
                className="mb-expense-pie-svg"
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                role="img"
                aria-label={aria}
              >
                {items.length === 1 ? (
                  <g
                    className="mb-expense-pie-slice"
                    data-id={items[0].slice.id}
                    data-amount={items[0].slice.amount}
                    data-share={100}
                    role={items[0].slice.id && onDrill ? 'button' : undefined}
                    tabIndex={items[0].slice.id && onDrill ? 0 : undefined}
                    aria-label={
                      items[0].slice.id && onDrill ? `查看「${items[0].slice.name}」的流水` : undefined
                    }
                    onClick={() => activate(items[0].slice)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        activate(items[0].slice)
                      }
                    }}
                    style={{ cursor: items[0].slice.id && onDrill ? 'pointer' : 'default' }}
                  >
                    <path
                      className="mb-expense-pie-arc"
                      d={donutArc(cx, cy, rOuter, rInner, -90, 356)}
                      style={{ fill: items[0].color }}
                    />
                    <path
                      className="mb-expense-pie-hit"
                      d={donutArc(cx, cy, rOuter, hitInner, -90, 356)}
                      fill="transparent"
                      aria-hidden="true"
                    />
                    <text className="mb-expense-pie-center-label" x={cx} y={cy - 4} textAnchor="middle">
                      支出 · 仅 1 类
                    </text>
                    <text className="mb-expense-pie-center-value" x={cx} y={cy + 16} textAnchor="middle">
                      {amountText(total)}
                    </text>
                  </g>
                ) : (
                  <>
                    {arcs.map((item) => {
                      const canDrill = Boolean(item.slice.id && onDrill)
                      return (
                        <g
                          key={`${item.slice.id}-${item.start}`}
                          className="mb-expense-pie-slice"
                          data-id={item.slice.id}
                          data-amount={item.slice.amount}
                          data-share={item.share}
                          role={canDrill ? 'button' : undefined}
                          tabIndex={canDrill ? 0 : undefined}
                          aria-label={canDrill ? `查看「${item.slice.name}」的流水` : undefined}
                          onClick={() => activate(item.slice)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              activate(item.slice)
                            }
                          }}
                          style={{ cursor: canDrill ? 'pointer' : 'default' }}
                        >
                          <path
                            className="mb-expense-pie-arc"
                            d={donutArc(cx, cy, rOuter, rInner, item.start, item.sweep)}
                            style={{ fill: item.color }}
                          />
                          <path
                            className="mb-expense-pie-hit"
                            d={donutArc(cx, cy, rOuter, hitInner, item.start, item.sweep)}
                            fill="transparent"
                            aria-hidden="true"
                          />
                        </g>
                      )
                    })}
                    <text className="mb-expense-pie-center-label" x={cx} y={cy - 4} textAnchor="middle">
                      支出分类
                    </text>
                    <text className="mb-expense-pie-center-value" x={cx} y={cy + 16} textAnchor="middle">
                      {amountText(total)}
                    </text>
                  </>
                )}
              </svg>
            </div>
            <div className="mb-expense-pie-side">
              <HfButton
                className="mb-expense-pie-legend-toggle"
                aria-expanded={legendOpen}
                onClick={() => setLegendOpen((open) => !open)}
              >
                {legendOpen ? '收起图例' : `展开图例 · ${items.length} 类`}
              </HfButton>
              {legendOpen && (
                <div className="mb-expense-pie-legend">
                  {arcs.map((item) => {
                    const canDrill = Boolean(item.slice.id && onDrill)
                    return (
                      <HfButton
                        key={item.slice.id || item.slice.name}
                        className="mb-expense-pie-row"
                        aria-label={`查看「${item.slice.name}」的流水`}
                        disabled={!canDrill}
                        onClick={() => activate(item.slice)}
                      >
                        <span
                          className="mb-expense-pie-swatch"
                          style={{ background: item.color }}
                          aria-hidden="true"
                        />
                        <span className="mb-expense-pie-name">{item.slice.name}</span>
                        <span className="mb-expense-pie-share">{item.share.toFixed(1)}%</span>
                        <span className="mb-expense-pie-amount">{amountText(item.slice.amount)}</span>
                      </HfButton>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
