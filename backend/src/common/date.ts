/**
 * 日期工具函数
 * 提供字符串日期与 Date 对象之间的本地时区转换
 */

/** 字符串日期 → 当天开始 Date (T00:00:00) */
export function dayStart(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`)
}

/** 字符串日期 → 当天结束 Date (T23:59:59.999) */
export function dayEnd(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999`)
}

/** 字符串日期 → 下一天本地零点 Date (用于余额计算的 lt 边界)
 * 按字符串拆分本地日期加一天，避免 new Date(dateStr) 的 UTC 零点偏差
 */
export function nextDay(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day + 1)
}

/** Date → 'YYYY-MM-DD' 本地格式字符串 */
export function formatDateLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
