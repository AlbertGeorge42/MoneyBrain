import { abs, minor, sub, sum, type Minor } from '../money.js'
import type { InvestmentCashFlow, ReturnMetrics } from './types.js'

/** 期间占用资金峰值：按时间排序逐笔推进，本金不为负。 */
export function calculateMaxCapitalEmployed(
  cashFlows: readonly InvestmentCashFlow[],
  startValue: number = 0,
): number {
  let maxCapital = startValue
  let currentCapital = startValue

  const sortedFlows = [...cashFlows].sort((a, b) => a.timestamp - b.timestamp)

  for (const cf of sortedFlows) {
    if (cf.kind === 'buy') {
      currentCapital += abs(cf.amount)
    } else {
      currentCapital -= cf.amount
    }
    if (currentCapital < 0) {
      currentCapital = 0
    }
    maxCapital = Math.max(maxCapital, currentCapital)
  }

  return maxCapital
}

/**
 * 期间 / 累计收益指标。
 * 累计收益 = 期末 − 已取出 − 期初 − 已投入；分母是期间占用资金峰值。
 */
export function calculateReturnMetrics(
  cashFlows: readonly InvestmentCashFlow[],
  startValue: Minor,
  endValue: Minor,
): ReturnMetrics {
  const periodInvested = sum(cashFlows
    .filter(cf => cf.kind === 'buy')
    .map(cf => abs(cf.amount)))
  const periodWithdrawn = sum(cashFlows
    .filter(cf => cf.kind === 'sell')
    .map(cf => cf.amount))
  const netCashFlow = sub(periodInvested, periodWithdrawn)

  const periodReturn = sub(sub(endValue, startValue), netCashFlow)
  const simpleReturnRate = startValue !== 0 ? (periodReturn / startValue) * 100 : 0

  const maxCapitalEmployed = minor(calculateMaxCapitalEmployed(cashFlows, startValue))
  const cumulativeReturn = sub(sub(sub(endValue, periodWithdrawn), startValue), periodInvested)
  const cumulativeReturnRate = maxCapitalEmployed !== 0 ? (cumulativeReturn / maxCapitalEmployed) * 100 : 0

  return {
    periodInvested,
    periodWithdrawn,
    netCashFlow,
    periodReturn,
    simpleReturnRate,
    maxCapitalEmployed,
    cumulativeReturn,
    cumulativeReturnRate,
  }
}
