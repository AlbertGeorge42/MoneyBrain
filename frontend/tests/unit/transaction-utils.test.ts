import { describe, it, expect } from 'vitest'
import { formatTransactionSubmitValues } from '../../src/utils/transaction'

const makeDate = (date: string) => ({ format: () => date })

describe('formatTransactionSubmitValues', () => {
  it('收入且勾选不计收支时，payload 携带 excludeFromIncomeExpense=true', () => {
    const result = formatTransactionSubmitValues(
      {
        amount: 100,
        fee: 0,
        coupon: 0,
        date: makeDate('2026-08-07'),
        accountId: 'acc-1',
        categoryId: 'cat-1',
        excludeFromIncomeExpense: true,
      },
      'income'
    )
    expect(result).toMatchObject({ type: 'income', excludeFromIncomeExpense: true })
  })

  it('支出未勾选不计收支时，payload 携带 excludeFromIncomeExpense=false', () => {
    const result = formatTransactionSubmitValues(
      {
        amount: 50,
        fee: 0,
        coupon: 0,
        date: makeDate('2026-08-07'),
        accountId: 'acc-1',
        categoryId: 'cat-1',
        excludeFromIncomeExpense: false,
      },
      'expense'
    )
    expect(result).toMatchObject({ type: 'expense', excludeFromIncomeExpense: false })
  })

  it('转账始终显式传 excludeFromIncomeExpense=false（即使表单残留 true）', () => {
    const result = formatTransactionSubmitValues(
      {
        amount: 200,
        fee: 0,
        coupon: 0,
        date: makeDate('2026-08-07'),
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        excludeFromIncomeExpense: true,
      },
      'transfer'
    )
    expect(result).toMatchObject({ type: 'transfer', excludeFromIncomeExpense: false })
  })
})
