import { describe, expect, it } from 'vitest'
import { CURRENT_RULE_VERSION } from '../../../../packages/domain/src/index.js'
import { toLedgerTransaction } from '../../src/services/ledger.adapter.js'

function source(overrides: Record<string, unknown>) {
  return {
    id: 'tx-1',
    type: 'expense',
    ruleVersion: CURRENT_RULE_VERSION,
    amount: -2800n,
    fee: 0n,
    coupon: 0n,
    date: new Date('2026-11-05T00:00:00Z'),
    accountId: 'acc-1',
    categoryId: 'food',
    ...overrides,
  }
}

describe('toLedgerTransaction 金额符号', () => {
  it('支出在库里是负数，转成领域口径后为正的金额大小', () => {
    const tx = toLedgerTransaction(source({}) as never)
    expect(Number(tx.amount)).toBe(2800)
  })

  it('收入保持正数', () => {
    const tx = toLedgerTransaction(source({ type: 'income', amount: 5200n }) as never)
    expect(Number(tx.amount)).toBe(5200)
  })

  it('转账/调整是余额增量，不做符号翻转', () => {
    const tx = toLedgerTransaction(source({ type: 'adjustment', amount: -1200n }) as never)
    expect(Number(tx.amount)).toBe(-1200)
  })
})
