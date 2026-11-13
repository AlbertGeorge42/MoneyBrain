/**
 * 前端日期原语适配层。
 *
 * 所有日历运算的唯一实现在 `packages/domain/src/date.ts`，本文件只做
 * 「string / Date ↔ LocalDate」的类型适配与命名映射，不写第二套算法。
 * 对外签名保持 string / Date，避免 LocalDate 品牌类型扩散到 UI 模型；
 * 运算全程 UTC 日历日，与 Domain 同源，不受本地时区影响。
 */

import {
  addDays as domainAddDays,
  addMonths as domainAddMonths,
  dateParts,
  daysInMonth as domainDaysInMonth,
  endOfMonth,
  endOfWeek,
  endOfYear,
  fromUtcDate,
  isoWeekLabel as domainIsoWeekLabel,
  startOfMonth,
  startOfWeek,
  startOfYear,
  toUtcDate,
  weekdayOffset as domainWeekdayOffset,
  type LocalDate,
} from '@domain/index'

/** 粒度：日 / 周 / 月 / 年。UI 概念，不进领域层。 */
export type CalendarGranularity = 'day' | 'week' | 'month' | 'year'

/** 零校验地把 UI 的字符串日期当作 LocalDate；保持改造前的非法输入行为。 */
const asDay = (value: string): LocalDate => value as LocalDate

export function parseDay(value: string): Date {
  return toUtcDate(asDay(value))
}

export function formatDay(date: Date): string {
  return fromUtcDate(date)
}

/** 该月的天数（month 为 1–12）。 */
export function daysInMonth(year: number, month: number): number {
  return domainDaysInMonth(year, month)
}

/** 周一为 0，周日为 6。 */
export function weekdayOffset(year: number, month: number): number {
  return domainWeekdayOffset(year, month)
}

export function yearOf(value: string): number {
  return dateParts(asDay(value)).year
}

export function monthOf(value: string): number {
  return dateParts(asDay(value)).month
}

export function dayOfMonth(value: string): number {
  return dateParts(asDay(value)).day
}

export function addDays(value: string, days: number): string {
  return domainAddDays(asDay(value), days)
}

/** 加月并保持「同日」；目标月没有该日时取月末（10-31 + 1 月 = 11-30）。 */
export function addMonths(value: string, months: number): string {
  return domainAddMonths(asDay(value), months)
}

export function monthStart(value: string): string {
  return startOfMonth(asDay(value))
}

export function monthEnd(value: string): string {
  return endOfMonth(asDay(value))
}

/** ISO 周起点（周一）。 */
export function weekStart(value: string): string {
  return startOfWeek(asDay(value))
}

export function weekEnd(value: string): string {
  return endOfWeek(asDay(value))
}

export function yearStart(value: string): string {
  return startOfYear(asDay(value))
}

export function yearEnd(value: string): string {
  return endOfYear(asDay(value))
}

/** ISO 周标签 `YYYY-Www`：跨年周按周四归属年，与后端同一规则。 */
export function isoWeekLabel(value: string): string {
  return domainIsoWeekLabel(asDay(value))
}
