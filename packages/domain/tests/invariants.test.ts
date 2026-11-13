/**
 * 蓝图入口 §4 内核不变量 1–6 的属性测试（stage-0 批次 A3）。
 *
 * 用 fast-check 生成随机账本（账户期初 + 交易序列），断言每条不变量在
 * 随机输入上恒成立；每条属性按验收栏跑 1000 组。
 *
 * 生成域与真实写入路径对齐（超出写入路径的输入不生成）：
 * - 退款必带 relatedType（income / expense）；服务端写入时必然关联原交易。
 * - 退款金额可高于原额、退款账户可与原账户不同（均属合法业务）：
 *   可退余额 = max(原额 − Σ退款, 0) 恒非负、超退后归零，只是录入参考，不是上限校验。
 *   「全额退款恢复余额」只覆盖同账户情形——跨账户退款时原账户余额不恢复，属合法，不在断言范围。
 * - excludeFromIncomeExpense 只出现在收支类交易上；转账与平账本就不进收支统计。
 * - 期初余额不带日期（覆盖全部历史）；带日期时它只是锚点，锚点前后都能算余额。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import fc from 'fast-check'
import {
  addDays,
  accountDelta,
  balanceBefore,
  flowByCategory,
  localDate,
  minor,
  postingsOf,
  remainingRefundable,
  isCountable,
  refundOffsetKind,
  transferNet,
  summarizeFlows,
  type LedgerTransaction,
  type OpeningBalance,
  type TransactionKind,
} from '../src/index.js'

const ACCOUNTS = ['A', 'B', 'C'] as const
type AccountId = (typeof ACCOUNTS)[number]

/** 生成域：交易全部落在 2026-03-01 ~ 2026-03-28，期间取 [2026-02-28, 2026-04-01)。 */
const START = localDate('2026-02-28')
const END = localDate('2026-04-01')
const MAX_CENTS = 1_000_000

const dayArb = fc
  .integer({ min: 1, max: 28 })
  .map(day => localDate(`2026-03-${String(day).padStart(2, '0')}`))
const centsArb = fc.integer({ min: 0, max: MAX_CENTS })
const signedCentsArb = fc.integer({ min: -MAX_CENTS, max: MAX_CENTS })
const feeArb = fc.integer({ min: 0, max: 500 })
const accountArb = fc.constantFrom<AccountId>(...ACCOUNTS)
const categoryIdArb = fc.constantFrom('salary', 'food', 'move', null)
const relatedTypeArb = fc.constantFrom<'income' | 'expense'>('income', 'expense')

const kindArb = fc.constantFrom<TransactionKind>('income', 'expense', 'transfer', 'refund', 'adjustment')

const txArb: fc.Arbitrary<LedgerTransaction> = kindArb.chain(kind => {
  const amountArb = kind === 'adjustment' ? signedCentsArb : centsArb
  return fc
    .tuple(accountArb, accountArb, dayArb, amountArb, feeArb, feeArb, categoryIdArb, relatedTypeArb, fc.boolean())
    .map(([accountId, otherAccount, date, amount, fee, coupon, categoryId, relatedType, excluded]) => ({
      id: `${kind}-${date}-${amount}-${accountId}`,
      kind,
      date,
      amount: minor(amount),
      fee: minor(fee),
      coupon: minor(coupon),
      accountId,
      toAccountId: kind === 'transfer' ? (otherAccount === accountId ? (accountId === 'A' ? 'B' : 'A') : otherAccount) : null,
      categoryId,
      relatedTransactionId: null,
      relatedType: kind === 'refund' ? relatedType : null,
      // 转账与平账本就不进收支统计，不生成「被排除」的转账/平账
      excludeFromIncomeExpense: kind === 'income' || kind === 'expense' || kind === 'refund' ? excluded : false,
    }))
})

interface Ledger {
  openings: Record<AccountId, OpeningBalance>
  txs: LedgerTransaction[]
}

const ledgerArb: fc.Arbitrary<Ledger> = fc
  .tuple(signedCentsArb, signedCentsArb, signedCentsArb, fc.array(txArb, { minLength: 0, maxLength: 30 }))
  .map(([a, b, c, txs]) => ({
    openings: { A: { amount: minor(a) }, B: { amount: minor(b) }, C: { amount: minor(c) } },
    txs,
  }))

