/**
 * 报表时间语义（HF 批次 3）
 *
 * 时点 = 某一时刻的余额快照（资产负债）；期间 = 一段时间的发生额（收支 / 现金流 / 投资）。
 * 粒度在时间条上即改即生效；预设 × 粒度兼容矩阵与「跨度 ≥ 一个聚合桶」校验都在这里，
 * 时间条与面板只做展示与草稿，不再各自复制一套规则。
 */

export type Granularity = 'day' | 'month' | 'year'
export type ReportTab = 'balance' | 'flow' | 'cash' | 'invest'
export type PresetId =
  | 'today'
  | 'last7'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'thisYear'
  | 'last12m'

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

export const GRANULARITIES: readonly Granularity[] = ['day', 'month', 'year']
export const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: '日',
  month: '月',
  year: '年',
}

export const PRESETS: readonly { id: PresetId; label: string }[] = [
  { id: 'today', label: '今天' },
  { id: 'last7', label: '近 7 天' },
  { id: 'thisMonth', label: '本月' },
  { id: 'lastMonth', label: '上月' },
  { id: 'thisQuarter', label: '本季' },
  { id: 'thisYear', label: '今年' },
  { id: 'last12m', label: '近 12 个月' },
]

/** 预设 × 粒度兼容矩阵（PRESET_GRAN_OK）：不兼容者在面板内置灰。 */
const PRESET_GRAN: Record<PresetId, readonly Granularity[]> = {
  today: ['day'],
  last7: ['day'],
  thisMonth: ['month'],
  lastMonth: ['month'],
  thisQuarter: ['month'],
  thisYear: ['year'],
  last12m: ['year'],
}

export function presetSupported(preset: PresetId, gran: Granularity): boolean {
  return PRESET_GRAN[preset].includes(gran)
}

export function presetLabel(preset: PresetId): string {
  return PRESETS.find((item) => item.id === preset)?.label ?? ''
}

function parseDay(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(value: string, days: number): string {
  const date = parseDay(value)
  date.setUTCDate(date.getUTCDate() + days)
  return formatDay(date)
}

function lastDayOfMonth(year: number, monthIndex: number): string {
  return formatDay(new Date(Date.UTC(year, monthIndex + 1, 0)))
}

export function monthStart(value: string): string {
  const date = parseDay(value)
  return formatDay(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)))
}

export function monthEnd(value: string): string {
  const date = parseDay(value)
  return lastDayOfMonth(date.getUTCFullYear(), date.getUTCMonth())
}

export function yearStart(value: string): string {
  return formatDay(new Date(Date.UTC(parseDay(value).getUTCFullYear(), 0, 1)))
}

export function yearEnd(value: string): string {
  return formatDay(new Date(Date.UTC(parseDay(value).getUTCFullYear(), 11, 31)))
}

export function dayOfMonth(value: string): number {
  return parseDay(value).getUTCDate()
}

export function monthOf(value: string): number {
  return parseDay(value).getUTCMonth() + 1
}

export function yearOf(value: string): number {
  return parseDay(value).getUTCFullYear()
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000)
}

/** 时点粒度 = 锚点精度：月取月末、年取 12-31。 */
export function snapPoint(value: string, gran: Granularity): string {
  if (gran === 'month') return monthEnd(value)
  if (gran === 'year') return yearEnd(value)
  return value
}

/** 按粒度步进一个桶；时点步进后仍锚月末 / 年末。 */
export function shiftPoint(value: string, gran: Granularity, delta: number): string {
  const date = parseDay(value)
  if (gran === 'day') return addDays(value, delta)
  if (gran === 'month') {
    const anchor = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1))
    return monthEnd(formatDay(anchor))
  }
  return yearEnd(formatDay(new Date(Date.UTC(date.getUTCFullYear() + delta, 0, 1))))
}

