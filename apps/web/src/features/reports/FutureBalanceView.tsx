/**
 * 资产负债未来视图（报表未来时间轴 P4）
 *
 * 只消费 GET /analytics/asset-projection 的合计层：净资产 / 资产 / 负债四列全部由后端给出，
 * 前端不做累计、相加或差额。图表按后端桶渲染：历史桶实线实心点，预测桶虚线空心点；
 * asOf 竖线按日期落在桶序列中，混合区间因此可以看到「已发生段 / 预测段」的分界。
 */
import { useState } from 'react'
import type { AssetProjectionResult } from '@/services/api'
import { currencyAxisFormatter } from '@/utils/format'
import { Card } from '@/features/shared/Card'
import { HfSheet } from '@/features/shared/HfSheet'
import type { DeviceMode } from '@/features/shared/types'
import { ChartCard } from './charts'
import { MetricStrip, ReportTable, type ReportColumn, type ReportRow } from './ReportTable'
import { balanceBreakdown, coveredNote, projectionMetric, projectionSplit } from './futureModel'
import { dayDiff, GRANULARITY_LABELS } from './reportsTime'
import {
  PredictionAsOfLine,
  PredictionBreakdown,
  PredictionLegend,
} from './prediction'
import { currency } from './reportsModel'

const PLOT = { left: 72, right: 700, top: 28, bottom: 246 }

