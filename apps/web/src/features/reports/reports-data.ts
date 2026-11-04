/**
 * 生产数据适配：收支报表 + 资产负债表 → HF 报表期间（元、有符号）。
 *
 * HF 的合计口径：父项 = 子项之和；支出为负；资产负债为正。
 * 本轮只接入收支与资产负债；现金流、投资分析保留空视图并由生产壳隐藏。
 */

import type {
  BalanceSheetCategoryNode,
  ReportCategoryDetail,
} from '@contracts/types'
import type {
  BalanceSheetReportData,
  IncomeExpenseReportData,
} from '../../services/api'
import {
  formatAmount,
  formatPercent,
  formatUnsigned,
} from '../transactions/transaction-utils'
import { minorToYuan } from '../transactions/transactions-data'
import type {
  CompositionPanel,
  ReportGranularity,
  ReportMetrics,
  ReportPeriod,
  ReportRow,
  ReportTableData,
  ReportView,
  ReportViewData,
  TrendDatum,
} from './reports-mock'

const round2 = (value: number) => Math.round(value * 100) / 100

function group(id: string, label: string, children: ReportRow[]): ReportRow {
  return {
    id,
    label,
    amount: round2(children.reduce((sum, child) => sum + child.amount, 0)),
    children,
  }
}

function leaf(id: string, label: string, amount: number): ReportRow {
  return { id, label, amount }
}

function tableTotal(rows: ReportRow[]): number {
  return round2(rows.reduce((sum, row) => sum + row.amount, 0))
}

function flowRows(details: ReportCategoryDetail[] | undefined, sign: 1 | -1): ReportRow[] {
  return (details ?? []).map((detail) => {
    const children = detail.children?.map((child) =>
      leaf(child.categoryId, child.name, sign * round2(minorToYuan(child.actual))),
    )
    if (children && children.length > 0) {
      return group(detail.categoryId, detail.name, children)
    }
    return leaf(detail.categoryId, detail.name, sign * round2(minorToYuan(detail.actual)))
  })
}

function balanceRows(node: BalanceSheetCategoryNode): ReportRow {
  const children = node.children.map((account) =>
    leaf(account.id, account.name, round2(minorToYuan(account.actual))),
  )
  if (children.length > 0) return group(node.id, node.name, children)
  return leaf(node.id, node.name, round2(minorToYuan(node.actual)))
}

function flowsTables(incomeRows: ReportRow[], expenseRows: ReportRow[]): [ReportTableData, ReportTableData] {
  return [
    { id: 'income', title: '收入', kind: 'flows', format: 'signed', tone: 'income', rows: incomeRows },
    { id: 'expense', title: '支出', kind: 'flows', format: 'signed', tone: 'expense', rows: expenseRows },
  ]
}

function balanceTables(
  assetRows: ReportRow[],
  liabilityRows: ReportRow[],
  periodResult: number,
): [ReportTableData, ReportTableData] {
  const equityTotal = round2(tableTotal(assetRows) - tableTotal(liabilityRows))
  const equityRows: ReportRow[] = [
    group('equity', '权益', [
      leaf('opening-equity', '期初权益', round2(equityTotal - periodResult)),
      leaf('period-result', '本期结余', periodResult),
    ]),
  ]

  return [
    { id: 'assets', title: '资产', kind: 'balance', format: 'unsigned', tone: 'neutral', rows: assetRows },
    {
      id: 'liabilities',
      title: '负债与权益',
      kind: 'balance',
      format: 'unsigned',
      tone: 'neutral',
      rows: [...liabilityRows, ...equityRows],
    },
  ]
}

function flowsMetrics(income: number, expense: number, net: number): ReportMetrics {
  return {
    main: { label: '本期结余', value: formatAmount(net), tone: net < 0 ? 'expense' : 'income' },
    cells: [
      { label: '本期收入', value: formatAmount(income), tone: 'income' },
      { label: '本期支出', value: formatAmount(-expense), tone: 'expense' },
      { label: '储蓄率', value: formatPercent(income === 0 ? 0 : net / income), tone: 'neutral', hint: '结余 / 收入' },
    ],
  }
}

function balanceMetrics(assets: number, liabilities: number, netWorth: number): ReportMetrics {
  return {
    main: { label: '净资产', value: formatUnsigned(netWorth), tone: 'neutral' },
    cells: [
      { label: '总资产', value: formatUnsigned(assets), tone: 'neutral' },
      { label: '总负债', value: formatUnsigned(liabilities), tone: 'neutral' },
      { label: '权益合计', value: formatUnsigned(netWorth), tone: 'neutral', hint: '负债与权益合计 = 总资产' },
    ],
  }
}

