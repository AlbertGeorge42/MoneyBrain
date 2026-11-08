/**
 * 现金流未来视图（报表未来时间轴 P4）
 *
 * 逐桶柱 + 期末现金线：柱高直接取后端 inflow / outflow 的合计字段，现金线取 endCash；
 * 前端不做任何跨桶或跨段金额相加。asOf 左侧为已发生桶、右侧为预测桶，
 * 混合区间在 asOf 处画竖线分段，不显示跨段合计。
 */
import { useState } from 'react'
import type { CashFlowProjectionResult } from '@/services/api'
import { currencyAxisFormatter } from '@/utils/format'
import { Card } from '@/features/shared/Card'
import { HfSheet } from '@/features/shared/HfSheet'
import type { DeviceMode } from '@/features/shared/types'
import { ChartCard } from './charts'
import { MetricStrip, ReportTable, type ReportColumn, type ReportRow } from './ReportTable'
import { cashBreakdown, cashSplit, coveredNote } from './futureModel'
import { dayDiff, GRANULARITY_LABELS } from './reportsTime'
import {
  PredictionAsOfLine,
  PredictionBreakdown,
  PredictionLegend,
  PredictionTextureDefs,
  PredictionTextureLegend,
} from './prediction'
import { currency, type ReportMetric } from './reportsModel'

const PLOT = { left: 72, right: 676, top: 28, bottom: 246 }

type FlowValue = CashFlowProjectionResult['points'][number]['inflow']

/**
 * 逐桶柱：整体高度取后端 total，来源只叠纹理不改颜色——
 * 已发生为语义底色实心，预算计划叠 45° 斜纹，已排定叠点纹。
 * 段高只用后端分项与 total 的比例做几何换算，前端不做金额相加。
 */
function CashBar({
  flow,
  kind,
  x,
  width,
  yOf,
}: {
  flow: FlowValue
  kind: 'inflow' | 'outflow'
  x: number
  width: number
  yOf: (value: number) => number
}) {
  if (flow.total <= 0) return null
  const top = yOf(flow.total)
  const full = PLOT.bottom - top
  const actualHeight = full * (flow.actual / flow.total)
  const plannedHeight = Math.min(full - actualHeight, full * (flow.planned / flow.total))
  const committedHeight = Math.min(
    full - actualHeight - plannedHeight,
    full * (flow.committed / flow.total),
  )
  const plannedY = PLOT.bottom - actualHeight - plannedHeight
  const committedY = plannedY - committedHeight

  return (
    <g>
      <rect
        className={`mb-rp-predict-bar is-${kind}`}
        x={x}
        y={top}
        width={width}
        height={full}
        rx={1.5}
      />
      {plannedHeight > 0 && (
        <rect
          className="mb-rp-predict-texture"
          x={x}
          y={plannedY}
          width={width}
          height={plannedHeight}
          fill="url(#mb-rp-planned-hatch)"
        />
      )}
      {committedHeight > 0 && (
        <rect
          className="mb-rp-predict-texture"
          x={x}
          y={committedY}
          width={width}
          height={committedHeight}
          fill="url(#mb-rp-committed-dots)"
        />
      )}
      <rect
        className="mb-rp-predict-outline"
        x={x}
        y={top}
        width={width}
        height={full}
        rx={1.5}
      />
    </g>
  )
}

