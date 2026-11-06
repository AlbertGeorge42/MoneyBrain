/**
 * 真实库存在单笔历史负向支出（钱包 / 餐饮 ¥28.00），接口 expense.actual = -2800。
 * 收支方向由前端前缀承担，映射层只取金额绝对值，不能再拼出「−-¥28.00」。
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
  expenseByCategory: { food: -2_800 },
  incomeCategoryDetails: [],
  expenseCategoryDetails: [],
  startAssets: value(0),
  startLiabilities: value(0),
  startNetWorth: value(0),
  endAssets: value(2_800),
  endLiabilities: value(0),
  endNetWorth: value(2_800),
  assetChange: value(2_800),
}

describe('mapFlowReport 负向支出显示', () => {
  it('支出金额取绝对值，指标不再拼出「−-¥28.00」', () => {
    const report = mapFlowReport(
      reportData,
      [{ label: '2026-11', income: 0, expense: -2_800 }],
      ledger,
      '2026-11-01',
      '2026-11-06',
    )
    const expenseMetric = report.metrics.find((item) => item.label === '本期支出')?.value

    expect(report.expense).toBe(2_800)
    expect(expenseMetric).toBe('−¥28.00')
    expect(expenseMetric).not.toBe('−-¥28.00')
  })
})
