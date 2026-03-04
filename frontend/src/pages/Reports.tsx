import React, { useEffect, useState } from 'react'
import { Card, Tabs, DatePicker, Row, Col, Statistic, Table, Spin, message } from 'antd'
import dayjs from 'dayjs'
import * as api from '../services/api'

const { RangePicker } = DatePicker

const Reports: React.FC = () => {
  const [activeTab, setActiveTab] = useState('balance-sheet')
  const [loading, setLoading] = useState(false)
  const [balanceSheetData, setBalanceSheetData] = useState<any>(null)
  const [incomeExpenseData, setIncomeExpenseData] = useState<any>(null)
  const [cashFlowData, setCashFlowData] = useState<any>(null)
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ])

  useEffect(() => {
    fetchBalanceSheet()
  }, [])

  const fetchBalanceSheet = async () => {
    setLoading(true)
    try {
      const res = await api.reportApi.getBalanceSheet()
      if (res.data.success && res.data.data) {
        setBalanceSheetData(res.data.data)
      }
    } catch (error) {
      message.error('获取资产负债表失败')
    }
    setLoading(false)
  }

  const fetchIncomeExpense = async () => {
    setLoading(true)
    try {
      const res = await api.reportApi.getIncomeExpense(
        dateRange[0].format('YYYY-MM-DD'),
        dateRange[1].format('YYYY-MM-DD')
      )
      if (res.data.success && res.data.data) {
        setIncomeExpenseData(res.data.data)
      }
    } catch (error) {
      message.error('获取收入支出表失败')
    }
    setLoading(false)
  }

  const fetchCashFlow = async () => {
    setLoading(true)
    try {
      const res = await api.reportApi.getCashFlow(
        dateRange[0].format('YYYY-MM-DD'),
        dateRange[1].format('YYYY-MM-DD')
      )
      if (res.data.success && res.data.data) {
        setCashFlowData(res.data.data)
      }
    } catch (error) {
      message.error('获取现金流量表失败')
    }
    setLoading(false)
  }

  const handleTabChange = (key: string) => {
    setActiveTab(key)
    if (key === 'balance-sheet' && !balanceSheetData) {
      fetchBalanceSheet()
    } else if (key === 'income-expense') {
      fetchIncomeExpense()
    } else if (key === 'cash-flow') {
      fetchCashFlow()
    }
  }

  const handleDateChange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    if (dates && dates[0] && dates[1]) {
      setDateRange([dates[0], dates[1]])
      if (activeTab === 'income-expense') {
        fetchIncomeExpense()
      } else if (activeTab === 'cash-flow') {
        fetchCashFlow()
      }
    }
  }

  const balanceSheetColumns = [
    { title: '账户', dataIndex: 'name', key: 'name' },
    { title: '分类', dataIndex: 'category', key: 'category' },
    { 
      title: '余额', 
      dataIndex: 'balance', 
      key: 'balance',
      render: (balance: number, record: any) => (
        <span style={{ color: record.type === 'asset' ? '#3f8600' : '#cf1322' }}>
          ¥{balance.toFixed(2)}
        </span>
      ),
    },
  ]

  const accountColumns = [
    { title: '账户', dataIndex: 'name', key: 'name' },
    { 
      title: '流入', 
      dataIndex: 'inflow', 
      key: 'inflow',
      render: (v: number) => <span style={{ color: '#3f8600' }}>¥{v.toFixed(2)}</span>,
    },
    { 
      title: '流出', 
      dataIndex: 'outflow', 
      key: 'outflow',
      render: (v: number) => <span style={{ color: '#cf1322' }}>¥{v.toFixed(2)}</span>,
    },
  ]

  const renderBalanceSheet = () => (
    <Spin spinning={loading}>
      {balanceSheetData && (
        <>
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={8}>
              <Card>
                <Statistic
                  title="总资产"
                  value={balanceSheetData.assets}
                  precision={2}
                  valueStyle={{ color: '#3f8600' }}
                  prefix="¥"
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic
                  title="总负债"
                  value={balanceSheetData.liabilities}
                  precision={2}
                  valueStyle={{ color: '#cf1322' }}
                  prefix="¥"
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic
                  title="净资产"
                  value={balanceSheetData.netWorth}
                  precision={2}
                  valueStyle={{ color: '#1890ff' }}
                  prefix="¥"
                />
              </Card>
            </Col>
          </Row>
          <Card title="资产账户" style={{ marginBottom: 16 }}>
            <Table
              dataSource={balanceSheetData.accounts.filter((a: any) => a.type === 'asset')}
              columns={balanceSheetColumns}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </Card>
          <Card title="负债账户">
            <Table
              dataSource={balanceSheetData.accounts.filter((a: any) => a.type === 'liability')}
              columns={balanceSheetColumns}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </Card>
        </>
      )}
    </Spin>
  )

  const renderIncomeExpense = () => (
    <Spin spinning={loading}>
      <div style={{ marginBottom: 16 }}>
        <RangePicker
          value={dateRange}
          onChange={handleDateChange}
          allowClear={false}
        />
      </div>
      {incomeExpenseData && (
        <>
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={8}>
              <Card>
                <Statistic
                  title="总收入"
                  value={incomeExpenseData.income}
                  precision={2}
                  valueStyle={{ color: '#3f8600' }}
                  prefix="¥"
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic
                  title="总支出"
                  value={incomeExpenseData.expense}
                  precision={2}
                  valueStyle={{ color: '#cf1322' }}
                  prefix="¥"
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic
                  title="结余"
                  value={incomeExpenseData.balance}
                  precision={2}
                  valueStyle={{ color: incomeExpenseData.balance >= 0 ? '#3f8600' : '#cf1322' }}
                  prefix="¥"
                />
              </Card>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Card title="收入分类">
                {Object.entries(incomeExpenseData.incomeByCategory).map(([name, value]) => (
                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <span>{name}</span>
                    <span style={{ color: '#3f8600' }}>¥{(value as number).toFixed(2)}</span>
                  </div>
                ))}
              </Card>
            </Col>
            <Col span={12}>
              <Card title="支出分类">
                {Object.entries(incomeExpenseData.expenseByCategory).map(([name, value]) => (
                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <span>{name}</span>
                    <span style={{ color: '#cf1322' }}>¥{(value as number).toFixed(2)}</span>
                  </div>
                ))}
              </Card>
            </Col>
          </Row>
        </>
      )}
    </Spin>
  )

  const renderCashFlow = () => (
    <Spin spinning={loading}>
      <div style={{ marginBottom: 16 }}>
        <RangePicker
          value={dateRange}
          onChange={handleDateChange}
          allowClear={false}
        />
      </div>
      {cashFlowData && (
        <>
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={8}>
              <Card>
                <Statistic
                  title="现金流入"
                  value={cashFlowData.cashInflow}
                  precision={2}
                  valueStyle={{ color: '#3f8600' }}
                  prefix="¥"
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic
                  title="现金流出"
                  value={cashFlowData.cashOutflow}
                  precision={2}
                  valueStyle={{ color: '#cf1322' }}
                  prefix="¥"
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic
                  title="净现金流"
                  value={cashFlowData.netCashFlow}
                  precision={2}
                  valueStyle={{ color: cashFlowData.netCashFlow >= 0 ? '#3f8600' : '#cf1322' }}
                  prefix="¥"
                />
              </Card>
            </Col>
          </Row>
          <Card title="账户现金流">
            <Table
              dataSource={Object.entries(cashFlowData.flowByAccount).map(([name, data]) => ({
                name,
                inflow: (data as any).inflow,
                outflow: (data as any).outflow,
              }))}
              columns={accountColumns}
              rowKey="name"
              pagination={false}
              size="small"
            />
          </Card>
        </>
      )}
    </Spin>
  )

  const items = [
    { key: 'balance-sheet', label: '资产负债表', children: renderBalanceSheet() },
    { key: 'income-expense', label: '收入支出表', children: renderIncomeExpense() },
    { key: 'cash-flow', label: '现金流量表', children: renderCashFlow() },
  ]

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>财务报表</h2>
      <Card>
        <Tabs activeKey={activeTab} items={items} onChange={handleTabChange} />
      </Card>
    </div>
  )
}

export default Reports
