/**
 * 报表时间语义（HF 批次 3）
 *
 * 时点 = 某一时刻的余额快照（资产负债）；期间 = 一段时间的发生额（收支 / 现金流 / 投资）。
 * 粒度在时间条上即改即生效；预设 × 粒度兼容矩阵与「跨度 ≥ 一个聚合桶」校验都在这里，
 * 时间条与面板只做展示与草稿，不再各自复制一套规则。
 */

import {
  addDays,
  addMonths,
  dayOfMonth,
  formatDay,
  isoWeekLabel,
  monthEnd,
  monthOf,
  monthStart,
  parseDay,
  weekEnd,
  weekStart,
  yearEnd,
  yearOf,
  yearStart,
} from '@/utils/date'

export type Granularity = 'day' | 'week' | 'month' | 'year'
export type ReportTab = 'balance' | 'flow' | 'cash' | 'invest'
export type PresetId =
  | 'today'
  | 'last7'
  | 'thisMonth'
  | 'lastMonth'
  | 'last3m'
  | 'thisQuarter'
  | 'thisYear'
  | 'last12m'
  | 'nextMonth'
  | 'next3m'
  | 'next6m'
  | 'next12m'

/** 区间相对今天的三种状态：已发生 / 混合（跨今天）/ 全未来。 */
export type RangeState = 'past' | 'mixed' | 'future'

/** 状态的可见文案：时间条徽标与页头副标题共用同一份表述。 */
export const RANGE_STATE_LABEL: Record<RangeState, string> = {
  past: '已发生',
  mixed: '混合区间 · 含未来',
  future: '全未来',
}

export interface ReportTime {
  gran: Granularity
  /** 时点锚定日（资产负债） */
  point: string
  /** 期间起止（起 ≤ 止） */
  from: string
  to: string
  /** 已生效预设；null = 自定义 */
  preset: PresetId | null
}

export const GRANULARITIES: readonly Granularity[] = ['day', 'week', 'month', 'year']
export const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: '日',
  week: '周',
  month: '月',
  year: '年',
}

export const PRESETS: readonly { id: PresetId; label: string }[] = [
  { id: 'today', label: '今天' },
  { id: 'last7', label: '近 7 天' },
  { id: 'thisMonth', label: '本月' },
  { id: 'lastMonth', label: '上月' },
  { id: 'last3m', label: '近 3 个月' },
  { id: 'thisQuarter', label: '本季' },
  { id: 'thisYear', label: '今年' },
  { id: 'last12m', label: '近 12 个月' },
  // 未来预设只允许月粒度：日 / 年粒度下禁用并给出原因。
  { id: 'nextMonth', label: '下月' },
  { id: 'next3m', label: '未来 3 个月' },
  { id: 'next6m', label: '未来 6 个月' },
  { id: 'next12m', label: '未来 12 个月' },
]

/** 预设 × 粒度兼容矩阵（PRESET_GRAN_OK）：不兼容者在面板内置灰。 */
const ANY_GRAN: readonly Granularity[] = ['day', 'week', 'month', 'year']
const PRESET_GRAN: Record<PresetId, readonly Granularity[]> = {
  today: ['day'],
  last7: ['day'],
  // 用户要求的五个固定预设：任何粒度都可点，起止按当前粒度吸附（月粒度取月初/月末）。
  thisMonth: ANY_GRAN,
  lastMonth: ANY_GRAN,
  last3m: ANY_GRAN,
  thisQuarter: ['month'],
  thisYear: ANY_GRAN,
  last12m: ['year'],
  nextMonth: ['month'],
  next3m: ['month'],
  next6m: ['month'],
  next12m: ['month'],
}

export function presetSupported(preset: PresetId, gran: Granularity): boolean {
  return PRESET_GRAN[preset].includes(gran)
}

export function presetLabel(preset: PresetId): string {
  return PRESETS.find((item) => item.id === preset)?.label ?? ''
}

/** 桶起点：日 = 当日；周 = 周一；月 = 1 日；年 = 1-01。 */
export function bucketStartOf(value: string, gran: Granularity): string {
  if (gran === 'week') return weekStart(value)
  if (gran === 'month') return monthStart(value)
  if (gran === 'year') return yearStart(value)
  return value
}

/** 桶终点：日 = 当日；周 = 周日；月 = 月末；年 = 12-31。 */
export function bucketEndOf(value: string, gran: Granularity): string {
  if (gran === 'week') return weekEnd(value)
  if (gran === 'month') return monthEnd(value)
  if (gran === 'year') return yearEnd(value)
  return value
}

/**
 * 未来窗口上限（与后端 `futureLimitOf` 同一规则）：
 * 日 3 个月 / 周 6 个月 / 月 12 个月 / 年 3 年。
 * 例：asOf = 2026-11-06，月粒度 → 2027-11-30。
 */
