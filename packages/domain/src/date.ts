/**
 * 日期值对象。
 *
 * 记账只关心「哪一天」，不关心时分秒与时区。领域层统一使用
 * `LocalDate`（YYYY-MM-DD）和半开区间 `[start, endExclusive)`。
 */

export type LocalDate = string & { readonly __brand: 'LocalDate' }

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export interface Period {
  start: LocalDate
  endExclusive: LocalDate
}

/** 校验并构造 LocalDate。 */
export function localDate(value: string): LocalDate {
  const match = DATE_PATTERN.exec(value)
  if (!match) throw new RangeError(`日期格式必须为 YYYY-MM-DD，收到: ${value}`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`日期不存在: ${value}`)
  }
  return value as LocalDate
}

export function isLocalDate(value: string): value is LocalDate {
  try {
    localDate(value)
    return true
  } catch {
    return false
  }
}

/** 从 Date 取本地日历日（不使用 toISOString，避免时区偏移）。 */
export function fromDate(value: Date): LocalDate {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}` as LocalDate
}

export function today(now: Date = new Date()): LocalDate {
  return fromDate(now)
}

/** ISO 日期可直接按字典序比较。 */
export function compare(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function isBefore(a: LocalDate, b: LocalDate): boolean {
  return a < b
}

export function isAfter(a: LocalDate, b: LocalDate): boolean {
  return a > b
}

export function minDate(a: LocalDate, b: LocalDate): LocalDate {
  return a <= b ? a : b
}

export function maxDate(a: LocalDate, b: LocalDate): LocalDate {
  return a >= b ? a : b
}

interface DateParts {
  year: number
  month: number
  day: number
}

function parts(value: LocalDate): DateParts {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  return { year, month, day }
}

function toUtc(value: LocalDate): Date {
  const { year, month, day } = parts(value)
  return new Date(Date.UTC(year, month - 1, day))
}

function fromUtc(value: Date): LocalDate {
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, '0')
  const day = String(value.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}` as LocalDate
}

export function addDays(value: LocalDate, amount: number): LocalDate {
  const date = toUtc(value)
  date.setUTCDate(date.getUTCDate() + amount)
  return fromUtc(date)
}

/** 加自然月；目标月没有该日时收敛到月末（1-31 + 1 月 = 2-28）。 */
export function addMonths(value: LocalDate, amount: number): LocalDate {
  const { year, month, day } = parts(value)
  const target = new Date(Date.UTC(year, month - 1 + amount, 1))
  const targetYear = target.getUTCFullYear()
  const targetMonth = target.getUTCMonth() + 1
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate()
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}` as LocalDate
}

/** 返回该日期所在周的周一（ISO 周）。 */
export function startOfWeek(value: LocalDate): LocalDate {
  const date = toUtc(value)
  const day = date.getUTCDay() // 0=周日
  const offset = day === 0 ? -6 : 1 - day
  date.setUTCDate(date.getUTCDate() + offset)
  return fromUtc(date)
}

/**
 * ISO 周标签 `YYYY-Www`。
 * 周编号与周年份取该周周四所在的年份（跨年周不会拆开，2026-12-28 属于 2026-W53）。
 */
export function isoWeekLabel(value: LocalDate): string {
  const thursday = addDays(startOfWeek(value), 3)
  const { year } = parts(thursday)
  const dayOfYear = Math.round(
    (toUtc(thursday).getTime() - toUtc(`${year}-01-01` as LocalDate).getTime()) / 86400000,
  ) + 1
  const week = Math.floor((dayOfYear - 1) / 7) + 1
  return `${year}-W${String(week).padStart(2, '0')}`
}

export function startOfMonth(value: LocalDate): LocalDate {
  const { year, month } = parts(value)
  return `${year}-${String(month).padStart(2, '0')}-01` as LocalDate
}

export function startOfNextMonth(value: LocalDate): LocalDate {
  const { year, month } = parts(value)
  const date = new Date(Date.UTC(year, month, 1))
  return fromUtc(date)
}

export function startOfQuarter(value: LocalDate): LocalDate {
  const { year, month } = parts(value)
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1
  return `${year}-${String(quarterStartMonth).padStart(2, '0')}-01` as LocalDate
}

export function startOfNextQuarter(value: LocalDate): LocalDate {
  const start = startOfQuarter(value)
  const { year, month } = parts(start)
  return fromUtc(new Date(Date.UTC(year, month + 2, 1)))
}

export function startOfYear(value: LocalDate): LocalDate {
  const { year } = parts(value)
  return `${year}-01-01` as LocalDate
}

export function startOfNextYear(value: LocalDate): LocalDate {
  const { year } = parts(value)
  return `${year + 1}-01-01` as LocalDate
}

export function periodOfDay(value: LocalDate): Period {
  return { start: value, endExclusive: addDays(value, 1) }
}

export function periodOfWeek(value: LocalDate): Period {
  const start = startOfWeek(value)
  return { start, endExclusive: addDays(start, 7) }
}

export function periodOfMonth(value: LocalDate): Period {
  return { start: startOfMonth(value), endExclusive: startOfNextMonth(value) }
}

export function periodOfQuarter(value: LocalDate): Period {
  return { start: startOfQuarter(value), endExclusive: startOfNextQuarter(value) }
}

export function periodOfYear(value: LocalDate): Period {
  return { start: startOfYear(value), endExclusive: startOfNextYear(value) }
}

export type PeriodKind = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export function periodOf(kind: PeriodKind, value: LocalDate): Period {
  switch (kind) {
    case 'daily':
      return periodOfDay(value)
    case 'weekly':
      return periodOfWeek(value)
    case 'monthly':
      return periodOfMonth(value)
    case 'quarterly':
      return periodOfQuarter(value)
    case 'yearly':
      return periodOfYear(value)
  }
}

/** 半开区间：start <= date < endExclusive。 */
export function contains(period: Period, value: LocalDate): boolean {
  return value >= period.start && value < period.endExclusive
}

export function periodLengthInDays(period: Period): number {
  return Math.round((toUtc(period.endExclusive).getTime() - toUtc(period.start).getTime()) / 86400000)
}
