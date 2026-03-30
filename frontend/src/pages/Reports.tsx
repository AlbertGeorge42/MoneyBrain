import React, { useState, useEffect, useMemo } from 'react'
import { Card, Tabs, Modal, InputNumber, message, Space } from 'antd'
import dayjs from 'dayjs'
import { reportApi, accountApi } from '../services/api'
import { useStore } from '../stores'
import AccountCategoryModal from '../components/account-category/AccountCategoryModal'
import TransactionCategoryModal from '../components/transaction-category/TransactionCategoryModal'
import CashFlowConfigModal from '../components/reports/CashFlowConfigModal'
import DynamicIcon from '../components/common/DynamicIcon'
import { BalanceSheet, IncomeExpenseReport, CashFlowReport } from '../components/reports'

const Reports: React.FC = () => {
  const { fetchAccounts } = useStore()
  const [activeTab, setActiveTab] = useState('balance-sheet')
  
  const [selectedMonth, setSelectedMonth] = useState(dayjs())
  const [balanceSheetData, setBalanceSheetData] = useState<any>(null)
  const [calibrateVisible, setCalibrateVisible] = useState(false)
  const [calibrateData, setCalibrateData] = useState<Record<string, number>>({})
  const [accountCategoryModalVisible, setAccountCategoryModalVisible] = useState(false)
  
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ])
  const [incomeExpenseData, setIncomeExpenseData] = useState<any>(null)
  const [transactionCategoryModalVisible, setTransactionCategoryModalVisible] = useState(false)
  
  const [cashFlowDateRange, setCashFlowDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ])
  const [cashFlowData, setCashFlowData] = useState<any>(null)
  const [cashFlowConfigModalVisible, setCashFlowConfigModalVisible] = useState(false)
  const [cashFlowLoading, setCashFlowLoading] = useState(false)

  useEffect(() => {
    if (activeTab === 'balance-sheet') {
      fetchBalanceSheet()
    } else if (activeTab === 'income-expense') {
      fetchIncomeExpense()
    } else if (activeTab === 'cash-flow') {
      fetchCashFlow()
    }
  }, [activeTab, selectedMonth, dateRange, cashFlowDateRange])

  const fetchBalanceSheet = async () => {
    try {
      const monthStr = selectedMonth.format('YYYY-MM')
      const res = await reportApi.getBalanceSheet(monthStr)
      setBalanceSheetData(res.data.data)
      
      const initialCalibrate: Record<string, number> = {}
      res.data.data?.accounts?.forEach((a: any) => {
        initialCalibrate[a.id] = a.balance
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
      setIncomeExpenseData(res.data.data)
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
      setCashFlowData(res.data.data)
    } catch (error) {
      message.error('获取现金流量表失败')
    } finally {
      setCashFlowLoading(false)
    }
  }

  const handleSaveCalibration = async () => {
    try {
      const adjustments = balanceSheetData?.accounts?.map((account: any) => {
        const targetBalance = calibrateData[account.id] || 0
        const currentBalance = account.balance || 0
        return {
          accountId: account.id,
          amount: targetBalance - currentBalance,
        }
      }).filter((adj: any) => adj.amount !== 0) || []

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

    const groupedByCategory: Record<string, any[]> = {}
    accounts.forEach((a: any) => {
      const cat = a.category || '未分类'
      if (!groupedByCategory[cat]) {
        groupedByCategory[cat] = []
      }
      groupedByCategory[cat].push(a)
    })

    const buildTree = (type: 'asset' | 'liability') => {
      const typeAccounts = accounts.filter((a: any) => a.type === type)
      const typeCategories = [...new Set(typeAccounts.map((a: any) => a.category || '未分类'))] as string[]

      return typeCategories.map((cat: string) => {
        const catAccounts = groupedByCategory[cat] || []
        const typeCatAccounts = catAccounts.filter((a: any) => a.type === type)
        const total = typeCatAccounts.reduce((sum: number, a: any) => sum + a.balance, 0)

        return {
          key: `category-${cat}-${type}`,
          name: cat,
          balance: total,
          nodeType: type,
          type: 'category' as const,
          children: typeCatAccounts.map((a: any) => ({
            key: `account-${a.id}`,
            name: a.name,
            balance: a.balance,
            nodeType: type,
            type: 'account' as const,
            isManual: a.isManual,
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
  ]

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>财务报表</h2>
      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </Card>

      <AccountCategoryModal
        visible={accountCategoryModalVisible}
        onClose={() => {
          setAccountCategoryModalVisible(false)
          fetchBalanceSheet()
          fetchIncomeExpense()
        }}
      />

      <TransactionCategoryModal
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
        {balanceSheetData?.accounts?.map((account: any) => (
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
