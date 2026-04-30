import React, { useEffect, useState } from 'react'
import { Card, List, Statistic, Tag, Empty, Skeleton } from 'antd'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  AccountBookOutlined,
  CreditCardOutlined,
  StockOutlined,
  TransactionOutlined,
  RightOutlined,
} from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { DynamicIcon, PageHeader } from '../components/common'
import PieChart, { PieChartDataItem } from '../components/charts/PieChart'
import * as api from '../services/api'
import { useStore } from '../stores'
import type { AnalyticsCategoryBreakdownItem, AnalyticsTrendItem } from '../services/api'
import {
  colorNegative,
  colorPositive,
  colorIncome,
  colorExpense,
  colorPrimary,
} from '../styles/tokens'
import { getTokenValue } from '../styles/utils'

const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const { accounts, transactions, fetchAccounts, fetchTransactions } = useStore()
  const [chartLoading, setChartLoading] = useState(false)
  const [trendData, setTrendData] = useState<AnalyticsTrendItem[]>([])
  const [categoryData, setCategoryData] = useState<AnalyticsCategoryBreakdownItem[]>([])

  useEffect(() => {
    fetchAccounts()
    fetchTransactions()
    void fetchAnalytics()
  }, [fetchAccounts, fetchTransactions])

  const fetchAnalytics = async () => {
    setChartLoading(true)
    try {
      const [trendRes, categoryRes] = await Promise.all([
        api.analyticsApi.getTrends('expense'),
        api.analyticsApi.getCategoryBreakdown('expense'),
      ])

      if (trendRes.data.success && trendRes.data.data) {
        setTrendData(trendRes.data.data)
      }

      if (categoryRes.data.success && categoryRes.data.data) {
        setCategoryData(categoryRes.data.data)
      }
    } catch (error) {
      console.error('Failed to fetch dashboard analytics:', error)
    } finally {
      setChartLoading(false)
    }
  }

  const handleDrillDown = async (item: PieChartDataItem): Promise<AnalyticsCategoryBreakdownItem[]> => {
    if (!item.categoryId) return []

    try {
      const res = await api.analyticsApi.getCategoryBreakdown('expense', undefined, undefined, item.categoryId)
      if (res.data.success && res.data.data) {
        return res.data.data
      }
    } catch (error) {
      console.error('Failed to fetch drilldown data:', error)
    }

    return []
  }

  const totalAssets = accounts.filter((account) => account.type === 'asset').reduce((sum, account) => sum + Number(account.balance), 0)
  const totalLiabilities = accounts
    .filter((account) => account.type === 'liability')
    .reduce((sum, account) => sum + Number(account.balance), 0)
  const netWorth = totalAssets + totalLiabilities

  const thisMonthStart = dayjs().startOf('month')
  const thisMonthTransactions = transactions.filter((transaction) =>
    dayjs(transaction.date).isAfter(thisMonthStart) || dayjs(transaction.date).isSame(thisMonthStart)
  )
  const thisMonthIncome = thisMonthTransactions
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0)
  const thisMonthExpense = thisMonthTransactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0)
  const thisMonthBalance = thisMonthIncome - thisMonthExpense

  const recentTransactions = [...transactions]
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, 5)

  const trendOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ name: string; value: number }>) => {
        const item = params[0]
        return `${item.name}<br/>支出: ¥${item.value.toFixed(2)}`
      },
    },
    xAxis: {
      type: 'category',
      data: trendData.map((item) => item.label),
      axisLabel: { rotate: 40, color: getTokenValue('--mb-color-neutral'), fontSize: 11 },
      axisLine: { lineStyle: { color: getTokenValue('--mb-color-border') } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: '¥{value}', color: getTokenValue('--mb-color-neutral'), fontSize: 11 },
      splitLine: { lineStyle: { color: getTokenValue('--mb-color-border'), type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        data: trendData.map((item) => item.amount),
        type: 'line',
        smooth: true,
        areaStyle: {
          opacity: 0.15,
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: getTokenValue('--mb-color-primary') },
              { offset: 1, color: 'rgba(30, 99, 218, 0.05)' },
            ],
          },
        },
        itemStyle: { color: getTokenValue('--mb-color-primary') },
        lineStyle: { width: 2.5, color: getTokenValue('--mb-color-primary') },
        symbol: 'circle',
        symbolSize: 6,
      },
    ],
    grid: { left: '10%', right: '4%', bottom: '20%', top: '8%' },
  }

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="财务总览"
        description="先看净资产、本月收支和近期变动。"
      />

      <div className="kpi-grid dashboard-kpi-grid">
        <Card className="surface-card metric-card">
          <div className="metric-card__header">
            <AccountBookOutlined style={{ fontSize: 20, color: colorPrimary }} />
            <span className="metric-card__label">总资产</span>
          </div>
          <div className="metric-card__value" style={{ color: totalAssets >= 0 ? colorPositive : colorNegative }}>
            {totalAssets.toFixed(2)}
          </div>
        </Card>

        <Card className="surface-card metric-card">
          <div className="metric-card__header">
            <CreditCardOutlined style={{ fontSize: 20, color: colorNegative }} />
            <span className="metric-card__label">总负债</span>
          </div>
          <div className="metric-card__value" style={{ color: colorNegative }}>
            {Math.abs(totalLiabilities).toFixed(2)}
          </div>
        </Card>

        <Card className="surface-card metric-card">
          <div className="metric-card__header">
            <StockOutlined style={{ fontSize: 20, color: colorPositive }} />
            <span className="metric-card__label">净资产</span>
          </div>
          <div className="metric-card__value" style={{ color: netWorth >= 0 ? colorPositive : colorNegative }}>
            {netWorth.toFixed(2)}
          </div>
        </Card>

        <Card className="surface-card metric-card">
          <div className="metric-card__header">
            <TransactionOutlined style={{ fontSize: 20, color: thisMonthBalance >= 0 ? colorPositive : colorNegative }} />
            <span className="metric-card__label">本月结余</span>
          </div>
          <div className="metric-card__value" style={{ color: thisMonthBalance >= 0 ? colorPositive : colorNegative }}>
            {thisMonthBalance.toFixed(2)}
          </div>
        </Card>
      </div>

      <div className="split-grid">
        <Card className="surface-card" title="本月收支">
          <div className="income-expense-grid">
            <div className="income-expense-item">
              <Statistic
                title="收入"
                value={thisMonthIncome}
                precision={2}
                valueStyle={{ color: colorPositive, fontSize: 24 }}
                prefix={<ArrowUpOutlined />}
                formatter={(value) => `¥${Number(value).toFixed(2)}`}
              />
            </div>
            <div className="income-expense-divider" />
            <div className="income-expense-item">
              <Statistic
                title="支出"
                value={thisMonthExpense}
                precision={2}
                valueStyle={{ color: colorNegative, fontSize: 24 }}
                prefix={<ArrowDownOutlined />}
                formatter={(value) => `¥${Number(value).toFixed(2)}`}
              />
            </div>
          </div>
        </Card>

        <Card
          className="surface-card"
          title="最近交易"
          extra={
            <span
              className="card-extra-link"
              onClick={() => navigate('/transactions')}
            >
              查看全部 <RightOutlined style={{ fontSize: 10 }} />
            </span>
          }
        >
          {recentTransactions.length === 0 ? (
            <Empty description="暂无交易记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <List
              dataSource={recentTransactions}
              renderItem={(item) => (
                <List.Item className="transaction-list-item">
                  <div className="transaction-list-item__main">
                    <div className="transaction-list-item__info">
                      <Tag
                        className="transaction-list-item__tag"
                        style={{
                          color: item.type === 'income' ? colorIncome : colorExpense,
                          borderColor: item.type === 'income' ? colorIncome : colorExpense,
                        }}
                      >
                        <DynamicIcon name={item.category?.icon} size={14} /> {item.category?.name || '未分类'}
                      </Tag>
                      <span className="transaction-list-item__date">
                        {dayjs(item.date).format('MM-DD')}
                      </span>
                    </div>
                    <span className="transaction-list-item__account">
                      {item.account?.name || '未关联账户'}
                    </span>
                  </div>
                  <span
                    className="transaction-list-item__amount"
                    style={{ color: item.type === 'income' ? colorPositive : colorNegative }}
                  >
                    {item.type === 'income' ? '+' : '-'}¥{Number(item.amount).toFixed(2)}
                  </span>
                </List.Item>
              )}
            />
          )}
        </Card>
      </div>

      <div className="split-grid">
        <Card className="surface-card chart-panel">
          <div className="chart-panel__header">
            <h3 className="chart-panel__title">支出趋势</h3>
          </div>
          {chartLoading ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : trendData.length === 0 ? (
            <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 80 }} />
          ) : (
            <ReactECharts option={trendOption} style={{ height: 300 }} />
          )}
        </Card>
        <Card className="surface-card chart-panel">
          <div className="chart-panel__header">
            <h3 className="chart-panel__title">支出分类</h3>
          </div>
          {chartLoading ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : (
            <PieChart title="" data={categoryData} height={300} onDrillDown={handleDrillDown} />
          )}
        </Card>
      </div>
    </>
  )
}

export default Dashboard
