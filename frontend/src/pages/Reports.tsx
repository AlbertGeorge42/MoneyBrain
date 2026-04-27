import React, { useEffect, useMemo, useState } from 'react'
import { Card, InputNumber, Modal, Space, Tabs, message } from 'antd'
import dayjs from 'dayjs'
import { PageHeader } from '../components/common'
import { AccountConfigModal, CashFlowConfigModal, TransactionConfigModal } from '../components/settings'
import DynamicIcon from '../components/common/DynamicIcon'
import { BalanceSheet, CashFlowReport, IncomeExpenseReport, InvestmentAnalysis } from '../components/reports'
import type { PointTimePickerConfig, PointTimeValue, RangeTimePickerConfig, RangeTimeValue } from '../components/common'
import {
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
  accountApi,
  reportApi,
  transactionApi,
  type BalanceSheetAccountItem,
  type BalanceSheetReportData,
  type CashFlowReportData,
  type IncomeExpenseReportData,
  type InvestmentAnalysisReportData,
} from '../services/api'
import { useStore } from '../stores'
import { colorMuted, colorNeutral } from '../styles/tokens'

const baseBalanceSheetPickerConfig: Omit<PointTimePickerConfig, 'minDate' | 'maxDate'> = {
  label: '时点',
  allowedGranularities: ['day', 'month', 'year'],
  presets: {
    day: [
      createPointPeriodPreset('today', '今天', 'day'),
      createPointPeriodPreset('yesterday', '昨天', 'day', -1),
      createPointPeriodPreset('month-start', '月初', 'month'),
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

type BalanceSheetTreeNode = {
  key: string
  name: string
  balance: number
  nodeType: 'asset' | 'liability'
  type: 'category' | 'account'
  icon?: string
  children?: BalanceSheetTreeNode[]
}

const Reports: React.FC = () => {
  const { fetchAccounts } = useStore()
  const [activeTab, setActiveTab] = useState('balance-sheet')
  const [earliestTransactionDate, setEarliestTransactionDate] = useState<string | null>(null)
  const [selectedBalanceTime, setSelectedBalanceTime] = useState<PointTimeValue>(createPointValue('month', dayjs()))
  const [balanceSheetData, setBalanceSheetData] = useState<BalanceSheetReportData | null>(null)
  const [calibrateVisible, setCalibrateVisible] = useState(false)
  const [calibrateData, setCalibrateData] = useState<Record<string, number>>({})
  const [accountCategoryModalVisible, setAccountCategoryModalVisible] = useState(false)
  const [incomeExpenseTimeRange, setIncomeExpenseTimeRange] = useState<RangeTimeValue>(
    createRangePeriodPreset('current-month', '本月', 'month').getValue(dayjs())
  )
  const [incomeExpenseData, setIncomeExpenseData] = useState<IncomeExpenseReportData | null>(null)
  const [transactionCategoryModalVisible, setTransactionCategoryModalVisible] = useState(false)
  const [cashFlowTimeRange, setCashFlowTimeRange] = useState<RangeTimeValue>(
    createRangePeriodPreset('current-month', '本月', 'month').getValue(dayjs())
  )
  const [cashFlowData, setCashFlowData] = useState<CashFlowReportData | null>(null)
  const [cashFlowConfigModalVisible, setCashFlowConfigModalVisible] = useState(false)
  const [cashFlowLoading, setCashFlowLoading] = useState(false)
  const [investmentTimeRange, setInvestmentTimeRange] = useState<RangeTimeValue>(
    createTrailingRangePreset('last-12-months', '近12个月', 12, 'month').getValue(dayjs())
  )
  const [investmentData, setInvestmentData] = useState<InvestmentAnalysisReportData | null>(null)

  useEffect(() => {
    const fetchEarliestDate = async () => {
      try {
        const response = await transactionApi.getEarliestDate()
        setEarliestTransactionDate(response.data.data?.date || null)
      } catch {
        setEarliestTransactionDate(null)
      }
    }

    void fetchEarliestDate()
  }, [])

  const balanceSheetPickerConfig = useMemo<PointTimePickerConfig>(
    () => ({
      ...baseBalanceSheetPickerConfig,
      minDate: earliestTransactionDate ? dayjs(earliestTransactionDate) : undefined,
      maxDate: dayjs(),
    }),
    [earliestTransactionDate]
  )

  const incomeExpensePickerConfig = useMemo<RangeTimePickerConfig>(
    () => ({
      ...baseIncomeExpensePickerConfig,
      minDate: earliestTransactionDate ? dayjs(earliestTransactionDate) : undefined,
      maxDate: dayjs(),
    }),
    [earliestTransactionDate]
  )

  const cashFlowPickerConfig = useMemo<RangeTimePickerConfig>(
    () => ({
      ...baseCashFlowPickerConfig,
      minDate: earliestTransactionDate ? dayjs(earliestTransactionDate) : undefined,
      maxDate: dayjs(),
    }),
    [earliestTransactionDate]
  )

  const investmentPickerConfig = useMemo<RangeTimePickerConfig>(
    () => ({
      ...baseInvestmentPickerConfig,
      minDate: earliestTransactionDate ? dayjs(earliestTransactionDate) : undefined,
      maxDate: dayjs(),
    }),
    [earliestTransactionDate]
  )

  useEffect(() => {
    if (activeTab === 'balance-sheet') {
      void fetchBalanceSheet()
    } else if (activeTab === 'income-expense') {
      void fetchIncomeExpense()
    } else if (activeTab === 'cash-flow') {
      void fetchCashFlow()
    } else if (activeTab === 'investment-analysis') {
      void fetchInvestmentAnalysis()
    }
  }, [activeTab, selectedBalanceTime, incomeExpenseTimeRange, cashFlowTimeRange, investmentTimeRange])

  const fetchBalanceSheet = async () => {
    try {
      const response = await reportApi.getBalanceSheet(toDateParam(selectedBalanceTime))
      setBalanceSheetData(response.data.data ?? null)

      const nextCalibration: Record<string, number> = {}
      response.data.data?.accounts?.forEach((account: BalanceSheetAccountItem) => {
        nextCalibration[account.id] = account.balance
      })
      setCalibrateData(nextCalibration)
    } catch (error) {
      message.error('获取资产负债表失败')
    }
  }

  const fetchIncomeExpense = async () => {
    try {
      const { startDate, endDate } = toDateRangeParams(incomeExpenseTimeRange)
      const response = await reportApi.getIncomeExpense(startDate, endDate)
      setIncomeExpenseData(response.data.data ?? null)
    } catch (error) {
      message.error('获取收入支出表失败')
    }
  }

  const fetchCashFlow = async () => {
    try {
      setCashFlowLoading(true)
      const { startDate, endDate } = toDateRangeParams(cashFlowTimeRange)
      const response = await reportApi.getCashFlow(startDate, endDate)
      setCashFlowData(response.data.data ?? null)
    } catch (error) {
      message.error('获取现金流量表失败')
    } finally {
      setCashFlowLoading(false)
    }
  }

  const fetchInvestmentAnalysis = async () => {
    try {
      const { startDate, endDate } = toDateRangeParams(investmentTimeRange)
      const response = await reportApi.getInvestmentAnalysis(startDate, endDate)
      setInvestmentData(response.data.data ?? null)
    } catch (error) {
      message.error('获取投资分析表失败')
    }
  }

  const handleSaveCalibration = async () => {
    try {
      const adjustments =
        balanceSheetData?.accounts
          ?.map((account: BalanceSheetAccountItem) => ({
            accountId: account.id,
            amount: (calibrateData[account.id] || 0) - (account.balance || 0),
          }))
          .filter((item) => item.amount !== 0) || []

      if (adjustments.length === 0) {
        message.info('没有需要校准的账户')
        setCalibrateVisible(false)
        return
      }

      const response = await accountApi.batchAdjust({
        adjustments,
        date: selectedBalanceTime.value.startOf('month').subtract(1, 'day').format('YYYY-MM-DD'),
        note: `报表校准 ${selectedBalanceTime.value.format('YYYY-MM')}`,
      })

      message.success(`已生成 ${response.data.data?.count || 0} 条平账记录`)
      setCalibrateVisible(false)
      void fetchBalanceSheet()
      fetchAccounts()
    } catch (error) {
      message.error('保存失败')
    }
  }

  const buildBalanceSheetTreeData = useMemo(() => {
    if (!balanceSheetData?.accounts) {
      return { assetNodes: [], liabilityNodes: [] }
    }

    const groupedByCategory: Record<string, BalanceSheetAccountItem[]> = {}
    const categorySortMap: Record<string, number> = {}

    balanceSheetData.accounts.forEach((account) => {
      const category = account.category || '未分类'
      if (!groupedByCategory[category]) {
        groupedByCategory[category] = []
        categorySortMap[category] = account.categorySort ?? 0
      }
      groupedByCategory[category].push(account)
    })

    const buildTree = (type: 'asset' | 'liability') =>
      Object.keys(groupedByCategory)
        .filter((category) => groupedByCategory[category]?.some((account) => account.type === type))
        .sort((left, right) => categorySortMap[left] - categorySortMap[right])
        .map(
          (category): BalanceSheetTreeNode => ({
            key: `category-${category}-${type}`,
            name: category,
            balance: groupedByCategory[category]
              .filter((account) => account.type === type)
              .reduce((sum, account) => sum + account.balance, 0),
            nodeType: type,
            type: 'category',
            icon: groupedByCategory[category][0]?.categoryIcon || undefined,
            children: groupedByCategory[category]
              .filter((account) => account.type === type)
              .map(
                (account): BalanceSheetTreeNode => ({
                  key: `account-${account.id}`,
                  name: account.name,
                  balance: account.balance,
                  nodeType: type,
                  type: 'account',
                  icon: account.icon || undefined,
                })
              ),
          })
        )

    return {
      assetNodes: buildTree('asset'),
      liabilityNodes: buildTree('liability'),
    }
  }, [balanceSheetData])

  const tabItems = [
    {
      key: 'balance-sheet',
      label: '资产负债表',
      children: (
        <BalanceSheet
          selectedTime={selectedBalanceTime}
          pickerConfig={balanceSheetPickerConfig}
          balanceSheetData={balanceSheetData}
          buildBalanceSheetTreeData={buildBalanceSheetTreeData}
          onTimeChange={setSelectedBalanceTime}
          onOpenSettings={() => setAccountCategoryModalVisible(true)}
          onOpenCalibrate={() => setCalibrateVisible(true)}
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
          incomeExpenseData={incomeExpenseData}
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
          cashFlowData={cashFlowData}
          cashFlowLoading={cashFlowLoading}
          onTimeRangeChange={setCashFlowTimeRange}
          onOpenSettings={() => setCashFlowConfigModalVisible(true)}
        />
      ),
    },
    {
      key: 'investment-analysis',
      label: '投资分析表',
      children: (
        <InvestmentAnalysis
          timeRange={investmentTimeRange}
          pickerConfig={investmentPickerConfig}
          investmentData={investmentData}
          onTimeRangeChange={setInvestmentTimeRange}
          onOpenSettings={() => setAccountCategoryModalVisible(true)}
        />
      ),
    },
  ]

  return (
    <>
      <PageHeader eyebrow="Reports" title="财务报表" description="集中查看资产、收支、现金流和投资表现。" />

      <Card className="surface-card">
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} size="small" />
      </Card>

      <AccountConfigModal
        visible={accountCategoryModalVisible}
        onClose={() => {
          setAccountCategoryModalVisible(false)
          void fetchBalanceSheet()
          void fetchIncomeExpense()
        }}
      />

      <TransactionConfigModal
        visible={transactionCategoryModalVisible}
        onClose={() => setTransactionCategoryModalVisible(false)}
      />

      <CashFlowConfigModal
        visible={cashFlowConfigModalVisible}
        onClose={() => setCashFlowConfigModalVisible(false)}
      />

      <Modal
        title={`校准余额 ${selectedBalanceTime.value.format('YYYY-MM')}`}
        open={calibrateVisible}
        onOk={handleSaveCalibration}
        onCancel={() => setCalibrateVisible(false)}
        okText="保存"
        cancelText="取消"
        width={700}
      >
        <p style={{ color: colorNeutral, marginBottom: 16 }}>输入实际余额。</p>
        {balanceSheetData?.accounts?.map((account: BalanceSheetAccountItem) => (
          <div
            key={account.id}
            style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <span style={{ width: 160 }}>
              <DynamicIcon name={account.icon} size={16} fallback="wallet" /> {account.name}
            </span>
            <Space>
              <span style={{ color: colorMuted, fontSize: 12 }}>当前 ¥{account.balance?.toFixed(2) || '0.00'}</span>
              <InputNumber
                value={calibrateData[account.id]}
                onChange={(value) => setCalibrateData({ ...calibrateData, [account.id]: value || 0 })}
                precision={2}
                style={{ width: 160 }}
                prefix="¥"
                placeholder="实际余额"
              />
            </Space>
          </div>
        ))}
      </Modal>
    </>
  )
}

export default Reports
