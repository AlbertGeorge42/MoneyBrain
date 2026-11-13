/**
 * 前端本地账本与 Domain 统一转账语义的回归基线：
 *   amount = X（本金）、fee = f、coupon = c
 *   转出账户 −(X+f)、转入账户 +(X+c)
 *
 * 覆盖四个曾经的「手算净额」落点：新建、余额回放、编辑/删除回滚、API → 本地模型映射。
 */
import { describe, expect, it } from 'vitest'
import type { Account, Minor, Transaction } from '@contracts/types'
import { addTransaction, transferAmounts, type Ledger, type LedgerTransaction } from '@/features/overview/model'
import { mapperFromLedger, toLedgerTransaction } from '@/features/overview/apiLedger'
import { accountBalancesAt } from '@/features/reports/reportsModel'
import { deleteTransactionsFromLedger, updateTransactionInLedger } from '@/features/transactions/ledgerOps'
import { makeLedger } from '../helpers/ledger'

const X = 10_000
const F = 250
const C = 150

/** 交易前的余额快照，供 addTransaction 使用。 */
function baseLedger(): Ledger {
  return makeLedger({
    accounts: [
      { id: 'a1', name: '转出', kind: 'cash', balance: 100_000 },
      { id: 'a2', name: '转入', kind: 'cash', balance: 50_000 },
    ],
  })
}

/** 交易后的余额快照（含 f / c），供回放与删除回滚使用。 */
function postTransferLedger(): Ledger {
  return makeLedger({
    accounts: [
      { id: 'a1', name: '转出', kind: 'cash', balance: 100_000 - (X + F) },
      { id: 'a2', name: '转入', kind: 'cash', balance: 50_000 + (X + C) },
    ],
  })
}

const transfer: LedgerTransaction = {
  id: 't1',
  date: '2026-10-20',
  type: 'transfer',
  categoryId: 'move',
  note: '带券转账',
  accountId: 'a1',
  toAccountId: 'a2',
  amount: X,
  fee: F,
  coupon: C,
}

const balanceOf = (ledger: Ledger, id: string) =>
  ledger.accounts.find((account) => account.id === id)?.balance ?? 0

describe('transferAmounts（单位归一）', () => {
  it('本金取绝对值，缺失的 f / c 补 0', () => {
    expect(transferAmounts({ amount: -1234, fee: 5 })).toEqual({
      principal: 1234,
      fee: 5,
      coupon: 0,
    })
  })
})

describe('addTransaction：两侧金额由 Domain 给出', () => {
  it('手续费行：转出 X+f、转入 X', () => {
    const next = addTransaction(baseLedger(), {
      type: 'transfer', categoryId: 'move', accountId: 'a1', toAccountId: 'a2',
      amount: X, fee: F, note: '',
    })
    expect(balanceOf(next, 'a1')).toBe(100_000 - (X + F))
    expect(balanceOf(next, 'a2')).toBe(50_000 + X)
  })

  it('券行：转出 X、转入 X+c，并把 coupon 写进流水', () => {
    const next = addTransaction(baseLedger(), {
      type: 'transfer', categoryId: 'move', accountId: 'a1', toAccountId: 'a2',
      amount: X, coupon: C, note: '',
    })
    expect(balanceOf(next, 'a1')).toBe(100_000 - X)
    expect(balanceOf(next, 'a2')).toBe(50_000 + X + C)
    expect(next.transactions[0].coupon).toBe(C)
  })

  it('同时有 f 和 c：转出 X+f、转入 X+c', () => {
    const next = addTransaction(baseLedger(), {
      type: 'transfer', categoryId: 'move', accountId: 'a1', toAccountId: 'a2',
      amount: X, fee: F, coupon: C, note: '',
    })
    expect(balanceOf(next, 'a1')).toBe(100_000 - (X + F))
    expect(balanceOf(next, 'a2')).toBe(50_000 + X + C)
  })
})

describe('accountBalancesAt：回放还原完整分录', () => {
  const ledger = makeLedger({
    accounts: postTransferLedger().accounts,
    transactions: [transfer],
  })

  it('锚点之前的余额 = 当前余额 + (X+f) / − (X+c)', () => {
    const before = accountBalancesAt(ledger, '2026-10-19')
    expect(before.get('a1')).toBe(100_000)
    expect(before.get('a2')).toBe(50_000)
  })

  it('锚点当日及之后不再回放该笔', () => {
    const after = accountBalancesAt(ledger, '2026-10-20')
    expect(after.get('a1')).toBe(100_000 - (X + F))
    expect(after.get('a2')).toBe(50_000 + X + C)
  })
})

describe('ledgerOps：编辑与删除的反向调整同口径', () => {
  const ledger = makeLedger({
    accounts: postTransferLedger().accounts,
    transactions: [transfer],
  })

  it('改非金额字段后余额不变（revert + apply 对称）', () => {
    const next = updateTransactionInLedger(ledger, transfer.id, {
      categoryId: 'move', accountId: 'a1', date: transfer.date,
      note: '改备注', amount: X,
    })
    expect(balanceOf(next, 'a1')).toBe(balanceOf(ledger, 'a1'))
    expect(balanceOf(next, 'a2')).toBe(balanceOf(ledger, 'a2'))
  })

  it('删除带券转账后两个账户都还原到交易前', () => {
    const next = deleteTransactionsFromLedger(ledger, [transfer.id])
    expect(balanceOf(next, 'a1')).toBe(100_000)
    expect(balanceOf(next, 'a2')).toBe(50_000)
  })
})

describe('API → 本地账本映射保留 coupon', () => {
  const apiTransaction = (patch: Partial<Transaction>): Transaction =>
    ({
      id: 't1', type: 'transfer', amount: X as Minor, fee: F as Minor, coupon: C as Minor,
      date: '2026-10-20', note: null, accountId: 'a1', categoryId: null, toAccountId: 'a2',
      relatedTransactionId: null, relatedType: null, excludeFromIncomeExpense: true,
      deletedAt: null, account: {} as Account, category: null, toAccount: null,
      relatedTransaction: null, refunds: [], createdAt: '',
      ...patch,
    }) as Transaction

  it('X / f / c 三列全部带入页面模型', () => {
    const mapped = toLedgerTransaction(
      apiTransaction({ coupon: C as Minor }),
      mapperFromLedger(makeLedger()),
    )
    expect(mapped.amount).toBe(X)
    expect(mapped.fee).toBe(F)
    expect(mapped.coupon).toBe(C)
  })
})
