import { describe, it, expect } from 'vitest'
import {
  accumulatePredictionChanges,
  filterPredictionsUpTo,
  computePredictedAccountTotal,
  sumPredictionByType,
} from '../../src/services/report/prediction.js'

interface MockPrediction {
  date: Date
  type: string
  amount: number
  accountId: string
  toAccountId: string | null
}

describe('report-calc - 时点预测快照', () => {
  // 账户类型映射
  const accountLookup = new Map<string, { type: string }>([
    ['cash', { type: 'asset' }],
    ['savings', { type: 'asset' }],
    ['credit', { type: 'liability' }],
  ])

  describe('filterPredictionsUpTo', () => {
    it('只返回 date <= timePoint 的预测', () => {
      const predictions: MockPrediction[] = [
        { date: new Date('2025-01-10'), type: 'income', amount: 100, accountId: 'cash', toAccountId: null },
        { date: new Date('2025-01-20'), type: 'expense', amount: 50, accountId: 'cash', toAccountId: null },
        { date: new Date('2025-01-30'), type: 'income', amount: 200, accountId: 'savings', toAccountId: null },
      ]
      const filtered = filterPredictionsUpTo(predictions, new Date('2025-01-25'))
      expect(filtered).toHaveLength(2)
    })

    it('包含等于时点的预测', () => {
      const predictions: MockPrediction[] = [
        { date: new Date('2025-01-15T00:00:00'), type: 'income', amount: 100, accountId: 'cash', toAccountId: null },
      ]
      const filtered = filterPredictionsUpTo(predictions, new Date('2025-01-15T00:00:00'))
      expect(filtered).toHaveLength(1)
    })
  })

  // 迁移基线：固定输入 + 输出快照，不与 Domain 实现做长期双实现对照。
  describe('预测变化量符号口径基线', () => {
    it('income / expense 按账户累加，转账两侧分别记入', () => {
      const changes = accumulatePredictionChanges([
        { date: new Date('2025-01-10'), type: 'income', amount: 1000, accountId: 'cash', toAccountId: null },
        { date: new Date('2025-01-20'), type: 'expense', amount: 300, accountId: 'cash', toAccountId: null },
        { date: new Date('2025-01-25'), type: 'expense', amount: 200, accountId: 'credit', toAccountId: null },
        { date: new Date('2025-01-26'), type: 'transfer', amount: 500, accountId: 'cash', toAccountId: 'savings' },
      ])
      expect([...changes]).toEqual([
        ['cash', 200],
        ['credit', -200],
        ['savings', 500],
      ])
    })

    it('按账户类型汇总变动（asset / liability 分开）', () => {
      const changes = accumulatePredictionChanges([
        { date: new Date('2025-01-10'), type: 'income', amount: 1000, accountId: 'cash', toAccountId: null },
        { date: new Date('2025-01-20'), type: 'expense', amount: 300, accountId: 'cash', toAccountId: null },
        { date: new Date('2025-01-25'), type: 'expense', amount: 200, accountId: 'credit', toAccountId: null },
      ])
      expect(sumPredictionByType(changes, accountLookup)).toEqual({
        assetChange: 700,
        liabilityChange: -200,
      })
    })

    it('转账跨资产与负债账户时两侧符号相反', () => {
      const changes = accumulatePredictionChanges([
        { date: new Date('2025-01-15'), type: 'transfer', amount: 500, accountId: 'cash', toAccountId: 'credit' },
      ])
      expect([...changes]).toEqual([
        ['cash', -500],
        ['credit', 500],
      ])
      expect(sumPredictionByType(changes, accountLookup)).toEqual({
        assetChange: -500,
        liabilityChange: 500,
      })
    })
  })

  describe('computePredictedAccountTotal', () => {
    it('现金类账户：仅累计属于该集合的账户变动', () => {
      const predictions: MockPrediction[] = [
        // cash 收入 +500
        { date: new Date('2025-01-10'), type: 'income', amount: 500, accountId: 'cash', toAccountId: null },
        // savings 收入 +1000 (savings 不在 cash 集合中)
        { date: new Date('2025-01-15'), type: 'income', amount: 1000, accountId: 'savings', toAccountId: null },
        // cash 支出 -200
        { date: new Date('2025-01-20'), type: 'expense', amount: 200, accountId: 'cash', toAccountId: null },
      ]
      const cashSet = new Set(['cash'])
      const total = computePredictedAccountTotal(
        predictions,
        new Date('2025-01-31T00:00:00'),
        cashSet
      )
      expect(total).toBe(500 - 200) // 300
    })

    it('transfer 在指定集合内部抵消', () => {
      // cash -> savings（两者都在 cash 集合中）= 内部转账，外部表现为 0
      const predictions: MockPrediction[] = [
        { date: new Date('2025-01-15'), type: 'transfer', amount: 300, accountId: 'cash', toAccountId: 'savings' },
      ]
      const bothSet = new Set(['cash', 'savings'])
      const total = computePredictedAccountTotal(
        predictions,
        new Date('2025-01-31T00:00:00'),
        bothSet
      )
      expect(total).toBe(0) // -300 + 300 = 0
    })

    it('transfer 一进一出', () => {
      // 信用卡还款: from cash, to credit (cash 集合只含 cash)
      const predictions: MockPrediction[] = [
        { date: new Date('2025-01-15'), type: 'transfer', amount: 500, accountId: 'cash', toAccountId: 'credit' },
      ]
      const cashSet = new Set(['cash'])
      const total = computePredictedAccountTotal(
        predictions,
        new Date('2025-01-31T00:00:00'),
        cashSet
      )
      expect(total).toBe(-500) // 只减不加
    })

    it('历史期：返回 0', () => {
      const cashSet = new Set(['cash'])
      const total = computePredictedAccountTotal(
        [],
        new Date('2025-01-15T00:00:00'),
        cashSet
      )
      expect(total).toBe(0)
    })

    it('混合期：仅累计到时点的预测', () => {
      const predictions: MockPrediction[] = [
        { date: new Date('2025-01-10'), type: 'income', amount: 500, accountId: 'cash', toAccountId: null },
        { date: new Date('2025-01-25'), type: 'expense', amount: 100, accountId: 'cash', toAccountId: null },
      ]
      const cashSet = new Set(['cash'])
      const total = computePredictedAccountTotal(
        predictions,
        new Date('2025-01-15T00:00:00'),
        cashSet
      )
      expect(total).toBe(500) // 只累计 1/10，不累计 1/25
    })
  })
})
