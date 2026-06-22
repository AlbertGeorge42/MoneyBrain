import React, { useMemo, useState } from 'react'
import { Card, Tabs } from 'antd'
import dayjs from 'dayjs'
import { PageHeader } from '../components/common'
import { AccountConfigModal, CashFlowConfigModal, TransactionConfigModal } from '../components/settings'
import { BalanceSheetReport, CashFlowReport, IncomeExpenseReport, InvestmentAnalysisReport } from '../components/reports'
import InvestmentAssetClassConfigModal from '../components/investment/InvestmentAssetClassConfigModal'
import InvestmentSnapshotHistoryModal from '../components/investment/InvestmentSnapshotHistoryModal'
import type { PointTimePickerConfig, PointTimeValue, RangeTimePickerConfig, RangeTimeValue } from '../components/common'
import {
  createPointMonthEndPreset,
  createPointMonthStartPreset,
  createPointPeriodPreset,
  createPointValue,
  createQuarterRangePreset,
  createRangePeriodPreset,
  createTrailingRangePreset,
  createYearToDatePreset,
  toDateParam,
  toDateRangeParams,
} from '../utils/timePicker'
import {
  useTransactionEarliestDate,
  useBalanceSheet,
  useIncomeExpense,
  useCashFlow,
  useInvestmentAnalysis,
} from '../queries'

const baseBalanceSheetPickerConfig: Omit<PointTimePickerConfig, 'minDate' | 'maxDate'> = {
  label: '时点',
  allowedGranularities: ['day', 'month', 'year'],
  presets: {
    day: [
      createPointPeriodPreset('today', '今天', 'day'),
      createPointPeriodPreset('yesterday', '昨天', 'day', -1),
      createPointMonthStartPreset('month-start', '月初'),
      createPointMonthEndPreset('month-end', '月末'),
    ],
    month: [
      createPointPeriodPreset('current-month', '本月', 'month'),
      createPointPeriodPreset('previous-month', '上月', 'month', -1),
      createPointPeriodPreset('year-start', '1月', 'month', -dayjs().month()),
      createPointPeriodPreset('year-end', '12月', 'month', 11 - dayjs().month()),
    ],
    year: [
      createPointPeriodPreset('current-year', '今年', 'year'),
      createPointPeriodPreset('previous-year', '去年', 'year', -1),
      createPointPeriodPreset('3-years-ago', '3年前', 'year', -3),
    ],
  },
}

const baseIncomeExpensePickerConfig: Omit<RangeTimePickerConfig, 'minDate' | 'maxDate'> = {
  label: '周期',
  allowedGranularities: ['day', 'month', 'year'],
  presets: {
    day: [
      createRangePeriodPreset('today', '今天', 'day'),
      createTrailingRangePreset('last-7-days', '近7天', 7, 'day'),
      createTrailingRangePreset('last-30-days', '近30天', 30, 'day'),
      createYearToDatePreset('year-to-date', '年初至今'),
    ],
    month: [
      createRangePeriodPreset('current-month', '本月', 'month'),
      createRangePeriodPreset('previous-month', '上月', 'month', -1),
      createQuarterRangePreset('current-quarter', '本季'),
      createQuarterRangePreset('previous-quarter', '上季', -1),
    ],
    year: [
      createRangePeriodPreset('current-year', '今年', 'year'),
      createRangePeriodPreset('previous-year', '去年', 'year', -1),
      createTrailingRangePreset('last-3-years', '近3年', 3, 'year'),
    ],
  },
}

const baseCashFlowPickerConfig: Omit<RangeTimePickerConfig, 'minDate' | 'maxDate'> = {
  label: '周期',
  allowedGranularities: ['day', 'month', 'year'],
  presets: {
    day: [
      createRangePeriodPreset('today', '今天', 'day'),
      createTrailingRangePreset('last-30-days', '近30天', 30, 'day'),
      createTrailingRangePreset('last-90-days', '近90天', 90, 'day'),
      createYearToDatePreset('year-to-date', '年初至今'),
    ],
    month: [
      createRangePeriodPreset('current-month', '本月', 'month'),
      createRangePeriodPreset('previous-month', '上月', 'month', -1),
      createTrailingRangePreset('last-6-months', '近6个月', 6, 'month'),
      createTrailingRangePreset('last-12-months', '近12个月', 12, 'month'),
    ],
    year: [
      createRangePeriodPreset('current-year', '今年', 'year'),
      createRangePeriodPreset('previous-year', '去年', 'year', -1),
      createTrailingRangePreset('last-3-years', '近3年', 3, 'year'),
    ],
  },
}

