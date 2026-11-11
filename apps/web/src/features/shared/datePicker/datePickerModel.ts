/**
 * 统一日期选择器的纯函数层
 *
 * 两处接入（流水筛选 / 报表时间条）都只读这里的日期语义：
 * - 内部值统一 `YYYY-MM-DD`，与后端校验、领域 LocalDate 一致；
 * - 区间反选在写入前自动交换，日历、预设、展示文字共用同一份结果；
 * - 粒度决定「面板长什么样」：日看日历网格、周看周列表、月看 12 个月、年看年份窗口；
 *   粒度也决定「显示到哪一级」：月粒度只显示年月，不显示日。
 */

import {
  addDays,
  addMonths,
  dayOfMonth,
  isoWeekLabel,
  monthEnd,
  monthOf,
  monthStart,
  parseDay,
  weekdayOffset,
  yearEnd,
  yearOf,
  yearStart,
  type CalendarGranularity,
} from '@/utils/date'

export type DateGranularity = CalendarGranularity

export interface DateRange {
  from: string
  to: string
}

export interface DatePresetOption {
  id: string
  label: string
  from: string
  to: string
}

/**
 * 粒度面板的一个可选单元：日 / 周 / 月 / 年都用同一形状描述。
 *
 * start / end 是该单元覆盖的日期区间；点击后按「起取 start、止取 end」写入。
 */
export interface GranCell {
  /** 单元起点（YYYY-MM-DD）。 */
  start: string
  /** 单元终点（YYYY-MM-DD）。 */
  end: string
  /** 面板上显示的文字。 */
  label: string
  /** 仅日粒度：是否属于当前展示月（跨月补齐的格子为 false）。 */
  inMonth?: boolean
}

/** 面板的浏览位置：年月。粒度决定它被怎么使用。 */
export interface GranView {
  year: number
  month: number
}

export const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'] as const

export function weekStartOf(value: string): string {
  const day = parseDay(value).getUTCDay()
  return addDays(value, day === 0 ? -6 : 1 - day)
}

export function weekEndOf(value: string): string {
  return addDays(weekStartOf(value), 6)
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
  if (gran === 'week') return edge === 'start' ? weekStartOf(value) : weekEndOf(value)
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

/**
 * 按粒度显示日期：只显示到该粒度对应的层级。
 * 日 → 2026-10-01；周 → 2026-W42；月 → 2026 年 10 月；年 → 2026 年。
 */
export function formatByGran(value: string, gran: DateGranularity): string {
  if (!value) return ''
  if (gran === 'week') return isoWeekLabel(value)
  if (gran === 'month') return `${yearOf(value)} 年 ${monthOf(value)} 月`
  if (gran === 'year') return `${yearOf(value)} 年`
  return value
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

/** 日面板：固定 6 周 × 7 天网格，含相邻月补齐日；方向键跨月时无需重排 DOM。 */
export function calendarCells(year: number, month: number): GranCell[] {
  const start = new Date(Date.UTC(year, month - 1, 1 - weekdayOffset(year, month)))
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(start.toISOString().slice(0, 10), index)
    return {
      start: date,
      end: date,
      label: String(dayOfMonth(date)),
      inMonth: monthOf(date) === month && yearOf(date) === year,
    }
  })
}

/** 周面板：展示月覆盖到的每一周（周一 ~ 周日）。 */
export function weekCells(year: number, month: number): GranCell[] {
  const first = monthStart(`${year}-${String(month).padStart(2, '0')}-01`)
  const last = monthEnd(first)
  const cells: GranCell[] = []
  let cursor = weekStartOf(first)
  while (cursor <= last) {
    const end = weekEndOf(cursor)
    cells.push({ start: cursor, end, label: `${cursor.slice(5)} ~ ${end.slice(5)}` })
    cursor = addDays(end, 1)
  }
  return cells
}

/** 月面板：展示年的 12 个月。 */
export function monthCells(year: number): GranCell[] {
  return Array.from({ length: 12 }, (_, index) => {
    const start = `${year}-${String(index + 1).padStart(2, '0')}-01`
    return { start, end: monthEnd(start), label: `${index + 1} 月` }
  })
}

/** 年面板：以 10 年为窗口，窗口起点对齐到整十年。 */
export function yearCells(year: number): GranCell[] {
  const base = year - (year % 10)
  return Array.from({ length: 10 }, (_, index) => {
    const target = `${base + index}-01-01`
    return { start: yearStart(target), end: yearEnd(target), label: `${base + index} 年` }
  })
}

/** 按粒度给出当前浏览位置上的可选单元。 */
export function granCells(gran: DateGranularity, view: GranView): GranCell[] {
  if (gran === 'week') return weekCells(view.year, view.month)
  if (gran === 'month') return monthCells(view.year)
  if (gran === 'year') return yearCells(view.year)
  return calendarCells(view.year, view.month)
}

/** 面板的翻页：日 / 周按月翻，月按年翻，年按 10 年窗口翻。 */
export function shiftView(gran: DateGranularity, view: GranView, delta: number): GranView {
  if (gran === 'month') return { year: view.year + delta, month: view.month }
  if (gran === 'year') return { year: view.year + delta * 10, month: view.month }
  const next = addMonths(`${view.year}-${String(view.month).padStart(2, '0')}-01`, delta)
  return { year: yearOf(next), month: monthOf(next) }
}

/** 面板标题：日 / 周看年月，月看年，年看 10 年窗口。 */
export function viewTitle(gran: DateGranularity, view: GranView): string {
  if (gran === 'month') return `${view.year} 年`
  if (gran === 'year') {
    const base = view.year - (view.year % 10)
    return `${base} – ${base + 9} 年`
  }
  return `${view.year} 年 ${view.month} 月`
}

/** 面板里的单元用几列排布（方向键按列移动）。 */
export function granColumns(gran: DateGranularity): number {
  if (gran === 'day') return 7
  if (gran === 'month') return 4
  if (gran === 'year') return 2
  return 1
}
