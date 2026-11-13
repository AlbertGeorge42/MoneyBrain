import { describe, it, expect } from 'vitest'
import {
  accumulatePredictedChanges,
  predictedAccountTotal,
  sumPredictedByType,
} from '../../../../packages/domain/src/index.js'
import { toPredictedEvents } from '../../src/services/report/prediction-source.js'
import type { PredictionTransaction } from '../../src/services/report/cash-flow-types.js'

interface MockPrediction {
  date: Date
  type: string
  amount: number
  accountId: string
  toAccountId: string | null
}

/** 预算点位 DTO → 领域事件：测试与生产走同一个 API 边界映射。 */
const eventsOf = (rows: MockPrediction[]) => toPredictedEvents(rows.map((row) => ({
  ...row,
  note: null,
  categoryId: null,
  budgetId: 'budget',
  budgetName: '预算',
}) satisfies PredictionTransaction))

const at = (date: string) => new Date(date).getTime()

describe('report-calc - 时点预测快照', () => {
  const accountLookup = new Map<string, { type: string }>([
    ['cash', { type: 'asset' }],
    ['savings', { type: 'asset' }],
    ['credit', { type: 'liability' }],
  ])

  describe('时点过滤（闭区间含等号）', () => {
    it('只累计 date <= timePoint 的预测', () => {
      const events = eventsOf([
        { date: new Date('2025-01-10'), type: 'income', amount: 100, accountId: 'cash', toAccountId: null },
        { date: new Date('2025-01-20'), type: 'expense', amount: 50, accountId: 'cash', toAccountId: null },
        { date: new Date('2025-01-30'), type: 'income', amount: 200, accountId: 'savings', toAccountId: null },
      ])
      expect(predictedAccountTotal(events, at('2025-01-25'), new Set(['cash', 'savings']))).toBe(50)
    })

    it('包含等于时点的预测', () => {
      const events = eventsOf([
        { date: new Date('2025-01-15T00:00:00'), type: 'income', amount: 100, accountId: 'cash', toAccountId: null },
      ])
      expect(predictedAccountTotal(events, new Date('2025-01-15T00:00:00').getTime(), new Set(['cash']))).toBe(100)
    })
  })

  // 迁移基线：固定输入 + 输出快照，不与 Domain 实现做长期双实现对照。
  // 预测点位统一走复式分录，不再保留手写 income/expense/transfer 符号表。
  describe('预测变化量符号口径基线', () => {
    it('income / expense 按账户累加，转账两侧分别记入', () => {
      const changes = accumulatePredictedChanges(eventsOf([
        { date: new Date('2025-01-10'), type: 'income', amount: 1000, accountId: 'cash', toAccountId: null },
        { date: new Date('2025-01-20'), type: 'expense', amount: 300, accountId: 'cash', toAccountId: null },
        { date: new Date('2025-01-25'), type: 'expense', amount: 200, accountId: 'credit', toAccountId: null },
        { date: new Date('2025-01-26'), type: 'transfer', amount: 500, accountId: 'cash', toAccountId: 'savings' },
      ]))
      expect([...changes]).toEqual([
        ['cash', 200],
        ['credit', -200],
        ['savings', 500],
      ])
    })

    it('按账户类型汇总变动（asset / liability 分开）', () => {
      const changes = accumulatePredictedChanges(eventsOf([
        { date: new Date('2025-01-10'), type: 'income', amount: 1000, accountId: 'cash', toAccountId: null },
        { date: new Date('2025-01-20'), type: 'expense', amount: 300, accountId: 'cash', toAccountId: null },
        { date: new Date('2025-01-25'), type: 'expense', amount: 200, accountId: 'credit', toAccountId: null },
      ]))
      expect(sumPredictedByType(changes, accountLookup)).toEqual({
        assetChange: 700,
        liabilityChange: -200,
      })
    })

    it('转账跨资产与负债账户时两侧符号相反', () => {
      const changes = accumulatePredictedChanges(eventsOf([
        { date: new Date('2025-01-15'), type: 'transfer', amount: 500, accountId: 'cash', toAccountId: 'credit' },
      ]))
      expect([...changes]).toEqual([
        ['cash', -500],
        ['credit', 500],
      ])
      expect(sumPredictedByType(changes, accountLookup)).toEqual({
        assetChange: -500,
        liabilityChange: 500,
      })
    })
  })

  describe('指定账户集合的时点预测总额', () => {
    it('仅累计属于该集合的账户变动', () => {
      const events = eventsOf([
        { date: new Date('2025-01-10'), type: 'income', amount: 500, accountId: 'cash', toAccountId: null },
        { date: new Date('2025-01-15'), type: 'income', amount: 1000, accountId: 'savings', toAccountId: null },
        { date: new Date('2025-01-20'), type: 'expense', amount: 200, accountId: 'cash', toAccountId: null },
      ])
      expect(predictedAccountTotal(events, new Date('2025-01-31T00:00:00').getTime(), new Set(['cash']))).toBe(300)
    })

    it('transfer 在指定集合内部抵消', () => {
      const events = eventsOf([
        { date: new Date('2025-01-15'), type: 'transfer', amount: 300, accountId: 'cash', toAccountId: 'savings' },
      ])
      expect(predictedAccountTotal(events, new Date('2025-01-31T00:00:00').getTime(), new Set(['cash', 'savings']))).toBe(0)
    })

    it('transfer 一进一出', () => {
      const events = eventsOf([
        { date: new Date('2025-01-15'), type: 'transfer', amount: 500, accountId: 'cash', toAccountId: 'credit' },
      ])
      expect(predictedAccountTotal(events, new Date('2025-01-31T00:00:00').getTime(), new Set(['cash']))).toBe(-500)
    })

    it('历史期：返回 0', () => {
      expect(predictedAccountTotal([], new Date('2025-01-15T00:00:00').getTime(), new Set(['cash']))).toBe(0)
    })

    it('混合期：仅累计到时点的预测', () => {
      const events = eventsOf([
        { date: new Date('2025-01-10'), type: 'income', amount: 500, accountId: 'cash', toAccountId: null },
        { date: new Date('2025-01-25'), type: 'expense', amount: 100, accountId: 'cash', toAccountId: null },
      ])
      expect(predictedAccountTotal(events, new Date('2025-01-15T00:00:00').getTime(), new Set(['cash']))).toBe(500)
    })
  })
})
