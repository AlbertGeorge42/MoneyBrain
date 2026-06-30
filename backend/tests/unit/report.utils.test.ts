import { describe, it, expect } from 'vitest'
import {
  filterPredictionsUpTo,
  computePredictedAssetsLiabilities,
  computePredictedAccountTotal,
  sumAssetsLiabilities,
} from '../../src/services/report/report.utils.js'

interface MockPrediction {
  date: Date
  type: string
  amount: number
  accountId: string
  toAccountId: string | null
}

describe('report.utils - 时点预测快照', () => {
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

  describe('computePredictedAssetsLiabilities', () => {
    it('纯未来场景：所有预测都应纳入', () => {
      const predictions: MockPrediction[] = [
        { date: new Date('2025-01-10'), type: 'income', amount: 1000, accountId: 'cash', toAccountId: null },
        { date: new Date('2025-01-20'), type: 'expense', amount: 300, accountId: 'cash', toAccountId: null },
        { date: new Date('2025-01-25'), type: 'expense', amount: 200, accountId: 'credit', toAccountId: null },
      ]
      // 查询 1/31 时点
      const result = computePredictedAssetsLiabilities(
        predictions,
        new Date('2025-01-31T00:00:00'),
        accountLookup
      )
      // assets = 1000 - 300 = 700
      // liabilities = -(-200) = 200（accumulate 把 expense 当作 -amount，负债账户 type=liability）
      // netWorth = 1000 - 300 + (-200) = 500
      expect(result.assets).toBe(700)
      expect(result.liabilities).toBe(200)
      expect(result.netWorth).toBe(500)
    })

    it('混合期：仅累计到时点的预测', () => {
      const now = new Date('2025-01-15T12:00:00')
      const predictions: MockPrediction[] = [
        // 已经在过去：不应纳入 1/15 时点
        { date: new Date('2025-01-10'), type: 'income', amount: 500, accountId: 'cash', toAccountId: null },
        // 还在未来：应纳入
        { date: new Date('2025-01-20'), type: 'expense', amount: 100, accountId: 'cash', toAccountId: null },
      ]
      const result = computePredictedAssetsLiabilities(predictions, now, accountLookup)
      // 1/10 早于 now 1/15T12:00，不纳入；1/20 晚于 now 但晚于 now 的费用已被预测为负值
      // 等等，filterPredictionsUpTo 用的时间点是 now，1/20 > now，所以 relevant = [1/10 income 500]
      // assets = 500
      expect(result.assets).toBe(500)
      expect(result.liabilities).toBe(0)
      expect(result.netWorth).toBe(500)
    })

    it('历史期（无预测）：返回 0', () => {
      const result = computePredictedAssetsLiabilities(
        [],
        new Date('2025-01-15T00:00:00'),
        accountLookup
      )
      expect(result.assets).toBe(0)
      expect(result.liabilities).toBe(0)
      expect(result.netWorth).toBe(0)
    })

    it('transfer 在不同类型账户间的影响', () => {
      // cash(资产) -> credit(负债)：从现金账户转出到信用卡（还款）
      // 资产账户 -amount，负债账户 +amount（accumulate 把 toAccount +amount）
      // 但 type=liability 的 +amount 计入 liabilityChange（正数），所以 netWorth = -amount + amount = 0
      // 这符合"还信用卡"：现金减少、负债减少（绝对值），净资产不变
      const predictions: MockPrediction[] = [
        { date: new Date('2025-01-15'), type: 'transfer', amount: 500, accountId: 'cash', toAccountId: 'credit' },
      ]
      const result = computePredictedAssetsLiabilities(
        predictions,
        new Date('2025-01-31T00:00:00'),
        accountLookup
      )
      // assets = -500, liabilities = -(0) = 0  (accumulate 中 liabilityChange = +500, 但我们取负)
      // 等等，accumulate 内部 credit 收到 +amount，type=liability 时 liabilityChange = +500
      // 我们返回 liabilities = -liabilityChange = -500  (?)
      // 重新审视：负债增加 (即信用卡消费) 应该是 +amount from cash，所以 credit 收到 +amount 后
      // liabilityChange 累计了 +500，代表"负债变动 = +500"
      // 但我们返回 liabilities = -liabilityChange = -500
      // 这表示"负数"...
      // 看下 income-expense.service.ts 实际怎么用 predictedStartLiabilities
      // 之前的写法：predictedStartLiabilities = Math.abs(actualStartLiabilitiesBalance + predicted.liabilityChange) - actualStartLiabilities
      // 在混合期 actualStartLiabilities = 1000, liabilityChange = +500
      // = |1000 + 500| - 1000 = 1500 - 1000 = 500（负债增加 500）
      // 在纯预测期 actualStartLiabilities = 0, liabilityChange = +500
      // = |0 + 500| - 0 = 500
      // 所以"负债增加"对应 liabilityChange 为正
      // 我们要返回的正数 = 负债绝对值增加量
      // 所以应该是 liabilityChange（正数 = 负债增加），而不是 -liabilityChange
      // 让我修正...
      // 重新测试：credit +500 (transfer to credit, 视为还款)
      // 但实际语义：transfer to credit = 现金去还信用卡 = 负债绝对值减少
      // accumulate 中 credit 收到 +amount，但 credit 是 type=liability
      // 等等，type=liability 的账户余额是负的（数据库设计）或者正的？
      // 看起来：accumulate 中 transfer: fromAccount -amount, toAccount +amount
      // 信用卡还款：cash -500, credit +500 (这与"信用卡欠款减少"语义相反！)
      // 除非这个 transfer 实际是"借出"，那 from credit +500 才是对的
      // 这个语义需要看 budget 表里 transfer 的设置...
      // 不管语义如何，按当前实现：transfer 到 liability 类型账户会让 liabilityChange = +amount
      // 这代表"从负债账户的角度看，资金流入 +amount"
      // 我们报表展示"负债绝对值的增加量"，需要 = -liabilityChange
      // 但这与 income-expense 原本的 Math.abs(actual + liabilityChange) - actual 不一致
      // 原来在混合期：actual = -1000, liabilityChange = +500
      //   Math.abs(-1000 + 500) - 1000 = 500 - 1000 = -500
      // 啊不对，actualStartLiabilities = Math.abs(actualStartLiabilitiesBalance)
      //                   = Math.abs(-1000) = 1000
      //   Math.abs(-1000 + 500) - 1000 = 500 - 1000 = -500
      // 不对！actualStartLiabilitiesBalance 已经是负数了
      // 让我看 sumByType 的实现
      // sumByType(accounts, 'liability', getValue):
      //   accounts.filter(a => a.type === 'liability').reduce((sum, a) => sum + getValue(a), 0)
      // getValue = balanceCache.get(a, ...) 返回 balance 数值
      // credit 余额 -1000（负数表示负债）
      // 所以 sumByType 返回 -1000
      // result.liabilities = -1000
      // actualStartLiabilities = Math.abs(-1000) = 1000
      // 现在 transfer to credit +500
      //   sumByType 返回 -1000 + 500 = -500（因为 sum 累加时 +amount）
      //   result.liabilities = -500
      //   actualStartLiabilities = Math.abs(-500) = 500
      //   变化量 = 500 - 1000 = -500
      // 也就是"负债绝对值减少 500"
      // 用我的新实现：
      //   accumulate 中 credit +500
      //   liabilityChange = +500
      //   返回 liabilities = -liabilityChange = -500
      // 负数代表负债绝对值减少 500（与原行为一致）
      expect(result.assets).toBe(-500)
      expect(result.liabilities).toBe(-500)
      expect(result.netWorth).toBe(-500 + 500) // 0
    })
  })

  describe('sumAssetsLiabilities', () => {
    // 约定：assets / liabilities 均为正数，netWorth = assets - liabilities
    // 这是 API 层契约，修复"总负债在 UI 上显示为负数"的关键。
    it('应将负债账户负余额转换为正数负债金额', () => {
      const result = sumAssetsLiabilities(
        [
          { id: 'a1', type: 'asset' },
          { id: 'l1', type: 'liability' },
        ],
        (a) => (a.id === 'a1' ? 1000 : -300)
      )
      expect(result.assets).toBe(1000)
      expect(result.liabilities).toBe(300) // -300 → 300
      expect(result.netWorth).toBe(700)    // 1000 - 300
    })

    it('多个负债账户累加后再取绝对值（总负债金额）', () => {
      const result = sumAssetsLiabilities(
        [
          { id: 'a1', type: 'asset' },
          { id: 'l1', type: 'liability' },
          { id: 'l2', type: 'liability' },
        ],
        (a) => {
          if (a.id === 'a1') return 5000
          if (a.id === 'l1') return -2000
          if (a.id === 'l2') return -800
          return 0
        }
      )
      expect(result.assets).toBe(5000)
      expect(result.liabilities).toBe(2800) // |-2000| + |-800|
      expect(result.netWorth).toBe(2200)
    })

    it('净负债场景：负债超过资产时 netWorth 应为负数', () => {
      const result = sumAssetsLiabilities(
        [
          { id: 'a1', type: 'asset' },
          { id: 'l1', type: 'liability' },
        ],
        (a) => (a.id === 'a1' ? 1000 : -5000)
      )
      expect(result.assets).toBe(1000)
      expect(result.liabilities).toBe(5000)
      expect(result.netWorth).toBe(-4000)
    })

    it('无负债账户时 liabilities 为 0，netWorth = assets', () => {
      const result = sumAssetsLiabilities(
        [{ id: 'a1', type: 'asset' }],
        () => 1234.56
      )
      expect(result.assets).toBe(1234.56)
      expect(result.liabilities).toBe(0)
      expect(result.netWorth).toBe(1234.56)
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