/** 交易对账户余额总量的影响 = 全部账户分录之和。 */
function accountEffect(transaction: LedgerTransaction): number {
  return postingsOf(transaction)
    .filter(posting => posting.kind === 'account')
    .reduce((total, posting) => total + posting.amount, 0)
}

/** 交易的收支侧分录之和（kind === 'category'）。 */
function categoryEffect(transaction: LedgerTransaction): number {
  return postingsOf(transaction)
    .filter(posting => posting.kind === 'category')
    .reduce((total, posting) => total + posting.amount, 0)
}

function netAt(ledger: Ledger, date: string): number {
  return ACCOUNTS.reduce(
    (total, account) => total + balanceBefore(account, ledger.openings[account], ledger.txs, date),
    0,
  )
}

test('不变量 1：对账恒等式——期末净资产 − 期初净资产 == 净收入 − 净支出 + 不计收支净额 + 转账净额 c−f + 平账净额', () => {
  fc.assert(
    fc.property(ledgerArb, ledger => {
      const flow = summarizeFlows(ledger.txs).balance
      const excludedNet = ledger.txs
        .filter(t => t.excludeFromIncomeExpense)
        .reduce((total, t) => total + accountEffect(t), 0)
      // 转账分录净效应 = −(X+f) + (X+c) = c − f
      const transferNetAmount = ledger.txs
        .filter(t => t.kind === 'transfer')
        .reduce((total, t) => total + transferNet(t.fee, t.coupon), 0)
      const adjustmentNet = ledger.txs
        .filter(t => t.kind === 'adjustment')
        .reduce((total, t) => total + accountEffect(t), 0)

      assert.equal(
        netAt(ledger, END) - netAt(ledger, START),
        flow + excludedNet + transferNetAmount + adjustmentNet,
      )
    }),
    { numRuns: 1000 },
  )
})

test('不变量 2：Σ 所有账户余额 == 净资产（= Σ 期初 + Σ 账户分录）', () => {
  fc.assert(
    fc.property(ledgerArb, ledger => {
      const sumOpenings = ACCOUNTS.reduce((total, account) => total + ledger.openings[account].amount, 0)
      const sumAccountPostings = ledger.txs.reduce((total, t) => total + accountEffect(t), 0)

      assert.equal(netAt(ledger, END), sumOpenings + sumAccountPostings)
    }),
    { numRuns: 1000 },
  )
})

test('不变量 3：任意交易的 Σ 分录.amount == 0（复式平衡）', () => {
  fc.assert(
    fc.property(txArb, transaction => {
      const total = postingsOf(transaction).reduce((sum, posting) => sum + posting.amount, 0)
      assert.equal(total, 0, `交易 ${transaction.id} 的分录不平衡`)
    }),
    { numRuns: 1000 },
  )
})

test('不变量 4（全额退款）：退款后余额 == 原交易前余额', () => {
  // 只覆盖同账户退款：退款账户可与原账户不同（合法业务），跨账户时原账户余额不恢复，
  // 属合法情形，不在本属性的断言范围
  const fullRefundArb = fc
    .tuple(relatedTypeArb, accountArb, dayArb, centsArb, categoryIdArb)
    .map(([relatedType, accountId, date, amount, categoryId]) => {
      const originalKind = relatedType === 'income' ? 'income' : 'expense'
      const original: LedgerTransaction = {
        id: 'original',
        kind: originalKind,
        date,
        amount: minor(amount),
        accountId,
        categoryId,
      }
      const refund: LedgerTransaction = {
        id: 'refund',
        kind: 'refund',
        date: addDays(date, 1),
        amount: minor(amount),
        accountId,
        categoryId,
        relatedTransactionId: 'original',
        relatedType,
      }
      return { accountId, original, refund }
    })

  fc.assert(
    fc.property(fullRefundArb, ({ accountId, original, refund }) => {
      const opening: OpeningBalance = { amount: minor(0) }
      const before = balanceBefore(accountId, opening, [original, refund], original.date)
      const after = balanceBefore(accountId, opening, [original, refund], addDays(refund.date, 1))

      assert.equal(after, before)
    }),
    { numRuns: 1000 },
  )
})