export function futureHorizon(today: string, gran: Granularity): string {
  if (gran === 'day') return addMonths(today, 3)
  if (gran === 'week') return addMonths(today, 6)
  if (gran === 'year') return `${parseDay(today).getUTCFullYear() + 3}-12-31`
  return monthEnd(addMonths(monthStart(today), 12))
}

/** 期间相对今天的状态：止 ≤ 今天为已发生，起 > 今天为全未来，其余为跨今天的混合区间。 */
export function rangeState(from: string, to: string, today: string): RangeState {
  if (from > to) return 'past'
  if (to <= today) return 'past'
  if (from > today) return 'future'
  return 'mixed'
}

/**
 * 时点状态：今天及以前为已发生；正处于今天所在粒度桶（如本月）为混合；
 * 晚于该桶为全未来。资产负债用月末时点，本月选中即「已发生 + 剩余天数推演」。
 */
export function pointRangeState(point: string, today: string, gran: Granularity): RangeState {
  if (point <= today) return 'past'
  if (bucketKey(point, gran) === bucketKey(today, gran)) return 'mixed'
  return 'future'
}

/** 按粒度步进一个桶；时点步进后仍锚桶末。 */
export function shiftPoint(value: string, gran: Granularity, delta: number): string {
  if (gran === 'day') return addDays(value, delta)
  if (gran === 'week') return weekEnd(addDays(value, delta * 7))
  if (gran === 'month') return monthEnd(addMonths(monthStart(value), delta))
  return yearEnd(`${parseDay(value).getUTCFullYear() + delta}-01-01`)
}

/** 期间按粒度整体平移一个桶（起止同移，保持跨度）。 */
export function shiftRange(
  from: string,
  to: string,
  gran: Granularity,
  delta: number,
): { from: string; to: string } {
  if (gran === 'day') return { from: addDays(from, delta), to: addDays(to, delta) }
  if (gran === 'week') {
    return {
      from: weekStart(addDays(from, delta * 7)),
      to: weekEnd(addDays(to, delta * 7)),
    }
  }
  if (gran === 'month') {
    const start = parseDay(from)
    const end = parseDay(to)
    return {
      from: formatDay(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + delta, 1))),
      to: monthEnd(
        formatDay(new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + delta, 1))),
      ),
    }
  }
  const startYear = parseDay(from).getUTCFullYear() + delta
  const endYear = parseDay(to).getUTCFullYear() + delta
  return {
    from: formatDay(new Date(Date.UTC(startYear, 0, 1))),
    to: formatDay(new Date(Date.UTC(endYear, 11, 31))),
  }
}

/** 切粒度后重锚定：周 = 首周周一 ~ 末周周日；月 / 年同理。 */
export function reanchorRange(
  from: string,
  to: string,
  gran: Granularity,
): { from: string; to: string } {
  if (gran === 'day') return { from, to }
  if (gran === 'week') return { from: weekStart(from), to: weekEnd(to) }
  if (gran === 'month') return { from: monthStart(from), to: monthEnd(to) }
  return { from: yearStart(from), to: yearEnd(to) }
}

/** 未来预设：从「下月月初」起连续 N 个自然月（不含今天所在月）。 */
export function futureRange(today: string, months: number): { from: string; to: string } {
  const start = addMonths(monthStart(today), 1)
  const last = addMonths(start, months - 1)
  return { from: start, to: monthEnd(last) }
}

export function presetRange(
  preset: PresetId,
  gran: Granularity,
  today: string,
): { from: string; to: string } {
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'last7':
      return { from: addDays(today, -6), to: today }
    case 'thisMonth':
      return { from: monthStart(today), to: today }
    case 'lastMonth': {
      const previous = addDays(monthStart(today), -1)
      return { from: monthStart(previous), to: monthEnd(previous) }
    }
    case 'last3m': {
      const date = parseDay(today)
      const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 2, 1))
      return { from: formatDay(start), to: today }
    }
    case 'thisQuarter': {
      const date = parseDay(today)
      const quarterStart = Math.floor(date.getUTCMonth() / 3) * 3
      return {
        from: formatDay(new Date(Date.UTC(date.getUTCFullYear(), quarterStart, 1))),
        to: today,
      }
    }
    case 'thisYear':
      return { from: yearStart(today), to: today }
    case 'last12m': {
      const date = parseDay(today)
      const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 11, 1))
      return { from: formatDay(start), to: today }
    }
    case 'nextMonth':
      return futureRange(today, 1)
    case 'next3m':
      return futureRange(today, 3)
    case 'next6m':
      return futureRange(today, 6)
    case 'next12m':
      return futureRange(today, 12)
  }
  return reanchorRange(presetRange('thisMonth', gran, today).from, today, gran)
}