export function FutureCashView({
  device,
  projection,
}: {
  device: DeviceMode
  projection: CashFlowProjectionResult
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [detail, setDetail] = useState<number | null>(null)
  const points = projection.points
  const last = points[points.length - 1]

  if (!last) {
    return (
      <Card variant="report" className="mb-rp-empty">
        <h2 className="mb-rp-empty-title">未来区间暂无现金流推演</h2>
        <p className="mb-rp-empty-desc">请检查预算计划或未来已排定交易；数据全部来自后端推演端点。</p>
      </Card>
    )
  }

  const metrics: ReportMetric[] = [
    {
      label: '期末现金',
      value: currency(last.endCash),
      hint: last.end > projection.asOf ? '预测' : undefined,
    },
    { label: '期初现金', value: currency(projection.startCash) },
    { label: '数据截至', value: projection.asOf, hint: `${GRANULARITY_LABELS[projection.granularity]}粒度` },
  ]

  const flowMax = Math.max(
    1,
    ...points.map((point) => Math.max(point.inflow.total, point.outflow.total)),
  )
  const cashValues = [projection.startCash, ...points.map((point) => point.endCash)]
  const cashMin = Math.min(...cashValues)
  const cashMax = Math.max(...cashValues)
  const cashPad = cashMax === cashMin ? 100 : (cashMax - cashMin) * 0.12
  const cashLow = cashMin - cashPad
  const cashSpan = Math.max(1, cashMax + cashPad - cashLow)
  const dateSpan = Math.max(1, dayDiff(projection.start, projection.end))
  const xOfDate = (value: string) =>
    PLOT.left + (dayDiff(projection.start, value) / dateSpan) * (PLOT.right - PLOT.left)
  const xOf = (index: number) =>
    (xOfDate(points[index].start) + xOfDate(points[index].end)) / 2
  const yFlow = (value: number) =>
    PLOT.bottom - (value / flowMax) * (PLOT.bottom - PLOT.top) * 0.82
  const yCash = (value: number) =>
    PLOT.bottom - ((value - cashLow) / cashSpan) * (PLOT.bottom - PLOT.top)
  const slot = points.length > 0 ? (PLOT.right - PLOT.left) / points.length : 0
  const barWidth = Math.max(2, Math.min(14, slot * 0.24))
  const cashTicks = [0, 1, 2].map((index) => {
    const value = cashLow + (cashSpan * index) / 2
    return { value, y: yCash(value) }
  })
  const flowTicks = [0, 1, 2, 3].map((index) => {
    const value = (flowMax * index) / 3
    return { value, y: yFlow(value) }
  })
  const active = hovered !== null ? points[hovered] : detail !== null ? points[detail] : null

  // 桶末 <= asOf 为已发生；跨 asOf 或晚于 asOf 的桶按预测样式呈现。
  const splitIndex = points.findIndex((point) => point.end > projection.asOf)
  const actualCount = splitIndex === -1 ? points.length : splitIndex
  const predictedStart = splitIndex === -1 ? points.length : Math.max(0, splitIndex - 1)
  const asOfInRange = projection.asOf >= projection.start && projection.asOf <= projection.end
  const labelEvery = Math.max(1, Math.ceil(points.length / 8))

  const openDetail = (index: number) => {
    if (device === 'mobile') setDetail(index)
    else setHovered(index)
  }

  const columns: ReportColumn[] = [
    { label: `${GRANULARITY_LABELS[projection.granularity]}桶` },
    { label: '期初现金', align: 'num' },
    { label: '流入', align: 'num', hint: '接口合计' },
    { label: '流出', align: 'num', hint: '接口合计' },
    { label: '净额', align: 'num', hint: '接口合计' },
    { label: '期末现金', align: 'num' },
  ]
  const rows: ReportRow[] = points.map((point, index) => ({
    id: point.date,
    hint: point.end > projection.asOf ? '预测' : undefined,
    tone: 'neutral',
    onOpen: () => openDetail(index),
    cells: [
      point.label,
      currency(point.startCash),
      currency(point.inflow.total),
      currency(point.outflow.total),
      currency(point.net.total),
      currency(point.endCash),
    ],
  }))

  return (
    <>
      <MetricStrip device={device} metrics={metrics} />
      <ChartCard
        title="现金流推演"
        desc={`${points[0].label} ~ ${last.label} · 按${GRANULARITY_LABELS[projection.granularity]}桶 · 数据截至 ${projection.asOf}`}
      >
        <PredictionLegend actualLabel="已发生" extra={<PredictionTextureLegend />} />
        <svg
          className="mb-rp-predict-chart"
          viewBox="0 0 720 300"
          role="img"
          aria-label="未来现金流推演（预测）"
        >
          <PredictionTextureDefs />
          {flowTicks.map((tick) => (
            <g key={tick.value} className="mb-rp-predict-grid">
              <line x1={PLOT.left} x2={PLOT.right} y1={tick.y} y2={tick.y} />
              <text x={PLOT.left - 10} y={tick.y + 4} textAnchor="end">
                {currencyAxisFormatter(tick.value)}
              </text>
            </g>
          ))}
          {cashTicks.map((tick) => (
            <text
              key={tick.value}
              x={PLOT.right + 10}
              y={tick.y + 4}
              textAnchor="start"
            >
              {currencyAxisFormatter(tick.value)}
            </text>
          ))}
          {asOfInRange && (
            <PredictionAsOfLine
              x={xOfDate(projection.asOf)}
              top={PLOT.top}
              bottom={PLOT.bottom}
              label={`数据截至 ${projection.asOf.slice(5)}`}
            />
          )}
          {points.map((point, index) => {
            const predicted = point.end > projection.asOf
            return (
              <g key={point.date} className="mb-rp-predict-hit">
                {predicted && <title>{`${point.label} · 预测`}</title>}
                <CashBar flow={point.inflow} kind="inflow" x={xOf(index) - barWidth - 1} width={barWidth} yOf={yFlow} />
                <CashBar flow={point.outflow} kind="outflow" x={xOf(index) + 1} width={barWidth} yOf={yFlow} />
                {index % labelEvery === 0 && (
                  <text className="mb-rp-predict-xlabel" x={xOf(index)} y={PLOT.bottom + 20} textAnchor="middle">
                    {point.label}
                  </text>
                )}
              </g>
            )
          })}
          {actualCount >= 2 && (
            <polyline
              className="mb-rp-predict-cashline is-actual"
              points={points
                .slice(0, actualCount)
                .map((point, index) => `${xOf(index)},${yCash(point.endCash)}`)
                .join(' ')}
            />
          )}
          {points.length - predictedStart >= 2 && (
            <polyline
              className="mb-rp-predict-cashline is-predicted"
              points={points
                .slice(predictedStart)
                .map((point, index) => `${xOf(predictedStart + index)},${yCash(point.endCash)}`)
                .join(' ')}
            />
          )}
          {points.map((point, index) => (
            <g
              key={`${point.date}-cash`}
              className="mb-rp-predict-hit"
              role="button"
              tabIndex={0}
              aria-label={`${point.label} 期末现金 ${currency(point.endCash)}，查看预测构成`}
              onPointerEnter={() => setHovered(index)}
              onPointerLeave={() => setHovered(null)}
              onFocus={() => setHovered(index)}
              onBlur={() => setHovered(null)}
              onClick={() => openDetail(index)}
            >
              <rect
                x={xOf(index) - slot / 2}
                y={PLOT.top}
                width={slot}
                height={PLOT.bottom - PLOT.top}
                fill="transparent"
              />
              <circle
                className={
                  point.end <= projection.asOf
                    ? 'mb-rp-predict-cashdot is-actual'
                    : 'mb-rp-predict-cashdot is-predicted'
                }
                cx={xOf(index)}
                cy={yCash(point.endCash)}
                r={hovered === index ? 4.5 : 3.5}
              />
            </g>
          ))}
        </svg>
        {active && (
          <PredictionBreakdown
            title={`${active.label} · 现金流构成`}
            items={cashBreakdown(active)}
            note={[
              `口径：${cashSplit(active)}。每个数字都是后端字段，前端未做相加。`,
              coveredNote(active),
            ]
              .filter(Boolean)
              .join(' ')}
          />
        )}
        <p className="mb-rp-predict-note">
          柱为桶内流入 / 流出（后端合计），线为期末现金（endCash）；实线为已发生段，虚线为预测段。
          预测柱不靠透明度：45° 斜纹为「按预算计划」，点纹为「已排定」。
        </p>
      </ChartCard>
      <ReportTable
        device={device}
        title="未来现金流推演"
        desc={`按${GRANULARITY_LABELS[projection.granularity]}桶 · 期初 / 期末与三项流量均来自后端`}
        columns={columns}
        rows={rows}
        ariaLabel="未来现金流推演"
        note="每格直接取 point 的 startCash / endCash 与 inflow / outflow / net 的合计字段；covered 只作解释，不参与金额。"
      />
      <HfSheet
        variant="report"
        device={device}
        opened={detail !== null}
        onClose={() => setDetail(null)}
        title={detail !== null ? `${points[detail].label} · 预测构成` : '预测构成'}
      >
        {detail !== null && (
          <PredictionBreakdown
            items={cashBreakdown(points[detail])}
            note={[
              '全部数字来自 /reports/cash-flow-projection 的 actual / planned / committed / total 与 startCash / endCash 字段。',
              coveredNote(points[detail]),
            ]
              .filter(Boolean)
              .join(' ')}
          />
        )}
      </HfSheet>
    </>
  )
}