test('不变量 4（可退余额）：可退余额 == max(原额 − Σ退款, 0)，恒非负；超退（合法业务）后归零', () => {
  const refundSplitArb = fc
    .tuple(relatedTypeArb, fc.integer({ min: 1, max: MAX_CENTS }), fc.array(centsArb, { minLength: 0, maxLength: 5 }))
    .map(([relatedType, originalAmount, shares]) => {
      // 退款额不做上限缩放：Σ 退款可以超过原额（合法业务）
      const refunds = shares.map((share, index) => ({
        kind: 'refund' as const,
        amount: minor(share),
        relatedTransactionId: 'original',
        id: `refund-${index}`,
        relatedType,
      }))
      // 混入一笔指向其它原交易的退款：可退余额必须只统计本原交易的退款
      const noise = {
        kind: 'refund' as const,
        amount: minor(originalAmount),
        relatedTransactionId: 'other-original',
        id: 'noise',
        relatedType,
      }
      const original = { id: 'original', kind: relatedType === 'income' ? ('income' as const) : ('expense' as const), amount: minor(originalAmount) }
      return { original, refunds: [...refunds, noise] }
    })

  fc.assert(
    fc.property(refundSplitArb, ({ original, refunds }) => {
      const own = refunds.filter(r => r.relatedTransactionId === 'original')
      // 逐前缀断言：每一步的可退余额 == max(原额 − 已退合计, 0)，恒非负（超退后为 0）
      let refunded = 0
      let processed = 0
      for (const refund of own) {
        refunded += refund.amount
        processed++
        const remaining = remainingRefundable(original, own.slice(0, processed))
        assert.ok(remaining >= 0)
        assert.equal(remaining, Math.max(original.amount - refunded, 0))
      }
      // 干扰退款（指向其它原交易）不影响本原交易的可退余额
      assert.equal(remainingRefundable(original, refunds), Math.max(original.amount - refunded, 0))
    }),
    { numRuns: 1000 },
  )
})

test('不变量 5：转账满足 Δ转出 + Δ转入 == c − f，且 Σ postings = 0', () => {
  const transferArb = fc
    .tuple(accountArb, accountArb, dayArb, centsArb, feeArb, feeArb, categoryIdArb)
    .map(([accountId, otherAccount, date, amount, fee, coupon, categoryId]) => ({
      id: 'transfer',
      kind: 'transfer' as const,
      date,
      amount: minor(amount),
      fee: minor(fee),
      coupon: minor(coupon),
      accountId,
      toAccountId: otherAccount === accountId ? (accountId === 'A' ? 'B' : 'A') : otherAccount,
      categoryId,
    }))

  fc.assert(
    fc.property(transferArb, transfer => {
      const net = transferNet(transfer.fee, transfer.coupon)
      const delta =
        accountDelta(transfer, transfer.accountId) +
        accountDelta(transfer, transfer.toAccountId ?? transfer.accountId)

      assert.equal(delta - net, 0)
      assert.equal(postingsOf(transfer).reduce((total, posting) => total + posting.amount, 0), 0)
    }),
    { numRuns: 1000 },
  )
})

test('不变量 6：收支表与分类聚合可逐分录追溯到同一组 postingsOf 分录', () => {
  fc.assert(
    fc.property(ledgerArb, ledger => {
      const summary = summarizeFlows(ledger.txs)

      // 收支侧数字从 category 分录推导：收入分录为负（−amount），支出分录为正（+amount）
      let incomeSide = 0
      let expenseSide = 0
      for (const transaction of ledger.txs) {
        if (!isCountable(transaction)) continue
        const offset = transaction.kind === 'refund' ? refundOffsetKind(transaction.relatedType) : null
        if (transaction.kind === 'income' || offset === 'income') incomeSide += categoryEffect(transaction)
        if (transaction.kind === 'expense' || offset === 'expense') expenseSide += categoryEffect(transaction)
      }

      // 净收入 / 净支出与分录逐笔对应（同一组 postingsOf 的另一种读法）；
      // 写成加和 == 0，避免 -0 与 0 被 strictEqual 判为不等
      assert.equal(summary.netIncome + incomeSide, 0)
      assert.equal(summary.netExpense - expenseSide, 0)

      // 分类聚合与收支总表同源：按分类求和后与总净额一致
      const sumByCategory = (kind: 'income' | 'expense') =>
        [...flowByCategory(ledger.txs, kind).values()].reduce((total, value) => total + value, 0)
      assert.equal(sumByCategory('income'), summary.netIncome)
      assert.equal(sumByCategory('expense'), summary.netExpense)
    }),
    { numRuns: 1000 },
  )
})
