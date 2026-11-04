import { describe, expect, it } from 'vitest'
import type { BalanceSheetReportData, DashboardSummaryData } from '@contracts/types'
import { buildOverviewView, percentChange } from '../../src/features/overview/overview-data'
import type { Transaction } from '../../src/features/transactions/types'

const item: Transaction = {
  id: 'tx-1',
  type: 'expense',
  amount: -34.56,
  categoryId: 'food',
  subcategory: '晚饭',
  accountId: 'acc-1',
  date: '2026-11-05',
  note: '晚饭',
}

const dashboard = {
  thisMonth: { income: 1200000, expense: 345600, balance: 854400 },
  lastMonth: { income: 1000000, expense: 0 },
} as unknown as DashboardSummaryData

const sheet = {
  assets: { actual: 5000000, predicted: 0 },
  liabilities: { actual: 1200000, predicted: 0 },
  netWorth: { actual: 3800000, predicted: 0 },
} as unknown as BalanceSheetReportData

describe('overview-data', () => {
  it('汇总与净资产来自 API，不再使用 mock', () => {
    const view = buildOverviewView({
      today: '2026-11-05',
      items: [item],
      dashboard,
      sheet,
      assetTrend: [
        { label: '2026-10', assets: 0, liabilities: 0, netWorth: 3600000 },
        { label: '2026-11', assets: 0, liabilities: 0, netWorth: 3800000 },
      ],
      accountCount: 2,
    })
    expect(view.summary.income).toBe(12000)
    expect(view.summary.expense).toBe(3456)
    expect(view.summary.net).toBe(8544)
    expect(view.netWorth).toBe(38000)
    expect(view.points.map((point) => point.value)).toEqual([36000, 38000])
    expect(view.incomeChange).toBe(20)
    expect(view.expenseChange).toBeNull()
    expect(view.netWorthChange).toBe(6)
    expect(view.periodLabel).toBe('2026 年 11 月')
    expect(view.heroCaption).toContain('总资产')
  })

  it('API 支出是负数时也归一化为正金额，净额重算不跟随 balance', () => {
    const view = buildOverviewView({
      today: '2026-11-05',
      items: [item],
      dashboard: {
        thisMonth: { income: 0, expense: -2800, balance: 2800 },
        lastMonth: { income: 0, expense: -1900 },
      } as unknown as DashboardSummaryData,
      sheet: undefined,
      assetTrend: undefined,
      accountCount: 1,
    })
    expect(view.summary.income).toBe(0)
    expect(view.summary.expense).toBe(28)
    expect(view.summary.net).toBe(-28)
  })

  it('冷启动：无流水无报表时为零，不出 mock 走势', () => {
    const view = buildOverviewView({
      today: '2026-11-05',
      items: [],
      dashboard: undefined,
      sheet: undefined,
      assetTrend: undefined,
      accountCount: 2,
    })
    expect(view.summary).toEqual({ count: 0, income: 0, expense: 0, net: 0 })
    expect(view.netWorth).toBe(0)
    expect(view.points).toEqual([])
    expect(view.freshLedger).toBe(true)
  })

  it('环比在去年同期为零时返回 null', () => {
    expect(percentChange(100, 0)).toBeNull()
    expect(percentChange(50, 100)).toBe(-50)
  })
})
