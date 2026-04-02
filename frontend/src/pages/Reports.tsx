import React, { useState, useEffect, useMemo } from 'react'
import { Card, Tabs, Modal, InputNumber, message, Space } from 'antd'
import dayjs from 'dayjs'
import {
  reportApi,
  accountApi,
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

const Reports: React.FC = () => {
  const { fetchAccounts } = useStore()
  const [activeTab, setActiveTab] = useState('balance-sheet')
  
  const [selectedMonth, setSelectedMonth] = useState(dayjs())
  const [balanceSheetData, setBalanceSheetData] = useState<BalanceSheetReportData | null>(null)
  const [calibrateVisible, setCalibrateVisible] = useState(false)
  const [calibrateData, setCalibrateData] = useState<Record<string, number>>({})
  const [accountCategoryModalVisible, setAccountCategoryModalVisible] = useState(false)
  
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ])
  const [incomeExpenseData, setIncomeExpenseData] = useState<IncomeExpenseReportData | null>(null)
  const [transactionCategoryModalVisible, setTransactionCategoryModalVisible] = useState(false)
  
  const [cashFlowDateRange, setCashFlowDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ])
  const [cashFlowData, setCashFlowData] = useState<CashFlowReportData | null>(null)
  const [cashFlowConfigModalVisible, setCashFlowConfigModalVisible] = useState(false)
  const [cashFlowLoading, setCashFlowLoading] = useState(false)

  const [investmentDateRange, setInvestmentDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(1, 'year').startOf('month'),
    dayjs().startOf('month'),
  ])
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
    if (activeTab === 'balance-sheet') {
      fetchBalanceSheet()
    } else if (activeTab === 'income-expense') {
      fetchIncomeExpense()
    } else if (activeTab === 'cash-flow') {
      fetchCashFlow()
    } else if (activeTab === 'investment-analysis') {
      fetchInvestmentAnalysis()
    }
  }, [activeTab, selectedMonth, dateRange, cashFlowDateRange, investmentDateRange])

  const fetchBalanceSheet = async () => {
    try {
      const monthStr = selectedMonth.format('YYYY-MM')
      const res = await reportApi.getBalanceSheet(monthStr)
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
      const res = await reportApi.getIncomeExpense(
        dateRange[0].format('YYYY-MM-DD'),
        dateRange[1].format('YYYY-MM-DD')
      )
      setIncomeExpenseData(res.data.data ?? null)
    } catch (error) {
      message.error('获取收入支出表失败')
    }
  }

  const fetchCashFlow = async () => {
    try {
      setCashFlowLoading(true)
      const res = await reportApi.getCashFlow(
        cashFlowDateRange[0].format('YYYY-MM-DD'),
        cashFlowDateRange[1].format('YYYY-MM-DD')
      )
      setCashFlowData(res.data.data ?? null)
    } catch (error) {
      message.error('获取现金流量表失败')
    } finally {
      setCashFlowLoading(false)
    }
  }

  const fetchInvestmentAnalysis = async () => {
    try {
      const res = await reportApi.getInvestmentAnalysis(
        investmentDateRange[0].format('YYYY-MM-DD'),
        investmentDateRange[1].format('YYYY-MM-DD')
      )
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
        date: selectedMonth.startOf('month').subtract(1, 'day').format('YYYY-MM-DD'),
        note: `资产负债表校准 - ${selectedMonth.format('YYYY年MM月')}`,
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
          selectedMonth={selectedMonth}
          balanceSheetData={balanceSheetData}
          buildBalanceSheetTreeData={buildBalanceSheetTreeData}
          onMonthChange={setSelectedMonth}
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
          dateRange={dateRange}
          incomeExpenseData={incomeExpenseData}
          onDateRangeChange={setDateRange}
          onOpenSettings={() => setTransactionCategoryModalVisible(true)}
        />
      )
    },
    { 
      key: 'cash-flow', 
      label: '现金流量表', 
      children: (
        <CashFlowReport
          cashFlowDateRange={cashFlowDateRange}
          cashFlowData={cashFlowData}
          cashFlowLoading={cashFlowLoading}
          onDateRangeChange={setCashFlowDateRange}
          onOpenSettings={() => setCashFlowConfigModalVisible(true)}
        />
      )
    },
    { 
      key: 'investment-analysis', 
      label: '投资分析表', 
      children: (
        <InvestmentAnalysis
          dateRange={investmentDateRange}
          investmentData={investmentData}
          onDateRangeChange={setInvestmentDateRange}
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
        title={`调整账户余额 - ${selectedMonth.format('YYYY年MM月')}`}
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