export function FutureBalanceView({
  device,
  projection,
}: {
  device: DeviceMode
  projection: AssetProjectionResult
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [detail, setDetail] = useState<number | null>(null)
  const points = projection.points
  const last = points[points.length - 1]

  if (!last) {
    return (
      <Card variant="report" className="mb-rp-empty">
        <h2 className="mb-rp-empty-title">未来区间暂无推演数据</h2>
        <p className="mb-rp-empty-desc">请检查预算计划或未来已排定交易；数据全部来自后端推演端点。</p>
      </Card>
    )
  }

  const metrics = [
    projectionMetric('预计净资产', last, 'netWorth'),
    projectionMetric('预计总资产', last, 'assets'),
    projectionMetric('预计总负债', last, 'liabilities'),
    { label: 'asOf 基准净资产', value: currency(projection.base.netWorth), hint: '真实' },
  ]

  const values = points.map((point) => point.total.netWorth)
  const low = Math.min(projection.base.netWorth, ...values)
  const high = Math.max(projection.base.netWorth, ...values)
  const pad = high === low ? 100 : (high - low) * 0.12
  const min = low - pad
  const max = high + pad
  const span = Math.max(1, max - min)
  const dateSpan = Math.max(1, dayDiff(projection.start, projection.end))
  const xOfDate = (value: string) =>
    PLOT.left + (dayDiff(projection.start, value) / dateSpan) * (PLOT.right - PLOT.left)
  const xOf = (index: number) =>
    points.length === 1
      ? (PLOT.left + PLOT.right) / 2
      : xOfDate(points[index].date)
  const yOf = (value: number) =>
    PLOT.bottom - ((value - min) / span) * (PLOT.bottom - PLOT.top)
  const ticks = [0, 1, 2, 3].map((index) => {
    const value = min + (span * index) / 3
    return { value, y: yOf(value) }
  })
  const active = hovered !== null ? points[hovered] : detail !== null ? points[detail] : null
  const step = points.length > 1 ? (PLOT.right - PLOT.left) / (points.length - 1) : PLOT.right - PLOT.left

  // 桶末 <= asOf 为已发生；asOf 落在桶内或之后为预测（桶内只含 asOf 之后的增量）。
  const splitIndex = points.findIndex((point) => point.end > projection.asOf)
  const actualCount = splitIndex === -1 ? points.length : splitIndex
  const predictedStart = splitIndex === -1 ? points.length : Math.max(0, splitIndex - 1)
  const asOfInRange = projection.asOf >= projection.start && projection.asOf <= projection.end

  const openDetail = (index: number) => {
    if (device === 'mobile') setDetail(index)
    else setHovered(index)
  }

  const columns: ReportColumn[] = [
    { label: `${GRANULARITY_LABELS[projection.granularity]}桶` },
    { label: '已发生', align: 'num' },
    { label: '按预算计划', align: 'num' },
    { label: '已排定', align: 'num' },
    { label: '合计（接口）', align: 'num' },
  ]
  const rows: ReportRow[] = points.map((point, index) => ({
    id: point.date,
    hint: point.end > projection.asOf ? '预测' : undefined,
    tone: 'neutral',
    onOpen: () => openDetail(index),
    cells: [
      point.label,
      currency(point.actual.netWorth),
      currency(point.planned.netWorth),
      currency(point.committed.netWorth),
      currency(point.total.netWorth),
    ],
  }))

  const activeCoverage = active ? coveredNote(active) : null

  return (
    <>
      <MetricStrip device={device} metrics={metrics} />
      <ChartCard
        title="净资产推演"
        desc={`${points[0].label} ~ ${last.label} · 按${GRANULARITY_LABELS[projection.granularity]}桶 · 数据截至 ${projection.asOf}`}
      >
        <PredictionLegend actualLabel="已发生基准" />
        <svg
          className="mb-rp-predict-chart"
          viewBox="0 0 720 300"
          role="img"
          aria-label="未来净资产推演（预测）"
        >
          {ticks.map((tick) => (
            <g key={tick.y} className="mb-rp-predict-grid">
              <line x1={PLOT.left} x2={PLOT.right} y1={tick.y} y2={tick.y} />
              <text x={PLOT.left - 10} y={tick.y + 4} textAnchor="end">
                {currencyAxisFormatter(tick.value)}
              </text>
            </g>
          ))}
          {asOfInRange && (
            <PredictionAsOfLine
              x={xOfDate(projection.asOf)}
              top={PLOT.top}
              bottom={PLOT.bottom}
              label={`数据截至 ${projection.asOf.slice(5)}`}
            />
          )}
          <line
            className="mb-rp-predict-base"
            x1={PLOT.left}
            x2={PLOT.right}
            y1={yOf(projection.base.netWorth)}
            y2={yOf(projection.base.netWorth)}
          />
          {actualCount >= 2 && (
            <polyline
              className="mb-rp-predict-line is-actual"
              points={points
                .slice(0, actualCount)
                .map((point, index) => `${xOf(index)},${yOf(point.total.netWorth)}`)
                .join(' ')}
            />
          )}
          {points.length - predictedStart >= 2 && (
            <polyline
              className="mb-rp-predict-line"
              points={points
                .slice(predictedStart)
                .map((point, index) => `${xOf(predictedStart + index)},${yOf(point.total.netWorth)}`)
                .join(' ')}
            />
          )}
          {points.map((point, index) => {
            const isActual = point.end <= projection.asOf
            return (
              <g
                key={point.date}
                className="mb-rp-predict-hit"
                role="button"
                tabIndex={0}
                aria-label={`${point.label} 净资产 ${currency(point.total.netWorth)}，查看预测构成`}
                onPointerEnter={() => setHovered(index)}
                onPointerLeave={() => setHovered(null)}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(null)}
                onClick={() => openDetail(index)}
              >
                <rect
                  x={xOf(index) - step / 2}
                  y={PLOT.top}
                  width={step}
                  height={PLOT.bottom - PLOT.top}
                  fill="transparent"
                />
                <circle
                  className={
                    [
                      'mb-rp-predict-dot',
                      isActual ? 'is-actual' : '',
                      hovered === index ? 'is-active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')
                  }
                  cx={xOf(index)}
                  cy={yOf(point.total.netWorth)}
                  r={hovered === index ? 5 : 4}
                />
                <text className="mb-rp-predict-xlabel" x={xOf(index)} y={PLOT.bottom + 20} textAnchor="middle">
                  {point.label}
                </text>
              </g>
            )
          })}
        </svg>
        {active && (
          <PredictionBreakdown
            title={`${active.label} · 净资产构成`}
            items={balanceBreakdown(active)}
            note={[
              `合计文案：${projectionSplit(active, 'netWorth')}。四项均为后端字段，前端未做相加。`,
              activeCoverage,
            ]
              .filter(Boolean)
              .join(' ')}
          />
        )}
        <p className="mb-rp-predict-note">
          该视图只提供合计层推演；实线为已发生桶，虚线为预测桶，分界由 asOf 竖线标出。
        </p>
      </ChartCard>
      <ReportTable
        device={device}
        title="未来资产负债推演"
        desc={`按${GRANULARITY_LABELS[projection.granularity]}桶构成 · 合计来自后端推演端点`}
        columns={columns}
        rows={rows}
        ariaLabel="未来资产负债推演"
        note="合计（接口）= 已发生 + 按预算计划 + 已排定（后端逐项合成）；前端只展示字段，不做跨桶求和。"
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
            items={balanceBreakdown(points[detail])}
            note={[
              '全部数字来自 /analytics/asset-projection 的 actual / planned / committed / total 字段。',
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
