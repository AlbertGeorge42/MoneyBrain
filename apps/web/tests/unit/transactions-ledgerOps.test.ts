import { describe, expect, it } from 'vitest'
import type { Ledger, LedgerTransaction } from '@/features/overview/model'
import { updateTransactionInLedger } from '@/features/transactions/ledgerOps'

function makeLedger(transactions: LedgerTransaction[]): Ledger {
  return {
    accounts: [{ id: 'a1', name: '现金', kind: 'cash', balance: 1_000_000 }],
    categories: [],
    budgets: [],
    transactions,
  }
}

const adjustment: LedgerTransaction = {
  id: 't-adjust',
  date: '2026-10-20',
  type: 'adjustment',
  categoryId: 'c-adjust',
  note: '对账修正',
  accountId: 'a1',
  amount: -500,
}

const expense: LedgerTransaction = {
  id: 't-expense',
  date: '2026-10-21',
  type: 'expense',
  categoryId: 'c-food',
  note: '午餐',
  accountId: 'a1',
  amount: 30,
}

describe('updateTransactionInLedger', () => {
  it('编辑调整流水的非金额字段时余额不变', () => {
    const next = updateTransactionInLedger(makeLedger([adjustment]), adjustment.id, {
      categoryId: 'c-adjust',
      accountId: 'a1',
      date: '2026-10-22',
      note: '改为月末对账',
      amount: adjustment.amount,
    })

    expect(next.accounts[0].balance).toBe(1_000_000)
    expect(next.transactions[0].note).toBe('改为月末对账')
  })

  it('调整流水的负数金额保留符号并据此更新余额', () => {
    const next = updateTransactionInLedger(makeLedger([adjustment]), adjustment.id, {
      categoryId: 'c-adjust',
      accountId: 'a1',
      date: adjustment.date,
      note: adjustment.note,
      amount: -800,
    })

    expect(next.transactions[0].amount).toBe(-800)
    expect(next.accounts[0].balance).toBe(1_000_000 - 300)
  })

  it('支出编辑仍按绝对值写入并保持扣减方向', () => {
    const next = updateTransactionInLedger(makeLedger([expense]), expense.id, {
      categoryId: 'c-food',
      accountId: 'a1',
      date: expense.date,
      note: expense.note,
      amount: -45,
    })

    expect(next.transactions[0].amount).toBe(45)
    expect(next.accounts[0].balance).toBe(1_000_000 - 15)
  })
})
