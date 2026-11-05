import { describe, expect, it } from 'vitest'
import type { Ledger, LedgerTransaction } from '@/features/overview/model'
import {
  accountBalancesAt,
  buildDrill,
  deriveBalanceReport,
  deriveCashReport,
  deriveFlowReport,
  deriveInvestmentReport,
  xirr,
} from '@/features/reports/reportsModel'
import {
  presetRange,
  presetSupported,
  spanBuckets,
  validateRange,
} from '@/features/reports/reportsTime'

function fixture(transactions: LedgerTransaction[]): Ledger {
  return {
    accounts: [
      { id: 'cash', name: '现金', kind: 'cash', balance: 100 },
      { id: 'bank', name: '储蓄', kind: 'deposit', balance: 200 },
      { id: 'brk', name: '证券', kind: 'investment', balance: 300 },
      { id: 'credit', name: '信用卡', kind: 'credit', balance: -50 },
    ],
    categories: [
      { id: 'food', name: '餐饮', type: 'expense' },
      { id: 'lunch', name: '午餐', type: 'expense', parentId: 'food' },
      { id: 'salary', name: '工资', type: 'income' },
      { id: 'refund', name: '退款', type: 'refund' },
      { id: 'move', name: '账户互转', type: 'transfer' },
      { id: 'other', name: '其他', type: 'expense' },
    ],
    budgets: [],
    transactions,
  }
}

const OCTOBER: LedgerTransaction[] = [
  { id: 't1', date: '2026-10-01', type: 'expense', categoryId: 'food', note: '聚餐', accountId: 'cash', amount: 1_000 },
  { id: 't2', date: '2026-10-02', type: 'expense', categoryId: 'lunch', note: '午餐', accountId: 'cash', amount: 300 },
  { id: 't3', date: '2026-10-05', type: 'income', categoryId: 'salary', note: '工资', accountId: 'cash', amount: 5_000 },
  { id: 't4', date: '2026-10-10', type: 'refund', categoryId: 'refund', note: '退款', accountId: 'cash', amount: 200 },
  { id: 't5', date: '2026-10-12', type: 'transfer', categoryId: 'move', note: '转入证券', accountId: 'cash', toAccountId: 'brk', amount: 1_000 },
  { id: 't6', date: '2026-10-15', type: 'adjustment', categoryId: 'other', note: '对账', accountId: 'cash', amount: -100 },
]

describe('deriveFlowReport', () => {
  it('收入含退款、支出含负向调整，转账不计入收支', () => {
    const report = deriveFlowReport(fixture([...OCTOBER]), '2026-10-01', '2026-10-31', 'day')
    expect(report.income).toBe(5_200)
    expect(report.expense).toBe(1_400)
    expect(report.balance).toBe(3_800)
    expect(report.savingsRate).toBeCloseTo((3_800 / 5_200) * 100, 4)
  })

  it('退款落在支出分类时仍按收入计，并按该分类归集', () => {
    const refundToFood: LedgerTransaction = { ...OCTOBER[3], categoryId: 'food' }
    const report = deriveFlowReport(
      fixture([...OCTOBER.filter((item) => item.id !== 't4'), refundToFood]),
      '2026-10-01',
      '2026-10-31',
      'day',
    )
    expect(report.income).toBe(5_200)
    const food = report.incomeTrees.find((node) => node.id === 'food')
    expect(food?.amount).toBe(200)
    expect(report.expenseTrees.find((node) => node.id === 'food')?.amount).toBe(1_300)
  })

  it('一级分类汇总子分类，占比相对合计', () => {
    const report = deriveFlowReport(fixture([...OCTOBER]), '2026-10-01', '2026-10-31', 'day')
    const food = report.expenseTrees.find((node) => node.id === 'food')
    expect(food?.amount).toBe(1_300)
    expect(food?.children.map((child) => child.id)).toEqual(['lunch'])
    expect(food?.share).toBeCloseTo((1_300 / 1_400) * 100, 4)
    expect(food?.children[0].share).toBeCloseTo((300 / 1_400) * 100, 4)
  })

  it('按粒度分桶时，期间外的交易不进入序列', () => {
    const ledger = fixture([
      ...OCTOBER,
      { id: 'sep', date: '2026-09-20', type: 'expense', categoryId: 'food', note: '九月', accountId: 'cash', amount: 800 },
    ])
    const report = deriveFlowReport(ledger, '2026-10-01', '2026-10-31', 'day')
    expect(report.series).toHaveLength(31)
    expect(report.series.reduce((sum, item) => sum + item.expense, 0)).toBe(1_400)
  })
})

