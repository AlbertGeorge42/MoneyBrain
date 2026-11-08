/** 日历日纯函数：内部值统一 `YYYY-MM-DD`，解析/格式化都按 UTC 零点，不受时区影响。 */

export function parseDay(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}
