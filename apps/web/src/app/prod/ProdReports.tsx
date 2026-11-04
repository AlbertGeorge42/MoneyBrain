import { useMemo } from 'react'
import dayjs from 'dayjs'
import { useTheme } from '../../styles/ThemeContext'
import type { ColorScheme } from '../../styles/theme/tokens'
import { useAssetTrend } from '../../queries/analytics'
import { useBalanceSheet, useIncomeExpense } from '../../queries/report'
import { ReportsScreen } from '../../features/reports/ReportsScreen'
import {
  buildReportPeriod,
  buildReportPeriods,
  isEmptyReport,
} from '../../features/reports/reports-data'
import type { Transaction, TransactionFilters, DeviceMode } from '../../features/transactions/types'

type ProdReportsProps = {
  device: DeviceMode
  items: Transaction[]
  onRecord: () => void
  onOpenTransactions: (filters: Partial<TransactionFilters>) => void
}

type Range = { key: string; from: string; to: string; asOf: string }

function monthRange(date: dayjs.Dayjs): Range {
  return {
    key: date.format('YYYY-MM'),
    from: date.startOf('month').format('YYYY-MM-DD'),
    to: date.endOf('month').format('YYYY-MM-DD'),
    asOf: `截至 ${date.endOf('month').format('YYYY-MM-DD')}`,
  }
}

function yearRange(date: dayjs.Dayjs): Range {
  return {
    key: date.format('YYYY'),
    from: date.startOf('year').format('YYYY-MM-DD'),
    to: date.endOf('year').format('YYYY-MM-DD'),
    asOf: `截至 ${date.endOf('year').format('YYYY-MM-DD')}`,
  }
}

/** 生产报表：只取当前/上月/今年三个区间，历史翻页随区间一起加载。 */
export function ProdReports({ device, items, onRecord, onOpenTransactions }: ProdReportsProps) {
  const { theme } = useTheme()
  const scheme: ColorScheme = theme

  const ranges = useMemo(() => {
    const today = dayjs()
    return {
      current: monthRange(today),
      previous: monthRange(today.subtract(1, 'month')),
      year: yearRange(today),
    }
  }, [])

  const currentIncome = useIncomeExpense(ranges.current.from, ranges.current.to)
  const previousIncome = useIncomeExpense(ranges.previous.from, ranges.previous.to)
  const yearIncome = useIncomeExpense(ranges.year.from, ranges.year.to)
  const currentSheet = useBalanceSheet(ranges.current.to)
  const previousSheet = useBalanceSheet(ranges.previous.to)
  const yearSheet = useBalanceSheet(ranges.year.to)
  const assetTrend = useAssetTrend()

  const periods = useMemo(() => {
    const monthPeriods = [
      buildReportPeriod({
        granularity: 'month',
        ...ranges.previous,
        incomeExpense: previousIncome.data,
        balanceSheet: previousSheet.data,
      }),
      buildReportPeriod({
        granularity: 'month',
        ...ranges.current,
        incomeExpense: currentIncome.data,
        balanceSheet: currentSheet.data,
      }),
    ]
    const yearPeriods = [
      buildReportPeriod({
        granularity: 'year',
        ...ranges.year,
        incomeExpense: yearIncome.data,
        balanceSheet: yearSheet.data,
        trend: assetTrend.data?.map((point) => ({ label: point.label, value: Math.round(point.netWorth) / 100 })),
      }),
    ]
    return buildReportPeriods([...monthPeriods, ...yearPeriods])
  }, [
    ranges,
    previousIncome.data,
    previousSheet.data,
    currentIncome.data,
    currentSheet.data,
    yearIncome.data,
    yearSheet.data,
    assetTrend.data,
  ])

  const loading = currentIncome.isLoading || currentSheet.isLoading
  const error = currentIncome.isError || currentSheet.isError
  const dataState = loading ? 'loading' : error ? 'error' : isEmptyReport(currentIncome.data) ? 'empty' : 'ready'

  const retry = () => {
    void currentIncome.refetch()
    void currentSheet.refetch()
    void previousIncome.refetch()
    void previousSheet.refetch()
    void yearIncome.refetch()
    void yearSheet.refetch()
  }

  return (
    <ReportsScreen
      device={device}
      scheme={scheme}
      dataState={dataState}
      items={items}
      periods={periods}
      views={['flows', 'balance']}
      production
      onRecord={onRecord}
      onRetry={retry}
      onOpenTransactions={onOpenTransactions}
    />
  )
}