/** 时点场景下预设取「该预设期间的结束日」并对齐粒度锚点。 */
export function presetPoint(preset: PresetId, gran: Granularity, today: string): string {
  const range = presetRange(preset, gran, today)
  return bucketEndOf(range.to, gran)
}

/** 桶序号：用于「跨度 ≥ 一个聚合桶」校验。 */
function bucketIndex(value: string, gran: Granularity): number {
  if (gran === 'week') return Math.round(parseDay(weekStart(value)).getTime() / (7 * 86_400_000))
  const date = parseDay(value)
  if (gran === 'day') return Math.round(date.getTime() / 86_400_000)
  if (gran === 'month') return date.getUTCFullYear() * 12 + date.getUTCMonth()
  return date.getUTCFullYear()
}

export function spanBuckets(from: string, to: string, gran: Granularity): number {
  return bucketIndex(to, gran) - bucketIndex(from, gran) + 1
}

export interface TimeValidation {
  ok: boolean
  message: string | null
}

export function validateRange(
  from: string,
  to: string,
  gran: Granularity,
  today?: string,
): TimeValidation {
  if (from > to) return { ok: false, message: '起需早于或等于止' }
  if (spanBuckets(from, to, gran) < 1) {
    return { ok: false, message: `按${GRANULARITY_LABELS[gran]}粒度的期间需不短于一个${GRANULARITY_LABELS[gran]}` }
  }
  if (today && to > today) {
    const horizon = futureHorizon(today, gran)
    if (to > horizon || from > horizon) {
      return {
        ok: false,
        message: `按${GRANULARITY_LABELS[gran]}粒度，未来最多查看至 ${horizon}`,
      }
    }
  }
  return { ok: true, message: null }
}

/** 时点不得晚于数据截止日；月末锚点在「本月」会被 asOf 截断。 */
export function clampAsOfPoint(point: string, today: string): string {
  return point > today ? today : point
}

/**
 * 统一期间表述：三个 tab 使用同一控件的语义，都读这一处。
 * 单月显示「YYYY 年 M 月 · 截至 MM-DD」；单日、跨月、跨年各有明确写法。
 */
export function formatRangeLabel(time: ReportTime): string {
  const { from, to, gran } = time
  if (from === to) {
    return `${yearOf(from)} 年 ${monthOf(from)} 月 ${dayOfMonth(from)} 日`
  }
  if (gran === 'week' && bucketKey(from, 'week') === bucketKey(to, 'week')) {
    return `${isoWeekLabel(from)} · 截至 ${to.slice(5)}`
  }
  if (gran === 'month' && bucketKey(from, 'month') === bucketKey(to, 'month')) {
    return `${yearOf(from)} 年 ${monthOf(from)} 月 · 截至 ${to.slice(5)}`
  }
  if (gran === 'year' && yearOf(from) === yearOf(to)) {
    return `${yearOf(from)} 年 · 截至 ${to.slice(5)}`
  }
  return `${from} ~ ${to}`
}

/** 时点标签：显示截至日（已被 asOf 截断），由时间条另注「桶末估值」。 */
export function formatPointLabel(point: string, gran: Granularity, today: string): string {
  const asOf = clampAsOfPoint(point, today)
  if (gran === 'year') return `${yearOf(asOf)} 年 · 截至 ${asOf.slice(5)}`
  if (gran === 'month') return `${yearOf(asOf)} 年 ${monthOf(asOf)} 月 · 截至 ${asOf.slice(5)}`
  if (gran === 'week') return `${isoWeekLabel(asOf)} · 截至 ${asOf.slice(5)}`
  return `${yearOf(asOf)} 年 ${monthOf(asOf)} 月 ${dayOfMonth(asOf)} 日`
}

function shortDate(value: string, gran: Granularity): string {
  if (gran === 'day') return value.slice(5)
  if (gran === 'week') return isoWeekLabel(value)
  if (gran === 'month') return value.slice(0, 7)
  return value.slice(0, 4)
}

/** 期间按粒度分桶：返回桶起点、终点与轴标签（周 = ISO 周一至周日）。 */
export function listBuckets(from: string, to: string, gran: Granularity): { key: string; label: string; from: string; to: string }[] {
  if (from > to) return []
  const buckets: { key: string; label: string; from: string; to: string }[] = []
  let cursor = bucketStartOf(from, gran)
  const guard = 4000
  let steps = 0
  while (cursor <= to && steps < guard) {
    const end = bucketEndOf(cursor, gran)
    buckets.push({ key: cursor, label: shortDate(cursor, gran), from: cursor, to: end })
    cursor = addDays(end, 1)
    steps += 1
  }
  return buckets
}

export function bucketKey(value: string, gran: Granularity): string {
  if (gran === 'day') return value
  if (gran === 'week') return isoWeekLabel(value)
  if (gran === 'month') return value.slice(0, 7)
  return value.slice(0, 4)
}
