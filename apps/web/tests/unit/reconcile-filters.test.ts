/**
 * 口径修正：流水页合计只统计真实收支，平账（adjustment）不混入收入/支出/净额。
 */
import { describe, expect, it } from 'vitest'
import { summarizeTransactions } from '@/features/transactions/filters'
import type { LedgerTransaction } from '@/features/overview/model'

const tx = (overrides: Partial<LedgerTransaction>): LedgerTransaction => ({
  id: 't',
  date: '2026-11-02',
  type: 'expense',
  categoryId: '',
  note: '',
  accountId: 'acc',
  amount: 0,
  ...overrides,
})

describe('流水页合计排除 adjustment', () => {
  it('正负平账都不计入收入/支出/净额', () => {
    const totals = summarizeTransactions([
      tx({ id: 'income', type: 'income', amount: 5_000 }),
      tx({ id: 'expense', type: 'expense', amount: 2_000 }),
      tx({ id: 'adj-up', type: 'adjustment', amount: 1_200 }),
      tx({ id: 'adj-down', type: 'adjustment', amount: -500 }),
    ])

    expect(totals.count).toBe(4)
    expect(totals.income).toBe(5_000)
    expect(totals.expense).toBe(2_000)
    expect(totals.net).toBe(3_000)
  })

  it('只有平账时合计为零', () => {
    const totals = summarizeTransactions([
      tx({ id: 'adj', type: 'adjustment', amount: 800 }),
    ])

    expect(totals.income).toBe(0)
    expect(totals.expense).toBe(0)
    expect(totals.net).toBe(0)
  })
})