/** 期间按粒度整体平移一个桶（起止同移，保持跨度）。 */
export function shiftRange(
  from: string,
  to: string,
  gran: Granularity,
  delta: number,
): { from: string; to: string } {
  if (gran === 'day') return { from: addDays(from, delta), to: addDays(to, delta) }
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

/** 切粒度后重锚定：月 = 首月月初 ~ 末月月末；年 = 首年年初 ~ 末年年底。 */
export function reanchorRange(
  from: string,
  to: string,
  gran: Granularity,
): { from: string; to: string } {
  if (gran === 'day') return { from, to }
  if (gran === 'month') return { from: monthStart(from), to: monthEnd(to) }
  return { from: yearStart(from), to: yearEnd(to) }
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
  }
  return reanchorRange(presetRange('thisMonth', gran, today).from, today, gran)
}

/** 时点场景下预设取「该预设期间的结束日」并对齐粒度锚点。 */
export function presetPoint(preset: PresetId, gran: Granularity, today: string): string {
  const range = presetRange(preset, gran, today)
  return snapPoint(range.to, gran)
}

/** 桶序号：用于「跨度 ≥ 一个聚合桶」校验。 */
function bucketIndex(value: string, gran: Granularity): number {
  const date = parseDay(value)
  if (gran === 'day') return Math.round(date.getTime() / 86_400_000)
  if (gran === 'month') return date.getUTCFullYear() * 12 + date.getUTCMonth()
  return date.getUTCFullYear()
}

export function spanBuckets(from: string, to: string, gran: Granularity): number {
  return bucketIndex(to, gran) - bucketIndex(from, gran) + 1
}

export function isValidRange(from: string, to: string, gran: Granularity): boolean {
  if (from > to) return false
  return spanBuckets(from, to, gran) >= 1
}

export interface TimeValidation {
  ok: boolean
  message: string | null
}

export function validateRange(from: string, to: string, gran: Granularity): TimeValidation {
  if (from > to) return { ok: false, message: '起需早于或等于止' }
  if (spanBuckets(from, to, gran) < 1) {
    return { ok: false, message: `按${GRANULARITY_LABELS[gran]}粒度的期间需不短于一个${GRANULARITY_LABELS[gran]}` }
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
  if (gran === 'month' && bucketKey(from, 'month') === bucketKey(to, 'month')) {
    return `${yearOf(from)} 年 ${monthOf(from)} 月 · 截至 ${to.slice(5)}`
  }
  if (gran === 'year' && yearOf(from) === yearOf(to)) {
    return `${yearOf(from)} 年 · 截至 ${to.slice(5)}`
  }
  return `${from} ~ ${to}`
}

/** 时点标签：显示截至日（已被 asOf 截断），由时间条另注「月末估值」。 */
export function formatPointLabel(point: string, gran: Granularity, today: string): string {
  const asOf = clampAsOfPoint(point, today)
  if (gran === 'year') return `${yearOf(asOf)} 年 · 截至 ${asOf.slice(5)}`
  if (gran === 'month') return `${yearOf(asOf)} 年 ${monthOf(asOf)} 月 · 截至 ${asOf.slice(5)}`
  return `${yearOf(asOf)} 年 ${monthOf(asOf)} 月 ${dayOfMonth(asOf)} 日`
}

function shortDate(value: string, gran: Granularity): string {
  if (gran === 'day') return value.slice(5)
  if (gran === 'month') return value.slice(0, 7)
  return value.slice(0, 4)
}

/** 期间按粒度分桶：返回桶的起始日与轴标签。 */
export function listBuckets(from: string, to: string, gran: Granularity): { key: string; label: string; from: string; to: string }[] {
  if (from > to) return []
  const buckets: { key: string; label: string; from: string; to: string }[] = []
  let cursor = gran === 'day' ? from : gran === 'month' ? monthStart(from) : yearStart(from)
  const guard = 4000
  let steps = 0
  while (cursor <= to && steps < guard) {
    const end = gran === 'day' ? cursor : gran === 'month' ? monthEnd(cursor) : yearEnd(cursor)
    buckets.push({ key: cursor, label: shortDate(cursor, gran), from: cursor, to: end })
    cursor = addDays(end, 1)
    steps += 1
  }
  return buckets
}

export function bucketKey(value: string, gran: Granularity): string {
  if (gran === 'day') return value
  if (gran === 'month') return value.slice(0, 7)
  return value.slice(0, 4)
}
