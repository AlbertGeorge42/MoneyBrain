/// <reference path="./xirr.d.ts" />
import xirr from 'xirr'
import type { InvestmentCashFlow } from './types.js'

/**
 * 年化内部收益率（百分数）。第三方求解器只在本文件出现，Domain 对外不暴露其类型。
 * 起点是期初市值的流出、终点是期末市值的流入，中间是外部现金流。
 */
export function calculateXIRR(
  startValue: number,
  cashFlows: readonly InvestmentCashFlow[],
  endValue: number,
  startMillis: number,
  endMillis: number,
): number | null {
  const transactions = [
    { amount: -startValue, when: new Date(startMillis) },
    ...cashFlows.map(cf => ({ amount: cf.amount, when: new Date(cf.timestamp) })),
    { amount: endValue, when: new Date(endMillis) },
  ]

  try {
    const rate = xirr(transactions)
    if (!isFinite(rate) || Math.abs(rate) > 10) return null
    return rate * 100
  } catch {
    return null
  }
}
