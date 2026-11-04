import { describe, expect, it } from 'vitest'
import type { BalanceSheetReportData, IncomeExpenseReportData } from '@contracts/types'
import {
  buildReportPeriod,
  buildReportPeriods,
  isEmptyReport,
} from '../../src/features/reports/reports-data'

const incomeExpense = {
  income: { actual: 1832000 },
  expense: { actual: 560000 },
  balance: { actual: 1272000 },
  incomeCategoryDetails: [
    {
      categoryId: 'salary',
      name: '工资',
      actual: 1832000,
      children: [
        { categoryId: 'salary-base', name: '基本工资', actual: 1800000 },
        { categoryId: 'salary-bonus', name: '奖金', actual: 32000 },
      ],
    },
  ],
  expenseCategoryDetails: [
    {
      categoryId: 'food',
      name: '餐饮',
      actual: 560000,
      children: [
        { categoryId: 'food-out', name: '外食', actual: 400000 },
        { categoryId: 'food-market', name: '买菜', actual: 160000 },
      ],
    },
  ],
} as unknown as IncomeExpenseReportData

const balanceSheet = {
  assets: { actual: 5000000 },
  liabilities: { actual: 1000000 },
  netWorth: { actual: 4000000 },
  assetNodes: [
    {
      id: 'cash',
      name: '现金等价',
      actual: 5000000,
      children: [{ id: 'acc-1', name: '现金', actual: 5000000 }],
    },
  ],
  liabilityNodes: [
    {
      id: 'debt',
      name: '负债',
      actual: 1000000,
      children: [{ id: 'acc-2', name: '信用卡', actual: 1000000 }],
    },
  ],
} as unknown as BalanceSheetReportData

describe('reports-data', () => {
  it('收支合计与父项 = 子项之和，支出为负', () => {
    const period = buildReportPeriod({
      granularity: 'month',
      key: '2026-11',
      asOf: '截至 2026-11-30',
      from: '2026-11-01',
      to: '2026-11-30',
      incomeExpense,
      balanceSheet,
    })
    const flows = period.views.flows
    expect(flows.metrics.main.value).toContain('12,720')
    expect(flows.tables[0].rows[0].amount).toBe(18320)
    expect(flows.tables[0].rows[0].children?.reduce((sum, row) => sum + row.amount, 0)).toBe(18320)
    expect(flows.tables[1].rows[0].amount).toBe(-5600)
    expect(flows.composition.primary.total).toBe(18320)
    expect(flows.composition.secondary?.total).toBe(-5600)
  })

  it('资产负债与权益合计自洽', () => {
    const period = buildReportPeriod({
      granularity: 'month',
      key: '2026-11',
      asOf: '截至 2026-11-30',
      from: '2026-11-01',
      to: '2026-11-30',
      incomeExpense,
      balanceSheet,
    })
    const balance = period.views.balance
    expect(balance.metrics.cells[0].value).toContain('50,000')
    expect(balance.tables[0].rows[0].amount).toBe(50000)
    const liabilitiesAndEquity = balance.tables[1].rows.flatMap((row) => row.children ?? [row])
    expect(liabilitiesAndEquity.reduce((sum, row) => sum + row.amount, 0)).toBe(50000)
  })

  it('冷启动空账本：空报表判定，期间为零但不抛错', () => {
    expect(isEmptyReport(undefined)).toBe(true)
    const period = buildReportPeriod({
      granularity: 'month',
      key: '2026-11',
      asOf: '截至 2026-11-30',
      from: '2026-11-01',
      to: '2026-11-30',
      incomeExpense: undefined,
      balanceSheet: undefined,
    })
    expect(period.views.flows.tables[0].rows).toEqual([])
    expect(period.views.flows.metrics.main.value).toContain('0.00')
    expect(period.views.balance.metrics.main.value).toContain('0.00')
  })

  it('按粒度分组期间', () => {
    const month = buildReportPeriod({
      granularity: 'month',
      key: '2026-11',
      asOf: '截至 2026-11-30',
      from: '2026-11-01',
      to: '2026-11-30',
      incomeExpense,
      balanceSheet,
    })
    const year = { ...month, granularity: 'year' as const, key: '2026' }
    const grouped = buildReportPeriods([month, year])
    expect(grouped.month).toHaveLength(1)
    expect(grouped.year).toHaveLength(1)
  })
})
