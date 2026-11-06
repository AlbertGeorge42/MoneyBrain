import { describe, it, expect } from 'vitest'
import type { Account } from '@prisma/client'
import { buildSankey } from '../../src/services/report/cash-flow-build.js'
import type { TransactionWithIncludes } from '../../src/services/report/cash-flow-types.js'
import { minor } from '../../../../packages/domain/src/index.js'

// C4 验收：桑基图退款方向由领域层 refundOffsetKind 唯一判定——
// 支出退款计入流入侧（分类 → 现金），收入退款计入流出侧（现金 → 分类），
// 与 aggregate() 的 outflow/inflow 同一判定；relatedType 无法识别时不计入。

const makeAccount = (id: string, name: string): Account => ({
  id,
  name,
  type: 'asset',
  initialBalance: 0n,
  initialBalanceDate: null,
  icon: null,
  color: null,
  categoryId: null,
  sort: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  fromTransactions: [],
  toTransactions: [],
  fromBudgets: [],
  toBudgets: [],
  investmentAssetClasses: [],
  investmentAllocationSnapshots: [],
})

const makeRefund = (relatedType: 'income' | 'expense' | null): TransactionWithIncludes => ({
  id: `refund-${relatedType ?? 'none'}`,
  importKey: null,
  type: 'refund',
  ruleVersion: 1,
  amount: 100n,
  fee: 0n,
  coupon: 0n,
  date: new Date('2026-01-15'),
  note: null,
  accountId: 'cash',
  toAccountId: null,
  categoryId: null,
  relatedTransactionId: 'original',
  relatedType,
  excludeFromIncomeExpense: false,
  deletedAt: null,
  createdAt: new Date(),
  account: makeAccount('cash', '现金账户'),
  toAccount: null,
  category: null,
})

const makeCashTransfer = (fee = 0n): TransactionWithIncludes => ({
  id: 'transfer-cash-to-cash',
  importKey: null,
  type: 'transfer',
  ruleVersion: 1,
  amount: 100n,
  fee,
  coupon: 0n,
  date: new Date('2026-01-15'),
  note: null,
  accountId: 'cash-a',
  toAccountId: 'cash-b',
  categoryId: null,
  relatedTransactionId: null,
  relatedType: null,
  excludeFromIncomeExpense: false,
  deletedAt: null,
  createdAt: new Date(),
  account: makeAccount('cash-a', '微信零钱'),
  toAccount: makeAccount('cash-b', '支付宝'),
  category: null,
})

const buildWith = (transactions: TransactionWithIncludes[]) =>
  buildSankey({
    transactions,
    predictions: [],
    cashAccountIds: ['cash', 'cash-a', 'cash-b'],
    categoryMap: new Map(),
    accountMap: new Map([
      ['cash', { name: '现金账户' }],
      ['cash-a', { name: '微信零钱' }],
      ['cash-b', { name: '支付宝' }],
    ]),
    start: new Date('2026-01-01'),
    end: new Date('2026-02-01'),
  })

const hasLink = (sankey: Awaited<ReturnType<typeof buildWith>>, source: string, target: string) =>
  sankey.links.some((link) => link.source === source && link.target === target)

describe('buildSankey 退款方向与活动表同源（C4）', () => {
  it('支出退款计入流入侧：退款分类 → 现金', () => {
    const sankey = buildWith([makeRefund('expense')])

    expect(hasLink(sankey, '未分类_income', '现金账户_cash')).toBe(true)
    // 不得再出现现金 → 流出侧的退款链路
    expect(hasLink(sankey, '现金账户_cash', '未分类_expense')).toBe(false)
  })

  it('收入退款计入流出侧：现金 → 退款分类，与 aggregate 的 outflow 方向一致', () => {
    const sankey = buildWith([makeRefund('income')])

    expect(hasLink(sankey, '现金账户_cash', '未分类_expense')).toBe(true)
    // 不得再出现在流入侧（修复前一律按流入直取的错误方向）
    expect(hasLink(sankey, '未分类_income', '现金账户_cash')).toBe(false)
  })

  it('relatedType 无法识别时不计入（refundOffsetKind 返回 null，与 aggregate 一致）', () => {
    const sankey = buildWith([makeRefund(null)])

    expect(sankey.links).toHaveLength(0)
  })

  it('退款金额按实际值计入链路（金额 100 分）', () => {
    const sankey = buildWith([makeRefund('expense')])
    const link = sankey.links.find((item) => item.source === '未分类_income')
    expect(link?.value).toBe(minor(100))
  })
})

describe('buildSankey 现金账户内部转账（三层桑基）', () => {
  it('现金 → 现金保留账户到账户的 link，不被吞掉', () => {
    const sankey = buildWith([makeCashTransfer()])

    expect(hasLink(sankey, '微信零钱_cash', '支付宝_cash')).toBe(true)
    expect(sankey.nodes.map((node) => node.name)).toEqual(
      expect.arrayContaining(['微信零钱_cash', '支付宝_cash']),
    )
    expect(sankey.links.find((link) => link.target === '支付宝_cash')?.value).toBe(minor(100))
  })

  it('转账手续费不随本金转移：单独成为「手续费」出流节点', () => {
    const sankey = buildWith([makeCashTransfer(10n)])

    expect(hasLink(sankey, '微信零钱_cash', '支付宝_cash')).toBe(true)
    expect(sankey.links.find((link) => link.source === '微信零钱_cash' && link.target === '支付宝_cash')?.value).toBe(
      minor(100),
    )
    expect(hasLink(sankey, '微信零钱_cash', '手续费_expense')).toBe(true)
    expect(sankey.links.find((link) => link.target === '手续费_expense')?.value).toBe(minor(10))
  })
})
