import assert from 'node:assert/strict'
import test from 'node:test'
import {
  accountDelta,
  balanceAt,
  balanceBefore,
  budgetUsage,
  fromMajor,
  localDate,
  periodOfMonth,
  postingsOf,
  remainingRefundable,
  summarizeFlows,
  transferOutflow,
  type LedgerTransaction,
} from '../src/index.js'

const d = (value: string) => localDate(value)
const money = (value: number) => fromMajor(value)

function tx(overrides: Partial<LedgerTransaction> & Pick<LedgerTransaction, 'id' | 'kind' | 'date' | 'amount' | 'accountId'>): LedgerTransaction {
  return { ...overrides }
}

test('支出减少账户余额，收入增加账户余额', () => {
  const transactions = [
    tx({ id: '1', kind: 'income', date: d('2026-01-02'), amount: money(1000), accountId: 'A', categoryId: 'salary' }),
    tx({ id: '2', kind: 'expense', date: d('2026-01-03'), amount: money(300), accountId: 'A', categoryId: 'food' }),
  ]

  assert.equal(
    balanceAt('A', { date: d('2026-01-01'), amount: money(500) }, transactions, d('2026-01-03')),
    money(1200),
  )
})

test('期初余额当天发生的交易必须计入', () => {
  const transactions = [
    tx({ id: '1', kind: 'expense', date: d('2026-01-01'), amount: money(100), accountId: 'A', categoryId: 'food' }),
  ]

  assert.equal(
    balanceAt('A', { date: d('2026-01-01'), amount: money(1000) }, transactions, d('2026-01-01')),
    money(900),
  )
  assert.equal(
    balanceBefore('A', { date: d('2026-01-01'), amount: money(1000) }, transactions, d('2026-01-01')),
    money(1000),
  )
})

test('查询日期早于期初日期时，账户尚未存在，余额为 0', () => {
  assert.equal(
    balanceAt('A', { date: d('2026-01-10'), amount: money(1000) }, [], d('2026-01-01')),
    money(0),
  )
})

test('收入退款减少余额，支出退款增加余额', () => {
  const incomeRefund = tx({
    id: 'r1',
    kind: 'refund',
    date: d('2026-01-02'),
    amount: money(100),
    accountId: 'A',
    categoryId: 'salary',
    relatedTransactionId: 'i1',
    relatedType: 'income',
  })
  const expenseRefund = tx({
    id: 'r2',
    kind: 'refund',
    date: d('2026-01-02'),
    amount: money(30),
    accountId: 'A',
    categoryId: 'food',
    relatedTransactionId: 'e1',
    relatedType: 'expense',
  })

  assert.equal(accountDelta(incomeRefund, 'A'), money(-100))
  assert.equal(accountDelta(expenseRefund, 'A'), money(30))
})

test('转账手续费只从转出账户扣除，不会贷记到转入账户', () => {
  const transfer = tx({
    id: 't1',
    kind: 'transfer',
    date: d('2026-01-01'),
    amount: money(100),
    fee: money(5),
    coupon: money(2),
    accountId: 'A',
    toAccountId: 'B',
  })

  const postings = postingsOf(transfer)
  assert.equal(accountDelta(transfer, 'A'), money(-103))
  assert.equal(accountDelta(transfer, 'B'), money(100))
  assert.equal(postings.reduce((total, posting) => total + posting.amount, 0), 0)
  assert.equal(transferOutflow(money(100), money(5), money(2)), money(103))
})

test('优惠券超过手续费时，不会凭空增加余额', () => {
  assert.equal(transferOutflow(money(100), money(2), money(5)), money(100))
})

