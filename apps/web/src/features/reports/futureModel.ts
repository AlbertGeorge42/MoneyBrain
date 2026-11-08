/**
 * 报表未来区间的取数窗口与构成拼装（报表未来时间轴）
 *
 * 窗口是「日历月份」选择，不涉及金额；构成项一律回显后端字段，
 * 不在这里做加法、差额或相邻点推算。
 */
import type {
  AssetProjectionPoint,
  ProjectionWindowMonths,
} from '@contracts/types'
import { currency, type ReportMetric } from './reportsModel'
import { addMonths, monthStart, pointRangeState, rangeState, spanBuckets } from './reportsTime'
import type { BreakdownItem } from './predictionModel'

/** 未来窗口上限：12 个自然月（与后端 months 参数上限一致）。 */
export const MAX_FUTURE_MONTHS = 12

export interface ProjectionWindow {
  asOf: string
  fromMonth: string
  months: ProjectionWindowMonths
}

function clampMonths(value: number): ProjectionWindowMonths {
  const months = Math.max(1, Math.min(MAX_FUTURE_MONTHS, value))
  return months as ProjectionWindowMonths
}

/**
 * 资产负债时点窗口：
 * - 本月内（混合）：从本月起 1 个月，累计仍由后端从 asOf 起算；
 * - 晚于本月（全未来）：从下月起，到所选月末。
 */
export function pointWindow(point: string, today: string): ProjectionWindow {
  const current = monthStart(today)
  const state = pointRangeState(point, today, 'month')
  const from = state === 'mixed' ? current : addMonths(current, 1)
  const months = clampMonths(spanBuckets(from, monthStart(point), 'month'))
  return { asOf: today, fromMonth: from.slice(0, 7), months }
}

/**
 * 期间窗口（现金流 / 收支）：
 * - 跨今天：从本月起，覆盖本月剩余日期；
 * - 全未来：从所选期间首月起。
 */
export function periodWindow(from: string, to: string, today: string): ProjectionWindow {
  const current = monthStart(today)
  const first = rangeState(from, to, today) === 'mixed' ? current : monthStart(from)
  const months = clampMonths(spanBuckets(first, monthStart(to), 'month'))
  return { asOf: today, fromMonth: first.slice(0, 7), months }
}

/**
 * 资产负债推演的单月构成：四项都是后端字段。
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
