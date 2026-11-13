import { describe, it, expect } from 'vitest'
import {
  calculateMaxCapitalEmployed,
  calculateReturnMetrics,
  minor,
  type InvestmentCashFlow,
  type LocalDate,
} from '../../../../packages/domain/src/index.js'

// 迁移基线：固定输入 + 生产实现的输出快照。算法只在 Domain 有一份实现，
// 这里不再复制 calculateMaxCapitalEmployed / cumulativeReturn 的本地版本。

const stamp = (date: string): number => {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year!, month! - 1, day!).getTime()
}

const cf = (date: string, amount: number, kind: 'buy' | 'sell'): InvestmentCashFlow => ({
  day: date as LocalDate,
  timestamp: stamp(date),
  amount: minor(amount),
  kind,
  accountId: '1',
})

describe('期间占用资金峰值', () => {
  it('单次买入', () => {
    expect(calculateMaxCapitalEmployed([cf('2024-01-01', -10000, 'buy')])).toBe(10000)
  })

  it('先买后卖', () => {
    const flows = [
      cf('2024-01-01', -10000, 'buy'),
      cf('2024-02-01', 10000, 'sell'),
    ]
    expect(calculateMaxCapitalEmployed(flows)).toBe(10000)
  })

  it('雪球官方案例：1月买、2月卖、3月再买', () => {
    const flows = [
      cf('2024-01-01', -10000, 'buy'),
      cf('2024-02-01', 10000, 'sell'),
      cf('2024-03-01', -10000, 'buy'),
    ]
    expect(calculateMaxCapitalEmployed(flows)).toBe(10000)
  })

  it('多次买入逐步增加', () => {
    const flows = [
      cf('2024-01-01', -5000, 'buy'),
      cf('2024-02-01', -5000, 'buy'),
      cf('2024-03-01', -5000, 'buy'),
    ]
    expect(calculateMaxCapitalEmployed(flows)).toBe(15000)
  })

  it('卖出后再次买入取全局峰值', () => {
    const flows = [
      cf('2024-01-01', -10000, 'buy'),
      cf('2024-02-01', -10000, 'buy'),
      cf('2024-03-01', 15000, 'sell'),
      cf('2024-04-01', -10000, 'buy'),
    ]
    expect(calculateMaxCapitalEmployed(flows)).toBe(20000)
  })

  it('无现金流返回 0', () => {
    expect(calculateMaxCapitalEmployed([])).toBe(0)
  })

  it('只有卖出时本金不为负', () => {
    expect(calculateMaxCapitalEmployed([cf('2024-01-01', 10000, 'sell')])).toBe(0)
  })
})

describe('收益指标（生产口径基线）', () => {
  it('期初 0、买入 5000、期末 6000 → 累计收益率 20%', () => {
    const metrics = calculateReturnMetrics(
      [cf('2024-01-01', -5000, 'buy')], minor(0), minor(6000),
    )
    expect(metrics.periodInvested).toBe(5000)
    expect(metrics.periodWithdrawn).toBe(0)
    expect(metrics.netCashFlow).toBe(5000)
    expect(metrics.periodReturn).toBe(1000)
    expect(metrics.simpleReturnRate).toBe(0)
    expect(metrics.maxCapitalEmployed).toBe(5000)
    expect(metrics.cumulativeReturn).toBe(1000)
    expect(metrics.cumulativeReturnRate).toBe(20)
  })

  it('多次买入卖出：累计收益 = 期末 − 已取出 − 期初 − 已投入', () => {
    const flows = [
      cf('2024-01-01', -10000, 'buy'),
      cf('2024-02-01', -5000, 'buy'),
      cf('2024-03-01', 3000, 'sell'),
    ]
    const metrics = calculateReturnMetrics(flows, minor(0), minor(13000))
    expect(metrics.periodInvested).toBe(15000)
    expect(metrics.periodWithdrawn).toBe(3000)
    expect(metrics.maxCapitalEmployed).toBe(15000)
    expect(metrics.cumulativeReturn).toBe(-5000)
    expect(metrics.cumulativeReturnRate).toBeCloseTo(-33.33, 1)
  })

  it('占用资金峰值为 0 时收益率取 0，不除零', () => {
    const metrics = calculateReturnMetrics([], minor(0), minor(0))
    expect(metrics.maxCapitalEmployed).toBe(0)
    expect(metrics.cumulativeReturnRate).toBe(0)
  })
})
