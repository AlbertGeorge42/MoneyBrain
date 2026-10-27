import { describe, it, expect } from 'vitest'
import { CURRENT_RULE_VERSION, minor } from '../../../../packages/domain/src/index.js'
import { aggregate } from '../../src/services/report/cash-flow-aggregate.js'
import type { ProcessedTx } from '../../src/services/report/cash-flow-types.js'

const item = (overrides: Partial<ProcessedTx> = {}): ProcessedTx => ({
  isPredicted: false,
  ruleVersion: CURRENT_RULE_VERSION,
  type: 'expense',
  relatedType: null,
  amount: minor(100),
  fee: minor(0),
  coupon: minor(0),
  isFromCash: true,
  isToCash: false,
  categoryName: '餐饮',
  categoryId: 'food',
  parentId: null,
  level: 1,
  cashFlowType: 'operating',
  accountName: '现金',
  toAccountName: null,
  icon: null,
  color: null,
  ...overrides,
})

describe('现金流量表退款方向', () => {
  it('支出退款（钱流回）算作流入', () => {
    const result = aggregate([
      item({ type: 'refund', relatedType: 'expense', amount: minor(30) }),
    ])

    expect(result.operating.inflow).toBe(30)
    expect(result.operating.outflow).toBe(0)
    expect(result.flowByAccount['现金'].inflow).toBe(30)
  })

  it('收入退款（钱流出）算作流出', () => {
    const result = aggregate([
      item({ type: 'refund', relatedType: 'income', amount: minor(30) }),
    ])

    expect(result.operating.inflow).toBe(0)
    expect(result.operating.outflow).toBe(-30)
    expect(result.flowByAccount['现金'].outflow).toBe(-30)
  })

  it('原交易类型不明的退款不计入现金流', () => {
    const result = aggregate([
      item({ type: 'refund', relatedType: null, amount: minor(30) }),
    ])

    expect(result.operating.inflow).toBe(0)
    expect(result.operating.outflow).toBe(0)
  })

  it('收支与退款的净额自洽', () => {
    const result = aggregate([
      item({ type: 'income', amount: minor(1000) }),
      item({ type: 'expense', amount: minor(300) }),
      item({ type: 'refund', relatedType: 'expense', amount: minor(50) }),
      item({ type: 'refund', relatedType: 'income', amount: minor(200) }),
    ])

    // 流入 1000 + 50（支出退款）；流出 300 + 200（收入退款）
    expect(result.operating.inflow).toBe(1050)
    expect(result.operating.outflow).toBe(-500)
  })
})
