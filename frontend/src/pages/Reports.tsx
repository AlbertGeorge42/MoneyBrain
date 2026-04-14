import React, { useState, useEffect, useMemo } from 'react'
import { Card, Tabs, Modal, InputNumber, message, Space } from 'antd'
import dayjs from 'dayjs'
import {
  reportApi,
  accountApi,
  transactionApi,
  type BalanceSheetAccountItem,
  type BalanceSheetReportData,
  type CashFlowReportData,
  type IncomeExpenseReportData,
  type InvestmentAnalysisReportData,
} from '../services/api'
import { useStore } from '../stores'
import { AccountConfigModal, TransactionConfigModal, CashFlowConfigModal } from '../components/settings'
import DynamicIcon from '../components/common/DynamicIcon'
import { BalanceSheet, IncomeExpenseReport, CashFlowReport, InvestmentAnalysis } from '../components/reports'
import type { PointTimePickerConfig, PointTimeValue, RangeTimePickerConfig, RangeTimeValue } from '../components/common'
import {
  createPointPeriodPreset,
  createPointValue,
  createQuarterRangePreset,
  createRangePeriodPreset,
  createTrailingRangePreset,
  createYearToDatePreset,
  toDateRangeParams,
  toDateParam,
} from '../utils/timePicker'

const baseBalanceSheetPickerConfig: Omit<PointTimePickerConfig, 'minDate' | 'maxDate'> = {
  label: '时点选择',
  allowedGranularities: ['day', 'month', 'year'],
  presets: {
    day: [
      createPointPeriodPreset('today', '今天', 'day'),
      createPointPeriodPreset('yesterday', '昨天', 'day', -1),
      createPointPeriodPreset('month-start', '本月初', 'month'),
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
  label: '财务周期',
  allowedGranularities: ['day', 'month', 'year'],
  presets: {
    day: [
      createRangePeriodPreset('today', '今天', 'day'),
      createTrailingRangePreset('last-7-days', '近7天', 7, 'day'),
      createTrailingRangePreset('last-30-days', '近30天', 30, 'day'),
      createYearToDatePreset('year-to-date', '今年至今'),
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
  label: '现金周期',
  allowedGranularities: ['day', 'month', 'year'],
  presets: {
    day: [
      createRangePeriodPreset('today', '今天', 'day'),
      createTrailingRangePreset('last-30-days', '近30天', 30, 'day'),
      createTrailingRangePreset('last-90-days', '近90天', 90, 'day'),
      createYearToDatePreset('year-to-date', '今年至今'),
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
  label: '投资周期',
  allowedGranularities: ['month', 'year'],
  presets: {
    month: [
      createTrailingRangePreset('last-3-months', '近3个月', 3, 'month'),
      createTrailingRangePreset('last-6-months', '近6个月', 6, 'month'),
      createTrailingRangePreset('last-12-months', '近1年', 12, 'month'),
      createTrailingRangePreset('last-36-months', '近3年', 36, 'month'),
    ],
    year: [
      createRangePeriodPreset('current-year', '今年', 'year'),
      createRangePeriodPreset('previous-year', '去年', 'year', -1),
      createTrailingRangePreset('last-3-years', '近3年', 3, 'year'),
    ],
  },
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
    createTrailingRangePreset('last-12-months', '近1年', 12, 'month').getValue(dayjs())
  )
  const [investmentData, setInvestmentData] = useState<InvestmentAnalysisReportData | null>(null)

  type BalanceSheetTreeNode = {
    key: string
    name: string
    balance: number
    nodeType: 'asset' | 'liability'
    type: 'category' | 'account'
    icon?: string
    children?: BalanceSheetTreeNode[]
  }

  useEffect(() => {
    const fetchEarliestDate = async () => {
      try {
        const res = await transactionApi.getEarliestDate()
        setEarliestTransactionDate(res.data.data?.date || null)
      } catch {
        // 忽略错误
      }
    }
    fetchEarliestDate()
  }, [])

  const balanceSheetPickerConfig = useMemo<PointTimePickerConfig>(() => ({
    ...baseBalanceSheetPickerConfig,
    minDate: earliestTransactionDate ? dayjs(earliestTransactionDate) : undefined,
    maxDate: dayjs(),
  }), [earliestTransactionDate])

  const incomeExpensePickerConfig = useMemo<RangeTimePickerConfig>(() => ({
    ...baseIncomeExpensePickerConfig,
    minDate: earliestTransactionDate ? dayjs(earliestTransactionDate) : undefined,
    maxDate: dayjs(),
  }), [earliestTransactionDate])

  const cashFlowPickerConfig = useMemo<RangeTimePickerConfig>(() => ({
    ...baseCashFlowPickerConfig,
    minDate: earliestTransactionDate ? dayjs(earliestTransactionDate) : undefined,
    maxDate: dayjs(),
  }), [earliestTransactionDate])

  const investmentPickerConfig = useMemo<RangeTimePickerConfig>(() => ({
    ...baseInvestmentPickerConfig,
    minDate: earliestTransactionDate ? dayjs(earliestTransactionDate) : undefined,
    maxDate: dayjs(),
  }), [earliestTransactionDate])

  useEffect(() => {
    if (activeTab === 'balance-sheet') {
      fetchBalanceSheet()
    } else if (activeTab === 'income-expense') {
      fetchIncomeExpense()
    } else if (activeTab === 'cash-flow') {
      fetchCashFlow()
    } else if (activeTab === 'investment-analysis') {
      fetchInvestmentAnalysis()
    }
  }, [activeTab, selectedBalanceTime, incomeExpenseTimeRange, cashFlowTimeRange, investmentTimeRange])

  const fetchBalanceSheet = async () => {
    try {
      const dateStr = toDateParam(selectedBalanceTime)
      const res = await reportApi.getBalanceSheet(dateStr)
      setBalanceSheetData(res.data.data ?? null)
      
      const initialCalibrate: Record<string, number> = {}
      res.data.data?.accounts?.forEach((account: BalanceSheetAccountItem) => {
        initialCalibrate[account.id] = account.balance
      })
      setCalibrateData(initialCalibrate)
    } catch (error) {
      message.error('获取资产负债表失败')
    }
  }

  const fetchIncomeExpense = async () => {
    try {
      const { startDate, endDate } = toDateRangeParams(incomeExpenseTimeRange)
      const res = await reportApi.getIncomeExpense(startDate, endDate)
      setIncomeExpenseData(res.data.data ?? null)
    } catch (error) {
      message.error('获取收入支出表失败')
    }
  }

  const fetchCashFlow = async () => {
    try {
      setCashFlowLoading(true)
      const { startDate, endDate } = toDateRangeParams(cashFlowTimeRange)
      const res = await reportApi.getCashFlow(startDate, endDate)
      setCashFlowData(res.data.data ?? null)
    } catch (error) {
      message.error('获取现金流量表失败')
    } finally {
      setCashFlowLoading(false)
    }
  }

  const fetchInvestmentAnalysis = async () => {
    try {
      const { startDate, endDate } = toDateRangeParams(investmentTimeRange)
      const res = await reportApi.getInvestmentAnalysis(startDate, endDate)
      setInvestmentData(res.data.data ?? null)
    } catch (error) {
      message.error('获取投资分析表失败')
    }
  }

  const handleSaveCalibration = async () => {
    try {
      const adjustments = balanceSheetData?.accounts?.map((account: BalanceSheetAccountItem) => {
        const targetBalance = calibrateData[account.id] || 0
        const currentBalance = account.balance || 0
        return {
          accountId: account.id,
          amount: targetBalance - currentBalance,
        }
      }).filter((adjustment) => adjustment.amount !== 0) || []

      if (adjustments.length === 0) {
        message.info('没有需要调整的账户')
        setCalibrateVisible(false)
        return
      }

      const res = await accountApi.batchAdjust({
        adjustments,
        date: selectedBalanceTime.value.startOf('month').subtract(1, 'day').format('YYYY-MM-DD'),
        note: `资产负债表校准 - ${selectedBalanceTime.value.format('YYYY年MM月')}`,
      })
      
      const count = res.data.data?.count || 0
      message.success(`校准成功，已生成 ${count} 条平账记录`)
      
      setCalibrateVisible(false)
      fetchBalanceSheet()
      fetchAccounts()
    } catch (error) {
      message.error('保存失败')
    }
  }

  const buildBalanceSheetTreeData = useMemo(() => {
    if (!balanceSheetData?.accounts) return { assetNodes: [], liabilityNodes: [] }

    const accounts = balanceSheetData.accounts

    const groupedByCategory: Record<string, BalanceSheetAccountItem[]> = {}
    const categorySortMap: Record<string, number> = {}

    accounts.forEach((account) => {
      const cat = account.category || '未分类'
      if (!groupedByCategory[cat]) {
        groupedByCategory[cat] = []
        categorySortMap[cat] = account.categorySort ?? 0
      }
      groupedByCategory[cat].push(account)
    })

    const buildTree = (type: 'asset' | 'liability') => {
      const typeCategories = Object.keys(groupedByCategory)
        .filter(cat => groupedByCategory[cat]?.some(account => account.type === type))
        .sort((a, b) => categorySortMap[a] - categorySortMap[b])

      return typeCategories.map((cat): BalanceSheetTreeNode => {
        const catAccounts = groupedByCategory[cat] || []
        const typeCatAccounts = catAccounts.filter(account => account.type === type)
        const total = typeCatAccounts.reduce((sum, account) => sum + account.balance, 0)

        return {
          key: `category-${cat}-${type}`,
          name: cat,
          balance: total,
          nodeType: type,
          type: 'category' as const,
          icon: typeCatAccounts[0]?.categoryIcon || undefined,
          children: typeCatAccounts.map((account): BalanceSheetTreeNode => ({
            key: `account-${account.id}`,
            name: account.name,
            balance: account.balance,
            nodeType: type,
            type: 'account' as const,
            icon: account.icon || undefined,
          })),
        }
      })
    }

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
      )
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
      )
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
      )
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
      )
    },
  ]

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>财务报表</h2>
      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </Card>

      <AccountConfigModal
        visible={accountCategoryModalVisible}
        onClose={() => {
          setAccountCategoryModalVisible(false)
          fetchBalanceSheet()
          fetchIncomeExpense()
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
        title={`调整账户余额 - ${selectedBalanceTime.value.format('YYYY年MM月')}`}
        open={calibrateVisible}
        onOk={handleSaveCalibration}
        onCancel={() => setCalibrateVisible(false)}
        okText="保存并生成平账记录"
        cancelText="取消"
        width={700}
      >
        <p style={{ color: '#666', marginBottom: 16 }}>
          输入账户的实际余额，系统将自动创建平账交易来调整差额。
        </p>
        {balanceSheetData?.accounts?.map((account: BalanceSheetAccountItem) => (
          <div key={account.id} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ width: 150 }}>
              <DynamicIcon name={account.icon} size={16} fallback="wallet" /> {account.name}
            </span>
            <Space>
              <span style={{ color: '#999', fontSize: 12 }}>
                当前余额: ¥{account.balance?.toFixed(2) || '0.00'}
              </span>
              <InputNumber
                value={calibrateData[account.id]}
                onChange={(value) => setCalibrateData({ ...calibrateData, [account.id]: value || 0 })}
                precision={2}
                style={{ width: 150 }}
                prefix="¥"
                placeholder="实际余额"
              />
            </Space>
          </div>
        ))}
      </Modal>
    </div>
  )
}

export default Reports
