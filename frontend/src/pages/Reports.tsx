import React, { useState, useEffect, useMemo } from 'react'
import { Card, Tabs, DatePicker, Button, Table, Row, Col, Statistic, Modal, InputNumber, message, Space, Tag, Divider } from 'antd'
import { SettingOutlined, SaveOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { reportApi, balanceSnapshotApi } from '../services/api'
import AccountCategoryModal from '../components/AccountCategoryModal'
import TransactionCategoryModal from '../components/TransactionCategoryModal'
import CashFlowConfigModal from '../components/CashFlowConfigModal'
import DynamicIcon from '../components/DynamicIcon'
import { PieChart, BarChart, SankeyChart } from '../components/charts'
import { formatBalance } from '../utils/formatBalance'

const { RangePicker } = DatePicker
const { MonthPicker } = DatePicker

const Reports: React.FC = () => {
  const [activeTab, setActiveTab] = useState('balance-sheet')
  
  // 资产负债表状态
  const [selectedMonth, setSelectedMonth] = useState(dayjs())
  const [balanceSheetData, setBalanceSheetData] = useState<any>(null)
  const [calibrateVisible, setCalibrateVisible] = useState(false)
  const [calibrateData, setCalibrateData] = useState<Record<string, number>>({})
  const [accountCategoryModalVisible, setAccountCategoryModalVisible] = useState(false)
  
  // 收入支出表状态
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ])
  const [incomeExpenseData, setIncomeExpenseData] = useState<any>(null)
  const [transactionCategoryModalVisible, setTransactionCategoryModalVisible] = useState(false)
  
  // 现金流量表状态
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
      
      // 初始化校准数据
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
      const monthStr = selectedMonth.format('YYYY-MM')
      const adjustments = Object.entries(calibrateData).map(([accountId, targetBalance]) => ({
        accountId,
        targetBalance,
      }))
      
      const res = await balanceSnapshotApi.adjust({ month: monthStr, adjustments })
      
      // 显示平账结果
      const results = res.data.data?.adjustments || []
      const adjustedCount = results.filter((r: any) => r.transaction).length
      
      if (adjustedCount > 0) {
        message.success(`校准成功，已生成 ${adjustedCount} 条平账记录`)
      } else {
        message.success('校准数据保存成功')
      }
      
      setCalibrateVisible(false)
      fetchBalanceSheet()
    } catch (error) {
      message.error('保存失败')
    }
  }

  // 构建资产负债表树形数据
  const buildBalanceSheetTreeData = useMemo(() => {
    if (!balanceSheetData?.accounts) return { assetNodes: [], liabilityNodes: [] }

    const accounts = balanceSheetData.accounts

    // 按分类分组
    const groupedByCategory: Record<string, any[]> = {}
    accounts.forEach((a: any) => {
      const cat = a.category?.name || '未分类'
      if (!groupedByCategory[cat]) {
        groupedByCategory[cat] = []
      }
      groupedByCategory[cat].push(a)
    })

    // 构建树形数据
    const buildTree = (type: string) => {
      const typeAccounts = accounts.filter((a: any) => a.type === type)
      const typeCategories = [...new Set(typeAccounts.map((a: any) => a.category?.name || '未分类'))] as string[]

      return typeCategories.map((cat: string) => {
        const catAccounts = groupedByCategory[cat] || []
        const typeCatAccounts = catAccounts.filter((a: any) => a.type === type)
        const total = typeCatAccounts.reduce((sum: number, a: any) => sum + a.balance, 0)

        return {
          key: `category-${cat}-${type}`,
          name: cat,
          balance: total,
          nodeType: type,
          type: 'category',
          children: typeCatAccounts.map((a: any) => ({
            key: `account-${a.id}`,
            name: a.name,
            balance: a.balance,
            nodeType: type,
            type: 'account',
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

  const renderBalanceSheet = () => (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <MonthPicker 
            value={selectedMonth} 
            onChange={(date) => date && setSelectedMonth(date)}
            allowClear={false}
          />
          <span style={{ color: '#666' }}>
            显示 {selectedMonth.format('YYYY年MM月')} 月初（1日）资产负债状况
          </span>
        </Space>
        <Space>
          <Button icon={<SettingOutlined />} onClick={() => setAccountCategoryModalVisible(true)}>
            设置
          </Button>
          <Button icon={<SaveOutlined />} onClick={() => setCalibrateVisible(true)}>
            校准
          </Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="总资产"
              value={balanceSheetData?.assets || 0}
              precision={2}
              valueStyle={{ color: (balanceSheetData?.assets || 0) >= 0 ? '#3f8600' : '#cf1322' }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="总负债"
              value={(balanceSheetData?.liabilities || 0) <= 0 ? Math.abs(balanceSheetData?.liabilities || 0) : -(balanceSheetData?.liabilities || 0)}
              precision={2}
              valueStyle={{ color: (balanceSheetData?.liabilities || 0) <= 0 ? '#cf1322' : '#3f8600' }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="净资产"
              value={balanceSheetData?.netWorth || 0}
              precision={2}
              valueStyle={{ color: (balanceSheetData?.netWorth || 0) >= 0 ? '#3f8600' : '#cf1322' }}
              prefix="¥"
            />
          </Col>
        </Row>
      </Card>

      {/* 图表区域 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small">
            <PieChart 
              title="资产结构" 
              data={buildBalanceSheetTreeData.assetNodes
                .filter((n: any) => n.type === 'category')
                .map((n: any) => ({ name: n.name, value: Math.abs(n.balance) }))
                .filter((d: any) => d.value > 0)
              }
              height={280}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small">
            <PieChart 
              title="负债结构" 
              data={buildBalanceSheetTreeData.liabilityNodes
                .filter((n: any) => n.type === 'category')
                .map((n: any) => ({ name: n.name, value: Math.abs(n.balance) }))
                .filter((d: any) => d.value > 0)
              }
              height={280}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="资产明细" size="small">
            <Table
              dataSource={buildBalanceSheetTreeData.assetNodes}
              columns={[
                {
                  title: '名称',
                  dataIndex: 'name',
                  key: 'name',
                  render: (text: string, record: any) => (
                    <span>
                      <DynamicIcon name={record.icon || (record.type === 'category' ? 'folder' : 'wallet')} size={16} /> {text}
                      {record.isManual && <Tag color="orange" style={{ marginLeft: 8 }}>已校准</Tag>}
                    </span>
                  ),
                },
                {
                  title: '金额',
                  dataIndex: 'balance',
                  key: 'balance',
                  width: 120,
                  align: 'right',
                  render: (v: number, record: any) => {
                    const result = formatBalance(v, record.nodeType || 'asset')
                    return (
                      <span style={{ color: result.color, fontWeight: 'bold' }}>
                        {result.text}
                      </span>
                    )
                  },
                },
              ]}
              rowKey="key"
              size="small"
              pagination={false}
              defaultExpandAllRows
              indentSize={16}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="负债明细" size="small">
            <Table
              dataSource={buildBalanceSheetTreeData.liabilityNodes}
              columns={[
                {
                  title: '名称',
                  dataIndex: 'name',
                  key: 'name',
                  render: (text: string, record: any) => (
                    <span>
                      <DynamicIcon name={record.icon || (record.type === 'category' ? 'folder' : 'credit-card')} size={16} /> {text}
                      {record.isManual && <Tag color="orange" style={{ marginLeft: 8 }}>已校准</Tag>}
                    </span>
                  ),
                },
                {
                  title: '金额',
                  dataIndex: 'balance',
                  key: 'balance',
                  width: 120,
                  align: 'right',
                  render: (v: number, record: any) => {
                    const result = formatBalance(v, record.nodeType || 'liability')
                    return (
                      <span style={{ color: result.color, fontWeight: 'bold' }}>
                        {result.text}
                      </span>
                    )
                  },
                },
              ]}
              rowKey="key"
              size="small"
              pagination={false}
              defaultExpandAllRows
              indentSize={16}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )

  const renderIncomeExpense = () => (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <RangePicker
          value={dateRange}
          onChange={(dates) => dates && setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
        />
        <Button icon={<SettingOutlined />} onClick={() => setTransactionCategoryModalVisible(true)}>
          设置
        </Button>
      </div>

      {/* 期初/期末资产 */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="期初资产"
              value={incomeExpenseData?.startAssets || 0}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.startAssets || 0) >= 0 ? '#3f8600' : '#cf1322', fontSize: 16 }}
              prefix="¥"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="期初负债"
              value={(incomeExpenseData?.startLiabilities || 0) <= 0 ? Math.abs(incomeExpenseData?.startLiabilities || 0) : -(incomeExpenseData?.startLiabilities || 0)}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.startLiabilities || 0) <= 0 ? '#cf1322' : '#3f8600', fontSize: 16 }}
              prefix="¥"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="期初净资产"
              value={incomeExpenseData?.startNetWorth || 0}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.startNetWorth || 0) >= 0 ? '#3f8600' : '#cf1322', fontSize: 16 }}
              prefix="¥"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="资产变动"
              value={incomeExpenseData?.assetChange || 0}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.assetChange || 0) >= 0 ? '#3f8600' : '#cf1322', fontSize: 16 }}
              prefix="¥"
            />
          </Col>
        </Row>
      </Card>

      <Divider style={{ margin: '12px 0' }} />

      {/* 收支汇总 */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="总收入"
              value={incomeExpenseData?.income || 0}
              precision={2}
              valueStyle={{ color: '#3f8600' }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="总支出"
              value={incomeExpenseData?.expense || 0}
              precision={2}
              valueStyle={{ color: '#cf1322' }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="结余"
              value={incomeExpenseData?.balance || 0}
              precision={2}
              valueStyle={{ color: incomeExpenseData?.balance >= 0 ? '#3f8600' : '#cf1322' }}
              prefix="¥"
            />
          </Col>
        </Row>
      </Card>

      {/* 图表区域 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <BarChart 
              title="收支对比" 
              xAxisData={['收入', '支出']}
              seriesData={[
                { name: '金额', data: [incomeExpenseData?.income || 0, incomeExpenseData?.expense || 0] }
              ]}
              height={250}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <PieChart 
              title="收入分类" 
              data={Object.entries(incomeExpenseData?.incomeByCategory || {})
                .map(([name, value]) => ({ name, value: value as number }))
                .filter(d => d.value > 0)
              }
              height={250}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <PieChart 
              title="支出分类" 
              data={Object.entries(incomeExpenseData?.expenseByCategory || {})
                .map(([name, value]) => ({ name, value: Math.abs(value as number) }))
                .filter(d => d.value > 0)
              }
              height={250}
            />
          </Card>
        </Col>
      </Row>

      <Divider style={{ margin: '12px 0' }} />

      {/* 期末资产 */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="期末资产"
              value={incomeExpenseData?.endAssets || 0}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.endAssets || 0) >= 0 ? '#3f8600' : '#cf1322', fontSize: 16 }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="期末负债"
              value={(incomeExpenseData?.endLiabilities || 0) <= 0 ? Math.abs(incomeExpenseData?.endLiabilities || 0) : -(incomeExpenseData?.endLiabilities || 0)}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.endLiabilities || 0) <= 0 ? '#cf1322' : '#3f8600', fontSize: 16 }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="期末净资产"
              value={incomeExpenseData?.endNetWorth || 0}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.endNetWorth || 0) >= 0 ? '#3f8600' : '#cf1322', fontSize: 16 }}
              prefix="¥"
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="收入明细" size="small">
            <Table
              dataSource={Object.entries(incomeExpenseData?.incomeByCategory || {}).map(([name, value]) => ({
                name,
                value,
              }))}
              columns={[
                { title: '分类', dataIndex: 'name', key: 'name' },
                { title: '金额', dataIndex: 'value', key: 'value', render: (v: number) => `¥${v.toFixed(2)}` },
              ]}
              rowKey="name"
              size="small"
              pagination={false}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="支出明细" size="small">
            <Table
              dataSource={Object.entries(incomeExpenseData?.expenseByCategory || {}).map(([name, value]) => ({
                name,
                value,
              }))}
              columns={[
                { title: '分类', dataIndex: 'name', key: 'name' },
                { title: '金额', dataIndex: 'value', key: 'value', render: (v: number) => `¥${v.toFixed(2)}` },
              ]}
              rowKey="name"
              size="small"
              pagination={false}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )

  const renderCashFlow = () => (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <RangePicker
          value={cashFlowDateRange}
          onChange={(dates) => dates && setCashFlowDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
        />
        <Button icon={<SettingOutlined />} onClick={() => setCashFlowConfigModalVisible(true)}>
          设置
        </Button>
      </div>

      {/* 期初/期末现金 */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="期初现金"
              value={cashFlowData?.startCash || 0}
              precision={2}
              valueStyle={{ color: '#1890ff', fontSize: 16 }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="期末现金"
              value={cashFlowData?.endCash || 0}
              precision={2}
              valueStyle={{ color: '#52c41a', fontSize: 16 }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="现金变动"
              value={(cashFlowData?.endCash || 0) - (cashFlowData?.startCash || 0)}
              precision={2}
              valueStyle={{ color: ((cashFlowData?.endCash || 0) - (cashFlowData?.startCash || 0)) >= 0 ? '#3f8600' : '#cf1322', fontSize: 16 }}
              prefix="¥"
            />
          </Col>
        </Row>
      </Card>

      <Divider style={{ margin: '12px 0' }} />

      {/* 现金流汇总 */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="现金流入"
              value={cashFlowData?.cashInflow || 0}
              precision={2}
              valueStyle={{ color: '#3f8600' }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="现金流出"
              value={cashFlowData?.cashOutflow || 0}
              precision={2}
              valueStyle={{ color: '#cf1322' }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="净现金流"
              value={cashFlowData?.netCashFlow || 0}
              precision={2}
              valueStyle={{ color: cashFlowData?.netCashFlow >= 0 ? '#3f8600' : '#cf1322' }}
              prefix="¥"
            />
          </Col>
        </Row>
      </Card>

      {/* 图表区域 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small">
            <BarChart 
              title="三类现金流对比" 
              xAxisData={['经营', '投资', '筹资']}
              seriesData={[
                { name: '流入', data: [
                  cashFlowData?.byActivity?.operating?.inflow || 0,
                  cashFlowData?.byActivity?.investing?.inflow || 0,
                  cashFlowData?.byActivity?.financing?.inflow || 0
                ], color: '#52c41a' },
                { name: '流出', data: [
                  Math.abs(cashFlowData?.byActivity?.operating?.outflow || 0),
                  Math.abs(cashFlowData?.byActivity?.investing?.outflow || 0),
                  Math.abs(cashFlowData?.byActivity?.financing?.outflow || 0)
                ], color: '#ff4d4f' }
              ]}
              height={280}
              loading={cashFlowLoading}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small">
            <SankeyChart 
              title="现金流量流向" 
              nodes={cashFlowData?.sankey?.nodes || []}
              links={cashFlowData?.sankey?.links || []}
              height={280}
              loading={cashFlowLoading}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={8}>
          <Card 
            title={<><Tag color="green">经营</Tag> 经营活动</>} 
            size="small"
            extra={<span style={{ fontWeight: 'bold', color: (cashFlowData?.byActivity?.operating?.net != null && cashFlowData.byActivity.operating.net >= 0) ? '#3f8600' : '#cf1322' }}>
              ¥{(cashFlowData?.byActivity?.operating?.net != null ? cashFlowData.byActivity.operating.net : 0).toFixed(2)}
            </span>}
          >
            <div>流入: ¥{(cashFlowData?.byActivity?.operating?.inflow != null ? cashFlowData.byActivity.operating.inflow : 0).toFixed(2)}</div>
            <div>流出: ¥{(cashFlowData?.byActivity?.operating?.outflow != null ? cashFlowData.byActivity.operating.outflow : 0).toFixed(2)}</div>
          </Card>
        </Col>
        <Col span={8}>
          <Card 
            title={<><Tag color="blue">投资</Tag> 投资活动</>} 
            size="small"
            extra={<span style={{ fontWeight: 'bold', color: (cashFlowData?.byActivity?.investing?.net != null && cashFlowData.byActivity.investing.net >= 0) ? '#3f8600' : '#cf1322' }}>
              ¥{(cashFlowData?.byActivity?.investing?.net != null ? cashFlowData.byActivity.investing.net : 0).toFixed(2)}
            </span>}
          >
            <div>流入: ¥{(cashFlowData?.byActivity?.investing?.inflow != null ? cashFlowData.byActivity.investing.inflow : 0).toFixed(2)}</div>
            <div>流出: ¥{(cashFlowData?.byActivity?.investing?.outflow != null ? cashFlowData.byActivity.investing.outflow : 0).toFixed(2)}</div>
          </Card>
        </Col>
        <Col span={8}>
          <Card 
            title={<><Tag color="orange">筹资</Tag> 筹资活动</>} 
            size="small"
            extra={<span style={{ fontWeight: 'bold', color: (cashFlowData?.byActivity?.financing?.net != null && cashFlowData.byActivity.financing.net >= 0) ? '#3f8600' : '#cf1322' }}>
              ¥{(cashFlowData?.byActivity?.financing?.net != null ? cashFlowData.byActivity.financing.net : 0).toFixed(2)}
            </span>}
          >
            <div>流入: ¥{(cashFlowData?.byActivity?.financing?.inflow != null ? cashFlowData.byActivity.financing.inflow : 0).toFixed(2)}</div>
            <div>流出: ¥{(cashFlowData?.byActivity?.financing?.outflow != null ? cashFlowData.byActivity.financing.outflow : 0).toFixed(2)}</div>
          </Card>
        </Col>
      </Row>

      {cashFlowData?.cashAccounts && (
        <Card title="现金账户" size="small" style={{ marginTop: 16 }}>
          <div>{cashFlowData.cashAccounts.join('、')}</div>
        </Card>
      )}
    </div>
  )

  const tabItems = [
    { key: 'balance-sheet', label: '资产负债表', children: renderBalanceSheet() },
    { key: 'income-expense', label: '收入支出表', children: renderIncomeExpense() },
    { key: 'cash-flow', label: '现金流量表', children: renderCashFlow() },
  ]

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>财务报表</h2>
      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </Card>

      <AccountCategoryModal
        visible={accountCategoryModalVisible}
        onClose={() => setAccountCategoryModalVisible(false)}
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
        title={`校准 ${selectedMonth.format('YYYY年MM月')} 月初资产负债`}
        open={calibrateVisible}
        onOk={handleSaveCalibration}
        onCancel={() => setCalibrateVisible(false)}
        okText="保存并生成平账记录"
        cancelText="取消"
        width={700}
      >
        <p style={{ color: '#666', marginBottom: 16 }}>
          请输入各账户在月初（1日）的准确余额。系统将自动计算差额并生成平账收支记录。
        </p>
        {balanceSheetData?.accounts?.map((account: any) => (
          <div key={account.id} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ width: 150 }}>
              <DynamicIcon name={account.icon} size={16} fallback="wallet" /> {account.name}
            </span>
            <Space>
              <span style={{ color: '#999', fontSize: 12 }}>
                计算值: ¥{account.calculatedBalance?.toFixed(2) || '0.00'}
              </span>
              <InputNumber
                value={calibrateData[account.id]}
                onChange={(value) => setCalibrateData({ ...calibrateData, [account.id]: value || 0 })}
                precision={2}
                style={{ width: 150 }}
                prefix="¥"
                placeholder="矫正值"
              />
            </Space>
          </div>
        ))}
      </Modal>
    </div>
  )
}

export default Reports