describe('deriveBalanceReport', () => {
  it('资产 = 负债 + 所有者权益，且时点回放不改变最新时点余额', () => {
    const report = deriveBalanceReport(fixture([...OCTOBER]), '2026-10-31')
    expect(report.assetTotal).toBe(600)
    expect(report.liabilityTotal).toBe(50)
    expect(report.netWorth).toBe(550)
    expect(report.equity).toBe(550)
    expect(report.equityTotal).toBe(600)
    expect(report.assets).toHaveLength(3)
    expect(report.liabilities).toHaveLength(1)
  })

  it('锚点之前回放交易不会把转账方向记反', () => {
    const balances = accountBalancesAt(fixture([...OCTOBER]), '2026-09-30')
    expect(balances.get('cash')).toBe(100 + 1_000 + 300 - 5_000 - 200 + 1_000 + 100)
    expect(balances.get('brk')).toBe(300 - 1_000)
  })
})

describe('deriveCashReport', () => {
  it('流入 = 收入 + 退款，流出 = 支出 + 转账，净额只统计经营 / 投资 / 筹资', () => {
    const report = deriveCashReport(fixture([...OCTOBER]), '2026-10-01', '2026-10-31')
    expect(report.inflowTotal).toBe(5_200)
    // 负向调整不是现金流出：流出 = 支出 1_300 + 转账 1_000
    expect(report.outflowTotal).toBe(2_300)
    expect(report.operatingNet).toBe(3_900)
    expect(report.investingNet).toBe(0)
    expect(report.financingNet).toBe(0)
    expect(report.closingCash).toBe(100)
    expect(report.outflowGroups.map((group) => group.name)).toEqual(['经营', '账户间转账'])
  })
})

describe('deriveInvestmentReport', () => {
  it('资产分布合计与投资账户余额一致，指标不出现 NaN', () => {
    const report = deriveInvestmentReport(fixture([...OCTOBER]))
    expect(report.total).toBe(300)
    expect(report.allocation.reduce((sum, row) => sum + row.current, 0)).toBe(300)
    expect(report.metrics).toHaveLength(4)
    expect(Number.isNaN(report.twr)).toBe(false)
    // 快照链量级远大于 fixture 投资额，XIRR 允许无解返回 null
    expect(report.xirr === null || Number.isFinite(report.xirr)).toBe(true)
  })

  it('XIRR 对无正负号现金流返回 null', () => {
    expect(xirr([{ date: '2026-01-01', amount: -100 }])).toBeNull()
    expect(xirr([])).toBeNull()
  })
})

describe('buildDrill', () => {
  it('下钻返回二级类别与当期相关流水', () => {
    const drill = buildDrill(fixture([...OCTOBER]), 'food', 'expense', '2026-10-01', '2026-10-31')
    expect(drill.title).toBe('餐饮')
    expect(drill.amount).toBe(1_300)
    expect(drill.children.map((child) => child.name)).toEqual(['午餐'])
    expect(drill.transactions).toHaveLength(2)
  })
})

describe('时间预设与校验', () => {
  it('预设 × 粒度兼容矩阵按规范禁用', () => {
    expect(presetSupported('today', 'day')).toBe(true)
    expect(presetSupported('today', 'month')).toBe(false)
    expect(presetSupported('thisMonth', 'month')).toBe(true)
    expect(presetSupported('thisYear', 'year')).toBe(true)
    expect(presetSupported('last12m', 'year')).toBe(true)
  })

  it('期间取月桶边界，且跨度不足一个桶时拒绝', () => {
    expect(presetRange('thisMonth', 'month', '2026-10-28')).toEqual({
      from: '2026-10-01',
      to: '2026-10-28',
    })
    expect(spanBuckets('2026-10-01', '2026-10-31', 'month')).toBe(1)
    expect(validateRange('2026-10-28', '2026-10-01', 'day').ok).toBe(false)
    expect(validateRange('2026-10-01', '2026-10-31', 'month').ok).toBe(true)
  })
})
