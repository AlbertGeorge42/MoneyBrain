import { dayStart, dayEnd, nextDay } from '../../common/date.js'
import { ValidationError } from '../../common/index.js'

// ===== 报表期间解析 =====

export type DateGranularity = 'day' | 'month' | 'year'

export interface ReportPeriod {
  startDate: Date
  endDate: Date
  nextDay: Date
  granularity: DateGranularity
}

/**
 * 统一报表日期解析入口。
 *
 * 两个重载：
 * - 单日期（balance-sheet）：支持 YYYY-MM-DD / YYYY-MM / YYYY
 *   endDate 始终是该周期最后一刻（如月末 23:59:59.999），nextDay 是下一周期第一刻
 * - 起止日期（income-expense / cash-flow / investment-analysis）：
 *   endDate = dayEnd(endDateStr), nextDay = dayStart(endDateStr + 1)
 *
 * 原来四份报表各自实现一份解析逻辑，且 cash-flow/investment-analysis 用的是内联字符串拼接；
 * 统一后只需保留一份实现，且所有报表都从 `dayStart/dayEnd/nextDay` 出处取值，
 * 避免某些报表绕过 `dayStart` 引起的本地时区偏差。
 */
export function resolveReportPeriod(date: string): ReportPeriod
export function resolveReportPeriod(startDate: string, endDate: string): ReportPeriod
export function resolveReportPeriod(
  dateOrStart: string,
  endDateStr?: string,
): ReportPeriod {
  if (endDateStr !== undefined) {
    return {
      startDate: dayStart(dateOrStart),
      endDate: dayEnd(endDateStr),
      nextDay: nextDay(endDateStr),
      granularity: 'day',
    }
  }

  const date = dateOrStart
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      startDate: dayStart(date),
      endDate: dayEnd(date),
      nextDay: nextDay(date),
      granularity: 'day',
    }
  }
  if (/^\d{4}-\d{2}$/.test(date)) {
    const [year, month] = date.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    return {
      // 月初 00:00:00.000
      startDate: new Date(year, month - 1, 1),
      // 月末 23:59:59.999（通过 dayEnd 取本地时区末刻）
      endDate: dayEnd(`${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`),
      // 下月 1 号 00:00:00.000（Date 自动处理 month=12 跨年）
      nextDay: new Date(year, month, 1),
      granularity: 'month',
    }
  }
  if (/^\d{4}$/.test(date)) {
    return {
      startDate: new Date(Number(date), 0, 1),
      endDate: dayEnd(`${date}-12-31`),
      nextDay: nextDay(`${date}-12-31`),
      granularity: 'year',
    }
  }
  throw new ValidationError('无效的日期格式，支持格式：YYYY-MM-DD、YYYY-MM、YYYY')
}

// ===== 月份范围 =====

/**
 * 生成从 start 到 end 的逐月日期范围（每月1号）。
 * 包含 start 所在月份和 end 所在月份。
 */
export function generateMonthRange(start: Date, end: Date): Date[] {
  const months: Date[] = []
  const current = new Date(start.getFullYear(), start.getMonth(), 1)
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1)
  while (current <= endMonth) {
    months.push(new Date(current))
    current.setMonth(current.getMonth() + 1)
  }
  return months
}
