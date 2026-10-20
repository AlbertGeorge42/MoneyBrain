import React, { useMemo, useState } from 'react'
import { Card, Tabs } from 'antd'
import dayjs from 'dayjs'
import { ErrorState, PageHeader } from '../components/common'
import { AccountConfigModal, CashFlowConfigModal, TransactionConfigModal } from '../components/settings'
import { BalanceSheetReport, CashFlowReport, IncomeExpenseReport, InvestmentAnalysisReport } from '../components/reports'
import InvestmentAssetClassConfigModal from '../components/investment/InvestmentAssetClassConfigModal'
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
  fromPointTimeParam,
  fromRangeTimeParam,
  toPointTimeParam,
  toRangeTimeParam,
} from '../utils/timePicker'
import {
  useTransactionEarliestDate,
  useBalanceSheet,
  useIncomeExpense,
  useCashFlow,
  useInvestmentAnalysis,
} from '../queries'
import { useSearchParamsState } from '../hooks/useSearchParamsState'
import { STORAGE_KEYS } from '../utils/storageKeys'

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
  // ── 查询状态 → URL（影响数据查询，可分享） ──

  // 当前报表的默认值需要基于"当前时间"动态计算
  const defaultReportState = useMemo(() => ({
    activeTab: 'balance-sheet',
    balanceDate: createPointValue('month', dayjs()),
    incomeExpenseRange: createRangePeriodPreset('current-month', '本月', 'month').getValue(dayjs()),
    incomeExpenseIncludeExcluded: false,
    cashFlowRange: createRangePeriodPreset('current-month', '本月', 'month').getValue(dayjs()),
    investmentRange: createTrailingRangePreset('last-12-months', '近12个月', 12, 'month').getValue(dayjs()),
  }), [])

  const [reportState, setReportState] = useSearchParamsState<{
    activeTab: string
    balanceDate: PointTimeValue
    incomeExpenseRange: RangeTimeValue
    incomeExpenseIncludeExcluded: boolean
    cashFlowRange: RangeTimeValue
    investmentRange: RangeTimeValue
  }>({
    defaultValue: defaultReportState,
    storageKey: STORAGE_KEYS.reports.state,
    parse: (params) => ({
      activeTab: params.get('tab') ?? defaultReportState.activeTab,
      balanceDate: params.get('balanceDate')
        ? fromPointTimeParam(params.get('balanceDate')!)
        : defaultReportState.balanceDate,
      incomeExpenseRange: params.get('incomeExpense')
        ? fromRangeTimeParam(params.get('incomeExpense')!) ?? defaultReportState.incomeExpenseRange
        : defaultReportState.incomeExpenseRange,
      incomeExpenseIncludeExcluded: params.get('includeExcluded') === '1',
      cashFlowRange: params.get('cashFlow')
        ? fromRangeTimeParam(params.get('cashFlow')!) ?? defaultReportState.cashFlowRange
        : defaultReportState.cashFlowRange,
      investmentRange: params.get('investment')
        ? fromRangeTimeParam(params.get('investment')!) ?? defaultReportState.investmentRange
        : defaultReportState.investmentRange,
    }),
    serialize: (value) => {
      const p = new URLSearchParams()
      if (value.activeTab !== defaultReportState.activeTab) p.set('tab', value.activeTab)
      const balanceStr = toPointTimeParam(value.balanceDate)
      const defaultBalanceStr = toPointTimeParam(defaultReportState.balanceDate)
      if (balanceStr !== defaultBalanceStr) p.set('balanceDate', balanceStr)
      const ieStr = toRangeTimeParam(value.incomeExpenseRange)
      const defaultIeStr = toRangeTimeParam(defaultReportState.incomeExpenseRange)
      if (ieStr !== defaultIeStr) p.set('incomeExpense', ieStr)
      if (value.incomeExpenseIncludeExcluded) p.set('includeExcluded', '1')
      const cfStr = toRangeTimeParam(value.cashFlowRange)
      const defaultCfStr = toRangeTimeParam(defaultReportState.cashFlowRange)
      if (cfStr !== defaultCfStr) p.set('cashFlow', cfStr)
      const invStr = toRangeTimeParam(value.investmentRange)
      const defaultInvStr = toRangeTimeParam(defaultReportState.investmentRange)
      if (invStr !== defaultInvStr) p.set('investment', invStr)
      return p
    },
  })

  // 解构便捷变量
  const {
    activeTab,
    balanceDate: selectedBalanceTime,
    incomeExpenseRange: incomeExpenseTimeRange,
    incomeExpenseIncludeExcluded,
    cashFlowRange: cashFlowTimeRange,
    investmentRange: investmentTimeRange,
  } = reportState

  // setter 包装：保持原有回调签名兼容
  const setActiveTab = (tab: string) => setReportState(prev => ({ ...prev, activeTab: tab }))
  const setSelectedBalanceTime = (v: PointTimeValue) => setReportState(prev => ({ ...prev, balanceDate: v }))
  const setIncomeExpenseTimeRange = (v: RangeTimeValue) => setReportState(prev => ({ ...prev, incomeExpenseRange: v }))
  const setIncomeExpenseIncludeExcluded = (v: boolean) => setReportState(prev => ({ ...prev, incomeExpenseIncludeExcluded: v }))
  const setCashFlowTimeRange = (v: RangeTimeValue) => setReportState(prev => ({ ...prev, cashFlowRange: v }))
  const setInvestmentTimeRange = (v: RangeTimeValue) => setReportState(prev => ({ ...prev, investmentRange: v }))

  // ── 临时 UI 状态 → useState（不持久化） ──
  const [accountCategoryModalVisible, setAccountCategoryModalVisible] = useState(false)
  const [transactionCategoryModalVisible, setTransactionCategoryModalVisible] = useState(false)
  const [cashFlowConfigModalVisible, setCashFlowConfigModalVisible] = useState(false)
  const [investmentConfigModalVisible, setInvestmentConfigModalVisible] = useState(false)

  const { data: earliestDateData } = useTransactionEarliestDate()
  const earliestTransactionDate = earliestDateData?.date || null

  const balanceSheetDate = useMemo(() => toDateParam(selectedBalanceTime), [selectedBalanceTime])
  const balanceSheetQuery = useBalanceSheet(
    balanceSheetDate,
    activeTab === 'balance-sheet'
  )
  const { data: balanceSheetData, isLoading: balanceSheetLoading, refetch: refetchBalanceSheet } = balanceSheetQuery

  const incomeExpenseParams = useMemo(() => toDateRangeParams(incomeExpenseTimeRange), [incomeExpenseTimeRange])
  const incomeExpenseQuery = useIncomeExpense(
    incomeExpenseParams.startDate,
    incomeExpenseParams.endDate,
    true,
    incomeExpenseIncludeExcluded,
    activeTab === 'income-expense'
  )
  const { data: incomeExpenseData, isLoading: incomeExpenseLoading, refetch: refetchIncomeExpense } = incomeExpenseQuery

  const cashFlowParams = useMemo(() => toDateRangeParams(cashFlowTimeRange), [cashFlowTimeRange])
  const cashFlowQuery = useCashFlow(
    cashFlowParams.startDate,
    cashFlowParams.endDate,
    true,
    activeTab === 'cash-flow'
  )
  const { data: cashFlowData, isLoading: cashFlowLoading, refetch: refetchCashFlow } = cashFlowQuery

  const investmentParams = useMemo(() => toDateRangeParams(investmentTimeRange), [investmentTimeRange])
  const investmentQuery = useInvestmentAnalysis(
    investmentParams.startDate,
    investmentParams.endDate,
    activeTab === 'investment-analysis'
  )
  const { data: investmentData, isLoading: investmentLoading, refetch: refetchInvestment } = investmentQuery

  /**
   * 报表渲染守卫：
   * - 失败且没有旧数据：整块错误，不渲染空报表（避免把失败伪装成「全是 0」）
   * - 失败但有旧数据：提示刷新失败并保留上次数据
   */
  const renderReport = (
    title: string,
    query: { isError: boolean; error: unknown; data: unknown },
    refetch: () => void,
    content: React.ReactNode
  ) => {
    if (!query.isError) return content
    if (query.data === undefined || query.data === null) {
      return <ErrorState title={`${title}加载失败`} error={query.error} onRetry={refetch} />
    }
    return (
      <>
        <ErrorState
          variant="inline"
          title={`${title}刷新失败，当前显示上次数据`}
          error={query.error}
          onRetry={refetch}
        />
        {content}
      </>
    )
  }

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
      children: renderReport(
        '资产负债表',
        balanceSheetQuery,
        () => void refetchBalanceSheet(),
        (
          <BalanceSheetReport
            selectedTime={selectedBalanceTime}
            pickerConfig={balanceSheetPickerConfig}
            balanceSheetData={balanceSheetData ?? null}
            loading={balanceSheetLoading}
            onTimeChange={setSelectedBalanceTime}
            onOpenSettings={() => setAccountCategoryModalVisible(true)}
          />
        )
      ),
    },
    {
      key: 'income-expense',
      label: '收入支出表',
      children: renderReport(
        '收入支出表',
        incomeExpenseQuery,
        () => void refetchIncomeExpense(),
        (
          <IncomeExpenseReport
            timeRange={incomeExpenseTimeRange}
            pickerConfig={incomeExpensePickerConfig}
            incomeExpenseData={incomeExpenseData ?? null}
            loading={incomeExpenseLoading}
            onTimeRangeChange={setIncomeExpenseTimeRange}
            onOpenSettings={() => setTransactionCategoryModalVisible(true)}
            includeExcluded={incomeExpenseIncludeExcluded}
            onIncludeExcludedChange={setIncomeExpenseIncludeExcluded}
          />
        )
      ),
    },
    {
      key: 'cash-flow',
      label: '现金流量表',
      children: renderReport(
        '现金流量表',
        cashFlowQuery,
        () => void refetchCashFlow(),
        (
          <CashFlowReport
            timeRange={cashFlowTimeRange}
            pickerConfig={cashFlowPickerConfig}
            cashFlowData={cashFlowData ?? null}
            loading={cashFlowLoading}
            onTimeRangeChange={setCashFlowTimeRange}
            onOpenSettings={() => setCashFlowConfigModalVisible(true)}
          />
        )
      ),
    },
    {
      key: 'investment-analysis',
      label: '投资分析表',
      children: renderReport(
        '投资分析表',
        investmentQuery,
        () => void refetchInvestment(),
        (
          <InvestmentAnalysisReport
            timeRange={investmentTimeRange}
            pickerConfig={investmentPickerConfig}
            investmentData={investmentData ?? null}
            loading={investmentLoading}
            onTimeRangeChange={setInvestmentTimeRange}
            onOpenSettings={() => setInvestmentConfigModalVisible(true)}
            onRefresh={refetchInvestment}
          />
        )
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
    </>
  )
}

export default Reports
