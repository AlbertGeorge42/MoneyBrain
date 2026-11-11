/**
 * 日期纯函数：内部值统一 `YYYY-MM-DD`，解析/格式化都按 UTC 零点，不受时区影响。
 *
 * 全仓库唯一的日期原语实现：报表时间语义（features/reports/reportsTime）与
 * 统一日期选择器（features/shared/datePicker）都从这里取，
 * 避免「周一为周首」「月末是几号」这类规则出现两份。
 */

/** 粒度：日 / 周 / 月 / 年。 */
export type CalendarGranularity = 'day' | 'week' | 'month' | 'year'

export function parseDay(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** 该月的天数（month 为 1–12）。 */
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
  return formatDay(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)))
}

/** ISO 周起点（周一）。 */
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
 * ISO 周标签 `YYYY-Www`：周编号与周年份取该周周四所在年份（跨年周不拆），
 * 与后端 `isoWeekLabel` 同一规则。
 */
export function isoWeekLabel(value: string): string {
  const thursday = addDays(weekStart(value), 3)
  const year = parseDay(thursday).getUTCFullYear()
  const dayOfYear =
    Math.round((parseDay(thursday).getTime() - parseDay(`${year}-01-01`).getTime()) / 86_400_000) + 1
  return `${year}-W${String(Math.floor((dayOfYear - 1) / 7) + 1).padStart(2, '0')}`
}
