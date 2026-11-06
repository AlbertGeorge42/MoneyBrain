/**
 * 总览数据模型单测（HF 第一批）
 *
 * 覆盖净资产、本月收支、储蓄率、环比、预算（含账户过滤与超支）、走势末端联动、
 * 最近流水日分组，以及记账后账本与总览数字的联动。
 */
import { describe, expect, it } from 'vitest'
import {
  addTransaction,
  createSeedLedger,
  deriveBudgets,
  deriveNetWorthTrend,
  deriveOverview,
  groupRecentTransactions,
} from '@/features/overview/model'

describe('总览数字', () => {
  const ledger = createSeedLedger()
  const summary = deriveOverview(ledger)

  it('净资产 = 所有账户余额之和', () => {
    expect(summary.netWorth).toBe(13_738_835)
    expect(summary.previousNetWorth).toBe(13_390_000)
    expect(summary.netWorthChangePct).toBeCloseTo(2.6, 1)
  })

  it('现金等价与投资资产按账户类型拆分', () => {
    expect(summary.liquidAssets).toBe(482_620)
    expect(summary.investmentAssets).toBe(8_645_000)
  })

  it('本月收入、支出、结余与储蓄率（关联退款冲减原侧，不计收入）', () => {
    expect(summary.income).toBe(1_850_000)
    expect(summary.expense).toBe(737_510)
    expect(summary.balance).toBe(1_112_490)
    expect(summary.savingsRate).toBeCloseTo(60.13, 1)
  })

  it('收支环比', () => {
    expect(summary.incomeChangePct).toBeCloseTo(7.45, 1)
    expect(summary.expenseChangePct).toBeCloseTo(1.3, 1)
  })
})

describe('未来记录', () => {
  const ledger = createSeedLedger()
  const planned = addTransaction(ledger, {
    type: 'expense',
    categoryId: 'food',
    accountId: 'cmb',
    amount: 1_000,
    note: '计划晚餐',
    date: '2026-10-31',
  })
  const before = deriveOverview(ledger)
  const after = deriveOverview(planned)

  it('晚于今天的记录不计入总览本月收支，与流水页口径一致', () => {
    expect(after.expense).toBe(before.expense)
    expect(after.balance).toBe(before.balance)
    expect(after.income).toBe(before.income)
  })

  it('未来记录仍扣账户余额，只是不进入本月口径', () => {
    const account = planned.accounts.find((item) => item.id === 'cmb')
    const previous = ledger.accounts.find((item) => item.id === 'cmb')
    expect(account?.balance).toBe((previous?.balance ?? 0) - 1_000)
    expect(planned.transactions.find((item) => item.id === 't14')?.date).toBe('2026-10-31')
  })
})

describe('预算', () => {
  const ledger = createSeedLedger()
  const budgets = deriveBudgets(ledger)

  it('预算总量与占比（含 warning 种子，73.6%）', () => {
    expect(budgets.used).toBe(742_720)
    expect(budgets.limit).toBe(1_009_000)
    expect(budgets.percent).toBeCloseTo(73.6, 1)
  })

  it('账户过滤生效：餐饮只统计招商储蓄卡', () => {
    const food = budgets.rows.find((row) => row.id === 'b_food')
    expect(food?.used).toBe(28_600)
  })

  it('超支预算标记为 over，100% 归 warning', () => {
    const shop = budgets.rows.find((row) => row.id === 'b_shop')
    const home = budgets.rows.find((row) => row.id === 'b_home')
    expect(shop?.used).toBe(125_720)
    expect(shop?.level).toBe('over')
    expect(home?.level).toBe('warning')
  })
})

describe('走势与最近流水', () => {
  it('走势固定 12 个点，末端与净资产联动', () => {
    const points = deriveNetWorthTrend(13_738_835)
    expect(points).toHaveLength(12)
    expect(points[0].value).toBe(10_850_000)
    expect(points[points.length - 2].value).toBe(13_390_000)
    expect(points[points.length - 1].value).toBe(13_738_835)
  })

  it('最近流水按日期倒序并按日分组', () => {
    const groups = groupRecentTransactions(createSeedLedger().transactions, 3)
    expect(groups).toHaveLength(2)
    expect(groups[0].date).toBe('2026-10-28')
    expect(groups[0].label).toBe('今天 · 2026年10月28日 周三')
    expect(groups[0].items).toHaveLength(2)
    expect(groups[1].date).toBe('2026-10-27')
  })
})

describe('记账浮层：五种类型', () => {
  const ledger = createSeedLedger()
  const balanceOf = (target: typeof ledger, id: string) =>
    target.accounts.find((account) => account.id === id)?.balance ?? 0

  it('转账同时改两个账户，手续费从转出方扣', () => {
    const next = addTransaction(ledger, {
      type: 'transfer',
      categoryId: 'move',
      accountId: 'cmb',
      toAccountId: 'wx',
      amount: 20_000,
      fee: 250,
      note: '转到零钱',
    })
    expect(balanceOf(next, 'cmb')).toBe(balanceOf(ledger, 'cmb') - 20_250)
    expect(balanceOf(next, 'wx')).toBe(balanceOf(ledger, 'wx') + 20_000)
    expect(next.transactions[0].toAccountId).toBe('wx')
    expect(next.transactions[0].fee).toBe(250)
  })

  it('调整保留符号：调减直接减记余额', () => {
    const next = addTransaction(ledger, {
      type: 'adjustment',
      categoryId: 'other',
      accountId: 'cmb',
      amount: -5_000,
      note: '调减',
    })
    expect(balanceOf(next, 'cmb')).toBe(balanceOf(ledger, 'cmb') - 5_000)
    expect(next.transactions[0].amount).toBe(-5_000)
  })

  it('退款记入正向余额，自定义日期写入流水', () => {
    const next = addTransaction(ledger, {
      type: 'refund',
      categoryId: 'refund',
      accountId: 'zfb',
      amount: 3_000,
      note: '退款',
      date: '2026-10-20',
    })
    expect(balanceOf(next, 'zfb')).toBe(balanceOf(ledger, 'zfb') + 3_000)
    expect(next.transactions[0].date).toBe('2026-10-20')
  })
})

describe('记账联动', () => {
  const ledger = createSeedLedger()
  const next = addTransaction(ledger, {
    type: 'expense',
    categoryId: 'food',
    accountId: 'cmb',
    amount: 10_000,
    note: '测试午餐',
  })
  const before = deriveOverview(ledger)
  const after = deriveOverview(next)
  const afterBudgets = deriveBudgets(next)

  it('新增支出从账户余额扣除，净资产同步下降', () => {
    const account = next.accounts.find((item) => item.id === 'cmb')
    expect(account?.balance).toBe(4_813_055)
    expect(after.netWorth).toBe(before.netWorth - 10_000)
  })

  it('本月支出增加、结余减少，收入不变', () => {
    expect(after.expense).toBe(before.expense + 10_000)
    expect(after.balance).toBe(before.balance - 10_000)
    expect(after.income).toBe(before.income)
  })

  it('新流水落在今天并进入餐饮预算', () => {
    expect(next.transactions[0].date).toBe('2026-10-28')
    expect(next.transactions[0].id).toBe('t14')
    const food = afterBudgets.rows.find((row) => row.id === 'b_food')
    expect(food?.used).toBe(38_600)
  })

  it('走势末端跟随记账后的净资产', () => {
    const points = deriveNetWorthTrend(after.netWorth)
    expect(points[points.length - 1].value).toBe(after.netWorth)
  })
})
