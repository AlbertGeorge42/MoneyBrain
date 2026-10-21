import { describe, it, expect } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library.js'
import { aggregate } from '../../src/services/report/cash-flow-aggregate.js'
import type { ProcessedTx } from '../../src/services/report/cash-flow-types.js'

const item = (overrides: Partial<ProcessedTx> = {}): ProcessedTx => ({
  isPredicted: false,
  type: 'expense',
  relatedType: null,
  amount: new Decimal(100),
  fee: new Decimal(0),
  coupon: new Decimal(0),
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
      item({ type: 'refund', relatedType: 'expense', amount: new Decimal(30) }),
    ])

    expect(result.operating.inflow.toNumber()).toBe(30)
    expect(result.operating.outflow.toNumber()).toBe(0)
    expect(result.flowByAccount['现金'].inflow.toNumber()).toBe(30)
  })

  it('收入退款（钱流出）算作流出', () => {
    const result = aggregate([
      item({ type: 'refund', relatedType: 'income', amount: new Decimal(30) }),
    ])

    expect(result.operating.inflow.toNumber()).toBe(0)
    expect(result.operating.outflow.toNumber()).toBe(-30)
    expect(result.flowByAccount['现金'].outflow.toNumber()).toBe(-30)
  })

  it('原交易类型不明的退款不计入现金流', () => {
    const result = aggregate([
      item({ type: 'refund', relatedType: null, amount: new Decimal(30) }),
    ])

    expect(result.operating.inflow.toNumber()).toBe(0)
    expect(result.operating.outflow.toNumber()).toBe(0)
  })

  it('收支与退款的净额自洽', () => {
    const result = aggregate([
      item({ type: 'income', amount: new Decimal(1000) }),
      item({ type: 'expense', amount: new Decimal(300) }),
      item({ type: 'refund', relatedType: 'expense', amount: new Decimal(50) }),
      item({ type: 'refund', relatedType: 'income', amount: new Decimal(200) }),
    ])

    // 流入 1000 + 50（支出退款）；流出 300 + 200（收入退款）
    expect(result.operating.inflow.toNumber()).toBe(1050)
    expect(result.operating.outflow.toNumber()).toBe(-500)
  })
})
