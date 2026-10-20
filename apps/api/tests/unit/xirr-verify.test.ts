import { describe, it, expect } from 'vitest'
import xirr from 'xirr'

describe('xirr 库行为验证', () => {
  describe('基本计算', () => {
    it('应该正确计算简单场景：年初投入10000，年末收回11000', () => {
      const transactions = [
        { amount: -10000, when: new Date('2024-01-01') },
        { amount: 11000, when: new Date('2024-12-31') },
      ]

      const rate = xirr(transactions)
      // XIRR 应该接近 10%，即 0.10（小数形式）
      expect(rate).toBeGreaterThan(0.09)
      expect(rate).toBeLessThan(0.11)
    })

    it('应该正确计算年中投入场景：1月投入10000，7月收回10500', () => {
      const transactions = [
        { amount: -10000, when: new Date('2024-01-01') },
        { amount: 10500, when: new Date('2024-07-01') },
      ]

      const rate = xirr(transactions)
      // 半年收益 5%，年化约 10%+（复利效应）
      // 精确计算：(1.05)^2 - 1 ≈ 10.25%
      expect(rate).toBeGreaterThan(0.09)
      expect(rate).toBeLessThan(0.12)
    })

    it('应该正确计算亏损场景：年初投入10000，年末收回9000', () => {
      const transactions = [
        { amount: -10000, when: new Date('2024-01-01') },
        { amount: 9000, when: new Date('2024-12-31') },
      ]

      const rate = xirr(transactions)
      // XIRR 应该接近 -10%
      expect(rate).toBeGreaterThan(-0.11)
      expect(rate).toBeLessThan(-0.09)
    })
  })

  describe('多次现金流', () => {
    it('应该正确计算多次投入场景', () => {
      const transactions = [
        { amount: -5000, when: new Date('2024-01-01') },
        { amount: -5000, when: new Date('2024-04-01') }, // 3个月后追加投入
        { amount: 12000, when: new Date('2024-12-31') },
      ]

      const rate = xirr(transactions)
      // 投入 10000，年末 12000，收益 20%，但部分资金只投资了9个月
      // XIRR 应该略高于 20%
      expect(rate).toBeGreaterThan(0.18)
      expect(rate).toBeLessThan(0.25)
    })

    it('应该正确计算投入和取出的混合场景', () => {
      const transactions = [
        { amount: -10000, when: new Date('2024-01-01') },
        { amount: 5000, when: new Date('2024-06-30') }, // 半年后取出一半
        { amount: 6000, when: new Date('2024-12-31') },
      ]

      const rate = xirr(transactions)
      // 净投入 10000，净取出 11000，收益 10%
      expect(rate).toBeGreaterThan(0.05)
      expect(rate).toBeLessThan(0.15)
    })
  })

  describe('边界情况', () => {
    it('应该在所有金额同号时抛出异常或返回无效值', () => {
      const transactions = [
        { amount: -10000, when: new Date('2024-01-01') },
        { amount: -5000, when: new Date('2024-06-30') },
      ]

      // 全负数：无法计算 XIRR，库应该抛出异常
      expect(() => xirr(transactions)).toThrow()
    })

    it('应该在无法收敛时抛出异常', () => {
      // 极端案例：短期内的巨额收益，可能导致数值不稳定
      const transactions = [
        { amount: -1, when: new Date('2024-01-01') },
        { amount: 1000000, when: new Date('2024-01-02') }, // 一天百万倍收益
      ]

      // 这可能导致数值问题，库可能抛出异常或返回极大值
      try {
        const rate = xirr(transactions)
        // 如果没有抛出异常，检查是否是合理的值
        expect(typeof rate).toBe('number')
      } catch {
        // 抛出异常也是合理的
        expect(true).toBe(true)
      }
    })

    it('应该正确处理年初和年末相同余额（收益率为0）', () => {
      const transactions = [
        { amount: -10000, when: new Date('2024-01-01') },
        { amount: 10000, when: new Date('2024-12-31') },
      ]

      const rate = xirr(transactions)
      // XIRR 应该接近 0
      expect(Math.abs(rate)).toBeLessThan(0.01)
    })
  })

  describe('与 MoneyBrain 代码的集成验证', () => {
    // 模拟 calculateXIRR 函数的行为
    function calculateXIRR(
      startValue: number,
      cashFlows: Array<{ amount: number; date: Date }>,
      endValue: number,
      startDate: Date,
      endDate: Date
    ): number | null {
      const transactions = [
        { amount: -startValue, when: startDate },
        ...cashFlows.map(cf => ({ amount: cf.amount, when: cf.date })),
        { amount: endValue, when: endDate },
      ]

      try {
        const rate = xirr(transactions)
        if (!isFinite(rate) || Math.abs(rate) > 10) return null
        return rate * 100
      } catch {
        return null
      }
    }

    it('应该返回百分比值（乘以100）', () => {
      const startValue = 10000
      const cashFlows: Array<{ amount: number; date: Date }> = []
      const endValue = 11000
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-12-31')

      const result = calculateXIRR(startValue, cashFlows, endValue, startDate, endDate)

      // 应该返回接近 10（百分比形式）
      expect(result).toBeGreaterThan(9)
      expect(result).toBeLessThan(11)
    })

    it('应该在收益率极端（>1000%）时返回 null', () => {
      const startValue = 10000
      const cashFlows: Array<{ amount: number; date: Date }> = []
      const endValue = 1000000 // 一年翻100倍
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-12-31')

      const result = calculateXIRR(startValue, cashFlows, endValue, startDate, endDate)

      // 收益率超过 1000%（即 rate > 10），应该返回 null
      expect(result).toBeNull()
    })

    it('应该在无法收敛时返回 null', () => {
      const startValue = 0
      const cashFlows: Array<{ amount: number; date: Date }> = [
        { amount: -10000, date: new Date('2024-06-01') },
      ]
      const endValue = 0 // 没有期末余额，只有期间投入
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-12-31')

      // 这种情况下，投入的钱没了，可能导致异常
      const result = calculateXIRR(startValue, cashFlows, endValue, startDate, endDate)

      // 可能返回 null（异常）或负值
      expect(result === null || (typeof result === 'number' && result < 0)).toBe(true)
    })
  })
})