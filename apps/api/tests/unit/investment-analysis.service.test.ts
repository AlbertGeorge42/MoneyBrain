import { describe, it, expect } from 'vitest'

interface CashFlow {
  date: Date
  amount: number
  type: 'buy' | 'sell'
  accountId: string
  accountName: string
}

function calculateMaxCapitalEmployed(cashFlows: CashFlow[]): number {
  let maxCapital = 0
  let currentCapital = 0

  const sortedFlows = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime())

  for (const cf of sortedFlows) {
    if (cf.type === 'buy') {
      currentCapital += Math.abs(cf.amount)
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

function calculateCumulativeReturn(
  endValue: number,
  periodWithdrawn: number,
  periodInvested: number
): number {
  return endValue + periodWithdrawn - periodInvested
}

function calculateCumulativeReturnRate(
  cumulativeReturn: number,
  maxCapitalEmployed: number
): number {
  return maxCapitalEmployed !== 0 ? (cumulativeReturn / maxCapitalEmployed) * 100 : 0
}

describe('雪球累计收益率算法', () => {
  describe('calculateMaxCapitalEmployed', () => {
    it('应该正确计算只有一次买入的最高本金', () => {
      const cashFlows: CashFlow[] = [
        { date: new Date('2024-01-01'), amount: -10000, type: 'buy', accountId: '1', accountName: '账户1' },
      ]

      const result = calculateMaxCapitalEmployed(cashFlows)
      expect(result).toBe(10000)
    })

    it('应该正确计算先买后卖的最高本金', () => {
      const cashFlows: CashFlow[] = [
        { date: new Date('2024-01-01'), amount: -10000, type: 'buy', accountId: '1', accountName: '账户1' },
        { date: new Date('2024-02-01'), amount: 10000, type: 'sell', accountId: '1', accountName: '账户1' },
      ]

      const result = calculateMaxCapitalEmployed(cashFlows)
      expect(result).toBe(10000)
    })

    it('应该正确计算雪球官方案例：1月买10000，2月卖10000，3月再买10000', () => {
      const cashFlows: CashFlow[] = [
        { date: new Date('2024-01-01'), amount: -10000, type: 'buy', accountId: '1', accountName: '账户1' },
        { date: new Date('2024-02-01'), amount: 10000, type: 'sell', accountId: '1', accountName: '账户1' },
        { date: new Date('2024-03-01'), amount: -10000, type: 'buy', accountId: '1', accountName: '账户1' },
      ]

      const result = calculateMaxCapitalEmployed(cashFlows)
      expect(result).toBe(10000)
    })

    it('应该正确计算多次买入逐步增加的最高本金', () => {
      const cashFlows: CashFlow[] = [
        { date: new Date('2024-01-01'), amount: -5000, type: 'buy', accountId: '1', accountName: '账户1' },
        { date: new Date('2024-02-01'), amount: -5000, type: 'buy', accountId: '1', accountName: '账户1' },
        { date: new Date('2024-03-01'), amount: -5000, type: 'buy', accountId: '1', accountName: '账户1' },
      ]

      const result = calculateMaxCapitalEmployed(cashFlows)
      expect(result).toBe(15000)
    })

    it('应该正确计算卖出后再次买入的最高本金', () => {
      const cashFlows: CashFlow[] = [
        { date: new Date('2024-01-01'), amount: -10000, type: 'buy', accountId: '1', accountName: '账户1' },
        { date: new Date('2024-02-01'), amount: -10000, type: 'buy', accountId: '1', accountName: '账户1' },
        { date: new Date('2024-03-01'), amount: 15000, type: 'sell', accountId: '1', accountName: '账户1' },
        { date: new Date('2024-04-01'), amount: -10000, type: 'buy', accountId: '1', accountName: '账户1' },
      ]

      const result = calculateMaxCapitalEmployed(cashFlows)
      expect(result).toBe(20000)
    })

    it('应该在没有现金流时返回0', () => {
      const cashFlows: CashFlow[] = []

      const result = calculateMaxCapitalEmployed(cashFlows)
      expect(result).toBe(0)
    })

    it('应该在只有卖出时返回0', () => {
      const cashFlows: CashFlow[] = [
        { date: new Date('2024-01-01'), amount: 10000, type: 'sell', accountId: '1', accountName: '账户1' },
      ]

      const result = calculateMaxCapitalEmployed(cashFlows)
      expect(result).toBe(0)
    })
  })

  describe('calculateCumulativeReturn', () => {
    it('应该正确计算期末市值为12000，投入20000，取出10000的累计收益', () => {
      const result = calculateCumulativeReturn(12000, 10000, 20000)
      expect(result).toBe(2000)
    })

    it('应该正确计算亏损情况', () => {
      const result = calculateCumulativeReturn(8000, 5000, 20000)
      expect(result).toBe(-7000)
    })
  })

  describe('calculateCumulativeReturnRate', () => {
    it('应该正确计算雪球官方案例的累计收益率', () => {
      const cumulativeReturn = 2000
      const maxCapital = 10000

      const result = calculateCumulativeReturnRate(cumulativeReturn, maxCapital)
      expect(result).toBe(20)
    })

    it('应该在最高本金为0时返回0', () => {
      const result = calculateCumulativeReturnRate(1000, 0)
      expect(result).toBe(0)
    })
  })

  describe('完整场景：雪球累计收益率计算', () => {
    it('应该正确计算期初为0，期间买入5000，期末6000的累计收益率', () => {
      const cashFlows: CashFlow[] = [
        { date: new Date('2024-01-01'), amount: -5000, type: 'buy', accountId: '1', accountName: '账户1' },
      ]

      const endValue = 6000
      const periodInvested = 5000
      const periodWithdrawn = 0

      const maxCapitalEmployed = calculateMaxCapitalEmployed(cashFlows)
      const cumulativeReturn = calculateCumulativeReturn(endValue, periodWithdrawn, periodInvested)
      const cumulativeReturnRate = calculateCumulativeReturnRate(cumulativeReturn, maxCapitalEmployed)

      expect(maxCapitalEmployed).toBe(5000)
      expect(cumulativeReturn).toBe(1000)
      expect(cumulativeReturnRate).toBe(20)
    })

    it('应该正确计算复杂场景：多次买入卖出后的累计收益率', () => {
      const cashFlows: CashFlow[] = [
        { date: new Date('2024-01-01'), amount: -10000, type: 'buy', accountId: '1', accountName: '账户1' },
        { date: new Date('2024-02-01'), amount: -5000, type: 'buy', accountId: '1', accountName: '账户1' },
        { date: new Date('2024-03-01'), amount: 3000, type: 'sell', accountId: '1', accountName: '账户1' },
      ]

      const endValue = 13000
      const periodInvested = 15000
      const periodWithdrawn = 3000

      const maxCapitalEmployed = calculateMaxCapitalEmployed(cashFlows)
      const cumulativeReturn = calculateCumulativeReturn(endValue, periodWithdrawn, periodInvested)
      const cumulativeReturnRate = calculateCumulativeReturnRate(cumulativeReturn, maxCapitalEmployed)

      expect(maxCapitalEmployed).toBe(15000)
      expect(cumulativeReturn).toBe(1000)
      expect(cumulativeReturnRate).toBeCloseTo(6.67, 1)
    })
  })
})

describe('日期参数校验', () => {
  it('应该正确识别有效日期格式', () => {
    const validDateStr = '2024-01-15'
    const date = new Date(validDateStr)
    expect(isNaN(date.getTime())).toBe(false)
  })

  it('应该正确识别无效日期格式', () => {
    const invalidDateStr = 'not-a-date'
    const date = new Date(invalidDateStr)
    expect(isNaN(date.getTime())).toBe(true)
  })

  it('应该正确判断日期顺序', () => {
    const startDate = new Date('2024-01-01')
    const endDate = new Date('2024-12-31')

    expect(startDate <= endDate).toBe(true)
    expect(endDate >= startDate).toBe(true)
  })
})
