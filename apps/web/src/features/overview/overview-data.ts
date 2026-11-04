/**
 * 生产数据适配：API 汇总 / 资产负债表 / 资产走势 → 总览页视图模型。
 *
 * 金额换算（分 → 元）只在这里发生；组件不再接触分。
 */

import dayjs from 'dayjs'
import type {
  AnalyticsAssetTrendItem,
  BalanceSheetReportData,
  DashboardSummaryData,
} from '@contracts/types'
import type { Transaction } from '../transactions/types'
import { formatUnsigned, summarize, type TransactionSummary } from '../transactions/transaction-utils'
import type { TrendPoint } from './overview-utils'
import { minorToYuan } from '../transactions/transactions-data'

export type OverviewView = {
  summary: TransactionSummary
  netWorth: number
  points: TrendPoint[]
  periodLabel: string
  asOfLabel: string
  heroCaption: string
  trendCaption: string
  incomeChange: number | null
  expenseChange: number | null
  netWorthChange: number | null
  freshLedger: boolean
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / Math.abs(previous)) * 100)
}

export function buildOverviewView(input: {
  today: string
  items: Transaction[]
  dashboard: DashboardSummaryData | undefined
  sheet: BalanceSheetReportData | undefined
  assetTrend: AnalyticsAssetTrendItem[] | undefined
  accountCount: number
}): OverviewView {
  const { today, items, dashboard, sheet, assetTrend, accountCount } = input
  const summary: TransactionSummary = dashboard
    ? {
        count: items.length,
        income: minorToYuan(dashboard.thisMonth.income),
        expense: minorToYuan(dashboard.thisMonth.expense),
        net: minorToYuan(dashboard.thisMonth.balance),
      }
    : summarize(items)

  const assets = minorToYuan(sheet?.assets.actual)
  const liabilities = minorToYuan(sheet?.liabilities.actual)
  const netWorth = minorToYuan(sheet?.netWorth.actual)

  const points: TrendPoint[] = (assetTrend ?? []).map((point) => ({
    label: point.label,
    value: minorToYuan(point.netWorth),
  }))

  return {
    summary,
    netWorth,
    points,
    periodLabel: `${dayjs(today).year()} 年 ${dayjs(today).month() + 1} 月`,
    asOfLabel: `截至 ${today}`,
    heroCaption: sheet
      ? `总资产 ${formatUnsigned(assets)} · 总负债 ${formatUnsigned(liabilities)} · ${accountCount} 个账户在用`
      : `已记 ${items.length} 笔 · ${accountCount} 个账户在用`,
    trendCaption: points.length >= 2 ? `近 ${points.length} 个月` : '再记一天，走势就会出现',
    incomeChange: dashboard
      ? percentChange(minorToYuan(dashboard.thisMonth.income), minorToYuan(dashboard.lastMonth.income))
      : null,
    expenseChange: dashboard
      ? percentChange(minorToYuan(dashboard.thisMonth.expense), minorToYuan(dashboard.lastMonth.expense))
      : null,
    netWorthChange: null,
    freshLedger: false,
  }
}
