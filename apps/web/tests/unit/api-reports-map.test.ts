/**
 * 收支分类构成回归：真实库存在单笔历史负向支出（钱包 / 餐饮 ¥28.00），
 * 接口 detail.actual = -2800。分类构成必须按绝对值入树，并且笔数与后端真实分类 id
 * 映射回账本展示 id 后能对上，不能出现「合计有金额、构成没有数据」或 0 笔。
 */
import { describe, expect, it } from 'vitest'
import type { IncomeExpenseReportData, ReportValue } from '@contracts/types'
import { mapFlowReport } from '@/features/reports/apiReports'
import type { Ledger } from '@/features/overview/model'

function value(actual: number): ReportValue {
  return { actual, predicted: 0 }
}

const ledger: Ledger = {
  accounts: [{ id: 'wallet', name: '钱包', kind: 'cash', balance: 2_800 }],
  categories: [{ id: 'food', name: '餐饮', type: 'expense' }],
  budgets: [],
  transactions: [
    {
      id: 'tx-food',
      date: '2026-11-04',
      type: 'expense',
      categoryId: 'food',
      note: '生产冷启动',
      accountId: 'wallet',
      amount: -2_800,
    },
  ],
  // 接口分类返回后端真实 id，账本流水按展示 id 归集（真实库同名分类会被改写成种子 key）。
  ids: { categoryDisplay: { 'real-food': 'food' }, categoryReal: { food: 'real-food' } },
}

const reportData: IncomeExpenseReportData = {
  startDate: '2026-11-01',
  endDate: '2026-11-06',
  income: value(0),
  expense: value(-2_800),
  balance: value(2_800),
  reconciliation: {
    startNetWorth: 0,
    netIncome: 0,
    netExpense: -2_800,
    other: 0,
    endNetWorth: 2_800,
    difference: 0,
  },
  incomeByCategory: {},
  expenseByCategory: { 'real-food': -2_800 },
  incomeCategoryDetails: [],
  expenseCategoryDetails: [
    {
      name: '餐饮',
      actual: -2_800,
      predicted: 0,
      categoryId: 'real-food',
      hasChildren: false,
      sort: 0,
    },
  ],
  startAssets: value(0),
  startLiabilities: value(0),
  startNetWorth: value(0),
  endAssets: value(2_800),
  endLiabilities: value(0),
  endNetWorth: value(2_800),
  assetChange: value(2_800),
}

describe('mapFlowReport 分类构成', () => {
  it('负向支出的分类仍进入构成，金额与合计同口径', () => {
    const report = mapFlowReport(
      reportData,
      [{ label: '2026-11', income: 0, expense: -2_800 }],
      ledger,
      '2026-11-01',
      '2026-11-06',
    )

    expect(report.expenseTrees).toHaveLength(1)
    expect(report.expenseTrees[0]).toMatchObject({
      id: 'real-food',
      name: '餐饮',
      amount: 2_800,
      count: 1,
      share: 100,
    })
  })
})
