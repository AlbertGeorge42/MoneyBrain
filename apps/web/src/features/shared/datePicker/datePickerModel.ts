/**
 * 统一日期选择器的纯函数层
 *
 * 两处接入（流水筛选 / 报表时间条）都只读这里的日期语义：
 * - 内部值统一 `YYYY-MM-DD`，与后端校验、领域 LocalDate 一致；
 * - 区间反选在写入前自动交换，日历、预设、展示文字共用同一份结果；
 * - 月 / 年粒度按「起取月初 / 止取月末」吸附，避免控件显示与请求参数出现两种边界。
 */

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export type DateGranularity = 'day' | 'week' | 'month' | 'year'

export interface DateRange {
  from: string
  to: string
}

export interface DatePresetOption {
  id: string
  label: string
  from: string
  to: string
  /** 非空即禁用，文案同时作为可见原因展示（不只靠 title）。 */
  disabledReason?: string
}

export interface CalendarCell {
  date: string
  day: number
  /** 是否属于当前展示月（跨月补齐的格子为 false）。 */
  inMonth: boolean
}

export const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'] as const

export function isValidISODate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const probe = new Date(Date.UTC(year, month - 1, day))
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() + 1 === month &&
    probe.getUTCDate() === day
  )
}

export function parseDay(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** 周一为 0，周日为 6。 */
export function weekdayOffset(year: number, month: number): number {
  const day = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  return day === 0 ? 6 : day - 1
}

export function yearOf(value: string): number {
  return parseDay(value).getUTCFullYear()
}

export function monthOf(value: string): number {
  return parseDay(value).getUTCMonth() + 1
}

export function dayOfMonth(value: string): number {
  return parseDay(value).getUTCDate()
}

export function addDays(value: string, days: number): string {
  const date = parseDay(value)
  date.setUTCDate(date.getUTCDate() + days)
  return formatDay(date)
}

/** 加月并保持「同日」；目标月没有该日时取月末（10-31 + 1 月 = 11-30）。 */
export function addMonths(value: string, months: number): string {
  const date = parseDay(value)
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
  const day = Math.min(
    date.getUTCDate(),
    daysInMonth(target.getUTCFullYear(), target.getUTCMonth() + 1),
  )
  return formatDay(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day)))
}

export function monthStart(value: string): string {
  const date = parseDay(value)
  return formatDay(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)))
}

export function monthEnd(value: string): string {
  const date = parseDay(value)
  return formatDay(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)),
  )
}

export function weekStart(value: string): string {
  const day = parseDay(value).getUTCDay()
  return addDays(value, day === 0 ? -6 : 1 - day)
}

export function weekEnd(value: string): string {
  return addDays(weekStart(value), 6)
}

export function yearStart(value: string): string {
  return formatDay(new Date(Date.UTC(parseDay(value).getUTCFullYear(), 0, 1)))
}

export function yearEnd(value: string): string {
  return formatDay(new Date(Date.UTC(parseDay(value).getUTCFullYear(), 11, 31)))
}

/**
 * 按粒度吸附：粒度只影响边界，不改变用户点的日期归属。
 * 时点（point）取该桶末，期间起取桶首、止取桶末。
 */
export function snapDay(
  value: string,
  gran: DateGranularity,
  edge: 'start' | 'end',
): string {
  if (gran === 'week') return edge === 'start' ? weekStart(value) : weekEnd(value)
  if (gran === 'month') return edge === 'start' ? monthStart(value) : monthEnd(value)
  if (gran === 'year') return edge === 'start' ? yearStart(value) : yearEnd(value)
  return value
}

/** 上限截断：月末吸附可能落到未来（本月尚未结束），控件与请求都必须止于数据截止日。 */
export function clampDate(value: string, max: string | undefined): string {
  return max && value > max ? max : value
}

export interface NormalizedRange {
  range: DateRange
  /** 起止反选，已自动交换。 */
  swapped: boolean
}

export function normalizeRange(from: string, to: string): NormalizedRange {
  if (from && to && from > to) return { range: { from: to, to: from }, swapped: true }
  return { range: { from, to }, swapped: false }
}

export function formatDateText(value: string, placeholder = '不限'): string {
  return value || placeholder
}

/**
 * 流水筛选的四个快捷预设：本月 / 上月 / 近 3 个月 / 今年。
 * 「本月 / 今年」取整月 / 整年边界，未来流水仍在账本里，不提前截断。
 */
export function datePresets(today: string): DatePresetOption[] {
  const thisMonth = monthStart(today)
  const previousMonth = addMonths(thisMonth, -1)
  return [
    { id: 'thisMonth', label: '本月', from: thisMonth, to: monthEnd(today) },
    { id: 'lastMonth', label: '上月', from: previousMonth, to: monthEnd(previousMonth) },
    { id: 'last3m', label: '近 3 个月', from: addMonths(today, -3), to: today },
    { id: 'thisYear', label: '今年', from: yearStart(today), to: yearEnd(today) },
  ]
}

/** 固定 6 周 × 7 天网格，含相邻月补齐日；方向键跨月时无需重排 DOM。 */
export function calendarCells(year: number, month: number): CalendarCell[] {
  const start = new Date(Date.UTC(year, month - 1, 1 - weekdayOffset(year, month)))
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(formatDay(start), index)
    return { date, day: dayOfMonth(date), inMonth: monthOf(date) === month && yearOf(date) === year }
  })
}

export function moveDay(value: string, key: string): string {
  if (key === 'ArrowLeft') return addDays(value, -1)
  if (key === 'ArrowRight') return addDays(value, 1)
  if (key === 'ArrowUp') return addDays(value, -7)
  if (key === 'ArrowDown') return addDays(value, 7)
  return value
}

export function formatMonthTitle(year: number, month: number): string {
  return `${year} 年 ${month} 月`
}