const baseInvestmentPickerConfig: Omit<RangeTimePickerConfig, 'minDate' | 'maxDate'> = {
  label: '周期',
  allowedGranularities: ['month', 'year'],
  presets: {
    month: [
      createTrailingRangePreset('last-3-months', '近3个月', 3, 'month'),
      createTrailingRangePreset('last-6-months', '近6个月', 6, 'month'),
      createTrailingRangePreset('last-12-months', '近12个月', 12, 'month'),
      createTrailingRangePreset('last-36-months', '近36个月', 36, 'month'),
    ],
    year: [
      createRangePeriodPreset('current-year', '今年', 'year'),
      createRangePeriodPreset('previous-year', '去年', 'year', -1),
      createTrailingRangePreset('last-3-years', '近3年', 3, 'year'),
    ],
  },
}

const Reports: React.FC = () => {
  const [activeTab, setActiveTab] = useState('balance-sheet')
  const [selectedBalanceTime, setSelectedBalanceTime] = useState<PointTimeValue>(createPointValue('month', dayjs()))
  const [accountCategoryModalVisible, setAccountCategoryModalVisible] = useState(false)
  const [incomeExpenseTimeRange, setIncomeExpenseTimeRange] = useState<RangeTimeValue>(
    createRangePeriodPreset('current-month', '本月', 'month').getValue(dayjs())
  )
  const [transactionCategoryModalVisible, setTransactionCategoryModalVisible] = useState(false)
  const [cashFlowTimeRange, setCashFlowTimeRange] = useState<RangeTimeValue>(
    createRangePeriodPreset('current-month', '本月', 'month').getValue(dayjs())
  )
  const [cashFlowConfigModalVisible, setCashFlowConfigModalVisible] = useState(false)
  const [investmentTimeRange, setInvestmentTimeRange] = useState<RangeTimeValue>(
    createTrailingRangePreset('last-12-months', '近12个月', 12, 'month').getValue(dayjs())
  )
  const [investmentConfigModalVisible, setInvestmentConfigModalVisible] = useState(false)
  const [investmentSnapshotModalVisible, setInvestmentSnapshotModalVisible] = useState(false)

  const { data: earliestDateData } = useTransactionEarliestDate()
  const earliestTransactionDate = earliestDateData?.date || null

  const balanceSheetDate = useMemo(() => toDateParam(selectedBalanceTime), [selectedBalanceTime])
  const { data: balanceSheetData, isLoading: balanceSheetLoading, refetch: refetchBalanceSheet } = useBalanceSheet(
    balanceSheetDate,
    activeTab === 'balance-sheet'
  )

  const incomeExpenseParams = useMemo(() => toDateRangeParams(incomeExpenseTimeRange), [incomeExpenseTimeRange])
  const { data: incomeExpenseData, isLoading: incomeExpenseLoading, refetch: refetchIncomeExpense } = useIncomeExpense(
    incomeExpenseParams.startDate,
    incomeExpenseParams.endDate,
    true,
    activeTab === 'income-expense'
  )

  const cashFlowParams = useMemo(() => toDateRangeParams(cashFlowTimeRange), [cashFlowTimeRange])
  const { data: cashFlowData, isLoading: cashFlowLoading, refetch: refetchCashFlow } = useCashFlow(
    cashFlowParams.startDate,
    cashFlowParams.endDate,
    true,
    activeTab === 'cash-flow'
  )

  const investmentParams = useMemo(() => toDateRangeParams(investmentTimeRange), [investmentTimeRange])
  const { data: investmentData, isLoading: investmentLoading, refetch: refetchInvestment } = useInvestmentAnalysis(
    investmentParams.startDate,
    investmentParams.endDate,
    activeTab === 'investment-analysis'
  )

  const balanceSheetPickerConfig = useMemo<PointTimePickerConfig>(
    () => ({
      ...baseBalanceSheetPickerConfig,
      minDate: earliestTransactionDate ? dayjs(earliestTransactionDate) : undefined,
    }),
    [earliestTransactionDate]
  )

  const incomeExpensePickerConfig = useMemo<RangeTimePickerConfig>(
    () => ({
      ...baseIncomeExpensePickerConfig,
      minDate: earliestTransactionDate ? dayjs(earliestTransactionDate) : undefined,
    }),
    [earliestTransactionDate]
  )

  const cashFlowPickerConfig = useMemo<RangeTimePickerConfig>(
    () => ({
      ...baseCashFlowPickerConfig,
      minDate: earliestTransactionDate ? dayjs(earliestTransactionDate) : undefined,
    }),
    [earliestTransactionDate]
  )

  const investmentPickerConfig = useMemo<RangeTimePickerConfig>(
    () => ({
      ...baseInvestmentPickerConfig,
      minDate: earliestTransactionDate ? dayjs(earliestTransactionDate) : undefined,
    }),
    [earliestTransactionDate]
  )

  const tabItems = [
    {
      key: 'balance-sheet',
      label: '资产负债表',
      children: (
        <BalanceSheetReport
          selectedTime={selectedBalanceTime}
          pickerConfig={balanceSheetPickerConfig}
          balanceSheetData={balanceSheetData ?? null}
          loading={balanceSheetLoading}
          onTimeChange={setSelectedBalanceTime}
          onOpenSettings={() => setAccountCategoryModalVisible(true)}
        />
      ),
    },
    {
      key: 'income-expense',
      label: '收入支出表',
      children: (
        <IncomeExpenseReport
          timeRange={incomeExpenseTimeRange}
          pickerConfig={incomeExpensePickerConfig}
          incomeExpenseData={incomeExpenseData ?? null}
          loading={incomeExpenseLoading}
          onTimeRangeChange={setIncomeExpenseTimeRange}
          onOpenSettings={() => setTransactionCategoryModalVisible(true)}
        />
      ),
    },
    {
      key: 'cash-flow',
      label: '现金流量表',
      children: (
        <CashFlowReport
          timeRange={cashFlowTimeRange}
          pickerConfig={cashFlowPickerConfig}
          cashFlowData={cashFlowData ?? null}
          loading={cashFlowLoading}
          onTimeRangeChange={setCashFlowTimeRange}
          onOpenSettings={() => setCashFlowConfigModalVisible(true)}
        />
      ),
    },
    {
      key: 'investment-analysis',
      label: '投资分析表',
      children: (
        <InvestmentAnalysisReport
          timeRange={investmentTimeRange}
          pickerConfig={investmentPickerConfig}
          investmentData={investmentData ?? null}
          loading={investmentLoading}
          onTimeRangeChange={setInvestmentTimeRange}
          onOpenSettings={() => setInvestmentConfigModalVisible(true)}
          onOpenSnapshotHistory={() => setInvestmentSnapshotModalVisible(true)}
        />
      ),
    },
  ]

  return (
    <>
      <PageHeader eyebrow="Reports" title="财务报表" description="集中查看资产、收支、现金流和投资表现。" />

      <Card className="surface-card report-shell-card">
        <Tabs className="report-tabs" activeKey={activeTab} onChange={setActiveTab} items={tabItems} size="small" />
      </Card>

      <AccountConfigModal
        visible={accountCategoryModalVisible}
        onClose={() => {
          setAccountCategoryModalVisible(false)
          void refetchBalanceSheet()
        }}
      />

      <TransactionConfigModal
        visible={transactionCategoryModalVisible}
        onClose={() => {
          setTransactionCategoryModalVisible(false)
          void refetchIncomeExpense()
        }}
      />

      <CashFlowConfigModal
        visible={cashFlowConfigModalVisible}
        onClose={() => {
          setCashFlowConfigModalVisible(false)
          void refetchCashFlow()
        }}
      />

      <InvestmentAssetClassConfigModal
        visible={investmentConfigModalVisible}
        onClose={() => {
          setInvestmentConfigModalVisible(false)
          void refetchInvestment()
        }}
      />

      <InvestmentSnapshotHistoryModal
        visible={investmentSnapshotModalVisible}
        onClose={() => {
          setInvestmentSnapshotModalVisible(false)
        }}
        onRefresh={refetchInvestment}
      />
    </>
  )
}

export default Reports
