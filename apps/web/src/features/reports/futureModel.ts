/**
 * 报表未来区间的取数窗口与构成拼装（报表未来时间轴）
 *
 * 窗口只描述「asOf + 粒度 + from/to」，桶边界与累计全部由后端计算；
 * 这里不插值、不摊平、不做任何金额相加。
 */
import type { AssetProjectionPoint, CashFlowProjectionPoint } from '@contracts/types'
import { currency, type ReportMetric } from './reportsModel'
import { bucketEndOf, bucketStartOf, type Granularity } from './reportsTime'
import type { BreakdownItem } from './predictionModel'

/** 推演窗口：与后端 `from/to + granularity` 一一对应，同一区间只发一次请求。 */
export interface ProjectionWindow {
  asOf: string
  granularity: Granularity
  from: string
  to: string
}

/** 桶相对 asOf 的状态：整桶已发生 / 跨 asOf / 全未来。 */
export function projectionBucketState(
  start: string,
  end: string,
  asOf: string,
): 'past' | 'mixed' | 'future' {
  if (end <= asOf) return 'past'
  if (start > asOf) return 'future'
  return 'mixed'
}

/**
 * 资产负债时点窗口：
 * - 从今天所在桶的起点起算，保留「已发生 / 混合」基准；
 * - 止于所选时点所在桶的终点，由后端按粒度输出桶末余额。
 */
export function pointWindow(
  point: string,
  today: string,
  gran: Granularity,
): ProjectionWindow {
  const from = bucketStartOf(today, gran)
  const to = bucketEndOf(point, gran)
  return { asOf: today, granularity: gran, from: from > to ? to : from, to }
}

/**
 * 期间窗口（现金流）：
 * - 起止保持用户选择，桶由后端向外对齐；
 * - 止对齐到桶末，避免把半个桶当成完整期间。
 */
export function periodWindow(
  from: string,
  to: string,
  today: string,
  gran: Granularity,
): ProjectionWindow {
  return { asOf: today, granularity: gran, from, to: bucketEndOf(to, gran) }
}

/**
 * 资产负债推演的桶构成：四项都是后端字段。
 * `predicted` 不在这里由 `total - actual` 倒推——后端没有该字段就不显示。
 */
export function balanceBreakdown(point: AssetProjectionPoint): BreakdownItem[] {
  return [
    { label: '已发生', value: currency(point.actual.netWorth) },
    { label: '按预算计划', value: currency(point.planned.netWorth) },
    { label: '已排定', value: currency(point.committed.netWorth) },
    { label: '接口合计', value: currency(point.total.netWorth), total: true },
  ]
}

type BalanceField = keyof Pick<AssetProjectionPoint['total'], 'assets' | 'liabilities' | 'netWorth'>

/** 指标的拆解文案：每个数字都是后端分项，前端只拼字符串。 */
export function projectionSplit(point: AssetProjectionPoint, field: BalanceField): string {
  return [
    `已发生 ${currency(point.actual[field])}`,
    `按预算计划 ${currency(point.planned[field])}`,
    `已排定 ${currency(point.committed[field])}`,
    `合计 ${currency(point.total[field])}`,
  ].join(' · ')
}

export function projectionMetric(
  label: string,
  point: AssetProjectionPoint,
  field: BalanceField,
  tone: ReportMetric['tone'] = 'neutral',
): ReportMetric {
  return {
    label,
    value: currency(point.total[field]),
    tone,
    prediction: {
      actual: point.actual[field],
      direction: 'net',
      split: projectionSplit(point, field),
    },
  }
}

/** 现金流桶的构成：期初 / 期末与三种来源全部回显后端字段。 */
export function cashBreakdown(point: CashFlowProjectionPoint): BreakdownItem[] {
  return [
    { label: '期初现金', value: currency(point.startCash) },
    { label: '流入 · 已发生', value: currency(point.inflow.actual) },
    { label: '流入 · 按预算计划', value: currency(point.inflow.planned) },
    { label: '流入 · 已排定', value: currency(point.inflow.committed) },
    { label: '流入 · 接口合计', value: currency(point.inflow.total) },
    { label: '流出 · 已发生', value: currency(point.outflow.actual) },
    { label: '流出 · 按预算计划', value: currency(point.outflow.planned) },
    { label: '流出 · 已排定', value: currency(point.outflow.committed) },
    { label: '流出 · 接口合计', value: currency(point.outflow.total) },
    { label: '净额 · 接口合计', value: currency(point.net.total) },
    { label: '期末现金', value: currency(point.endCash), total: true },
  ]
}

/** 现金流指标的拆解文案：仍只拼后端字段，不做合计。 */
export function cashSplit(point: CashFlowProjectionPoint): string {
  return [
    `期初 ${currency(point.startCash)}`,
    `流入 ${currency(point.inflow.total)}`,
    `流出 ${currency(point.outflow.total)}`,
    `净额 ${currency(point.net.total)}`,
    `期末 ${currency(point.endCash)}`,
  ].join(' · ')
}

/** 覆盖点位只做解释：金额已从 planned 剔除、只计在 committed。 */
export function coveredNote(point: { covered: { budgetName: string; date: string }[] }): string | null {
  if (point.covered.length === 0) return null
  const names = point.covered.map((item) => `${item.budgetName}（${item.date.slice(5)}）`).join('、')
  return `本桶有 ${point.covered.length} 个预算点位由真实交易覆盖：${names}；金额只计已排定。`
}