function composition(
  title: string,
  rows: ReportRow[],
  tone: 'income' | 'expense' | 'neutral',
  format: 'signed' | 'unsigned',
): CompositionPanel {
  const bySize = [...rows].sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount))
  return {
    title,
    tone,
    format,
    total: tableTotal(rows),
    items: bySize.slice(0, 6).map((row) => ({ label: row.label, value: row.amount })),
  }
}

function emptyView(trend: TrendDatum[]): ReportViewData {
  return {
    metrics: {
      main: { label: '本期未接入', value: '—', tone: 'neutral' },
      cells: [
        { label: '数据来源', value: '待接入', tone: 'neutral' },
        { label: '状态', value: '已隐藏', tone: 'neutral' },
        { label: '说明', value: '本轮未接', tone: 'neutral' },
      ],
    },
    tables: [],
    trend,
    trendLabel: '暂无数据',
    composition: {
      primary: { title: '构成', tone: 'neutral', format: 'unsigned', total: 0, items: [] },
      mobileSide: 'primary',
    },
  }
}

export type ReportPeriodInput = {
  granularity: ReportGranularity
  key: string
  asOf: string
  from: string
  to: string
  incomeExpense: IncomeExpenseReportData | undefined
  balanceSheet: BalanceSheetReportData | undefined
  trend?: TrendDatum[]
}

/**
 * 单个期间：收支与资产负债表都可能还没返回（加载态），缺数据时按零生成，
 * 让组件仍走自己的四态而不是抛出。
 */
export function buildReportPeriod(input: ReportPeriodInput): ReportPeriod {
  const { granularity, key, asOf, from, to, incomeExpense, balanceSheet } = input

  const incomeRows = flowRows(incomeExpense?.incomeCategoryDetails, 1)
  const expenseRows = flowRows(incomeExpense?.expenseCategoryDetails, -1)
  const income = round2(minorToYuan(incomeExpense?.income.actual ?? 0))
  const expense = round2(minorToYuan(incomeExpense?.expense.actual ?? 0))
  const net = round2(minorToYuan(incomeExpense?.balance.actual ?? 0))

  const assetRows = (balanceSheet?.assetNodes ?? []).map(balanceRows)
  const liabilityRows = (balanceSheet?.liabilityNodes ?? []).map(balanceRows)
  const assets = round2(minorToYuan(balanceSheet?.assets.actual ?? 0))
  const liabilities = round2(minorToYuan(balanceSheet?.liabilities.actual ?? 0))
  const netWorth = round2(minorToYuan(balanceSheet?.netWorth.actual ?? 0))

  const fallbackTrend: TrendDatum[] = [{ label: key, value: net }]
  const trend = input.trend && input.trend.length > 0 ? input.trend : fallbackTrend

  const flows: ReportViewData = {
    metrics: flowsMetrics(income, expense, net),
    tables: flowsTables(incomeRows, expenseRows),
    trend,
    trendLabel: '本期结余',
    composition: {
      primary: composition('收入构成', incomeRows, 'income', 'signed'),
      secondary: composition('支出构成', expenseRows, 'expense', 'signed'),
      mobileSide: 'secondary',
    },
  }

  const balance: ReportViewData = {
    metrics: balanceMetrics(assets, liabilities, netWorth),
    tables: balanceTables(assetRows, liabilityRows, net),
    trend: [{ label: key, value: netWorth }],
    trendLabel: '期末净资产',
    composition: {
      primary: composition('资产构成', assetRows, 'neutral', 'unsigned'),
      secondary: composition('负债与权益构成', balanceTables(assetRows, liabilityRows, net)[1].rows, 'neutral', 'unsigned'),
      mobileSide: 'secondary',
    },
  }

  const views: Record<ReportView, ReportViewData> = {
    flows,
    balance,
    cash: emptyView(trend),
    investment: emptyView(trend),
  }

  return { key, granularity, label: key, asOf, from, to, views }
}

export function buildReportPeriods(periods: ReportPeriod[]): Record<ReportGranularity, ReportPeriod[]> {
  return {
    month: periods.filter((period) => period.granularity === 'month'),
    year: periods.filter((period) => period.granularity === 'year'),
  }
}

/** 空账本：收支两侧都没有可汇总类别。 */
export function isEmptyReport(incomeExpense: IncomeExpenseReportData | undefined): boolean {
  if (!incomeExpense) return true
  return (incomeExpense.incomeCategoryDetails?.length ?? 0) === 0
    && (incomeExpense.expenseCategoryDetails?.length ?? 0) === 0
}
