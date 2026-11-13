import type { TwrInput, TwrResult } from './types.js'

const DAY_MS = 1000 * 60 * 60 * 24

/**
 * 本地日历日 → UTC 零点毫秒。
 * 与迁移前 `new Date(dateKey).getTime()` 数值相同，但用数值构造避免字符串解析的时区歧义。
 */
function utcMillisOfDay(day: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) return Number.NaN
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

/**
 * 时间加权收益率：按外部现金流切段，逐段用「现金流前余额 / 上段结束值」连乘，
 * 再按实际投资天数年化。余额查表由调用方注入，本函数只做纯计算。
 */
export function calculateTWR(input: TwrInput): TwrResult {
  const { startMillis, endMillis, startValue, cashFlows, balanceAt } = input
  const investmentDays = Math.max(1, (endMillis - startMillis) / DAY_MS)

  let twr = 1

  const sortedFlows = [...cashFlows].sort((a, b) => a.timestamp - b.timestamp)

  const cashFlowsByDate = new Map<string, number>()
  for (const cf of sortedFlows) {
    cashFlowsByDate.set(cf.day, (cashFlowsByDate.get(cf.day) ?? 0) + cf.amount)
  }

  let prevValue = startValue
  let prevDate = startMillis

  for (const [day, totalAmount] of cashFlowsByDate) {
    const currentDate = utcMillisOfDay(day)
    if (currentDate <= prevDate) continue

    const balanceBeforeCF = balanceAt(currentDate)

    if (prevValue > 0 && balanceBeforeCF >= 0) {
      const periodReturn = (balanceBeforeCF - prevValue) / prevValue
      const clampedReturn = Math.max(-0.99, Math.min(10, periodReturn))
      twr *= (1 + clampedReturn)
    }

    prevValue = balanceBeforeCF - totalAmount
    prevDate = currentDate
  }

  if (prevDate < endMillis) {
    const endValue = balanceAt(endMillis)
    if (prevValue > 0 && endValue >= 0) {
      const periodReturn = (endValue - prevValue) / prevValue
      const clampedReturn = Math.max(-0.99, Math.min(10, periodReturn))
      twr *= (1 + clampedReturn)
    }
  }

  twr = twr - 1

  if (!isFinite(twr) || Math.abs(twr) > 50) {
    return { twr: null, annualizedTwr: null }
  }

  const annualizedTwr = Math.pow(1 + twr, 365 / investmentDays) - 1

  if (!isFinite(annualizedTwr) || Math.abs(annualizedTwr) > 50) {
    return { twr: twr * 100, annualizedTwr: null }
  }

  return {
    twr: twr * 100,
    annualizedTwr: annualizedTwr * 100,
  }
}