test('每笔交易的分录之和为 0', () => {
  const samples: LedgerTransaction[] = [
    tx({ id: '1', kind: 'income', date: d('2026-01-01'), amount: money(100), accountId: 'A', categoryId: 'salary' }),
    tx({ id: '2', kind: 'expense', date: d('2026-01-01'), amount: money(20), accountId: 'A', categoryId: 'food' }),
    tx({ id: '3', kind: 'transfer', date: d('2026-01-01'), amount: money(50), fee: money(1), accountId: 'A', toAccountId: 'B' }),
    tx({ id: '4', kind: 'refund', date: d('2026-01-01'), amount: money(10), accountId: 'A', categoryId: 'food', relatedType: 'expense' }),
    tx({ id: '5', kind: 'adjustment', date: d('2026-01-01'), amount: money(-5), accountId: 'A' }),
  ]

  for (const sample of samples) {
    assert.equal(
      postingsOf(sample).reduce((total, posting) => total + posting.amount, 0),
      0,
      sample.id,
    )
  }
})

test('收支汇总会按原交易类型冲减退款', () => {
  const transactions: LedgerTransaction[] = [
    tx({ id: 'i1', kind: 'income', date: d('2026-01-02'), amount: money(1000), accountId: 'A', categoryId: 'salary' }),
    tx({ id: 'e1', kind: 'expense', date: d('2026-01-03'), amount: money(400), accountId: 'A', categoryId: 'food' }),
    tx({ id: 'r1', kind: 'refund', date: d('2026-01-04'), amount: money(100), accountId: 'A', categoryId: 'salary', relatedType: 'income' }),
    tx({ id: 'r2', kind: 'refund', date: d('2026-01-04'), amount: money(50), accountId: 'A', categoryId: 'food', relatedType: 'expense' }),
  ]

  const summary = summarizeFlows(transactions, periodOfMonth(d('2026-01-15')))
  assert.equal(summary.netIncome, money(900))
  assert.equal(summary.netExpense, money(350))
  assert.equal(summary.balance, money(550))
})

test('不计收支的交易不进入收支汇总，但仍影响余额', () => {
  const transactions: LedgerTransaction[] = [
    tx({
      id: '1',
      kind: 'income',
      date: d('2026-01-02'),
      amount: money(1000),
      accountId: 'A',
      categoryId: 'salary',
      excludeFromIncomeExpense: true,
    }),
  ]

  assert.equal(summarizeFlows(transactions).netIncome, money(0))
  assert.equal(
    balanceAt('A', { date: d('2026-01-01'), amount: money(0) }, transactions, d('2026-01-02')),
    money(1000),
  )
})

test('预算用量按分类、账户、期间统计并冲减退款', () => {
  const categoryIds = new Set(['food', 'food-child'])
  const period = periodOfMonth(d('2026-01-15'))
  const transactions: LedgerTransaction[] = [
    tx({ id: '1', kind: 'expense', date: d('2026-01-03'), amount: money(100), accountId: 'A', categoryId: 'food' }),
    tx({ id: '2', kind: 'expense', date: d('2026-01-04'), amount: money(80), accountId: 'A', categoryId: 'food-child' }),
    tx({ id: '3', kind: 'expense', date: d('2026-01-05'), amount: money(50), accountId: 'B', categoryId: 'food' }),
    tx({ id: '4', kind: 'refund', date: d('2026-01-06'), amount: money(20), accountId: 'A', categoryId: 'food', relatedType: 'expense' }),
  ]

  assert.equal(
    budgetUsage(transactions, { kind: 'expense', period, categoryIds, accountId: 'A' }),
    money(160),
  )
})

test('退款金额不能超过原交易净额', () => {
  const original = tx({ id: 'e1', kind: 'expense', date: d('2026-01-01'), amount: money(100), accountId: 'A', categoryId: 'food' })
  const refunds = [
    tx({ id: 'r1', kind: 'refund', date: d('2026-01-02'), amount: money(30), accountId: 'A', categoryId: 'food', relatedTransactionId: 'e1', relatedType: 'expense' }),
  ]

  assert.equal(remainingRefundable(original, refunds), money(70))
})
