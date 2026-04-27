import React, { useEffect, useState } from 'react'
import { Card, List, Spin, Statistic, Tag } from 'antd'
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import dayjs from 'dayjs'
import { DynamicIcon, PageHeader } from '../components/common'
import PieChart, { PieChartDataItem } from '../components/charts/PieChart'
import * as api from '../services/api'
import { useStore } from '../stores'
import type { AnalyticsCategoryBreakdownItem, AnalyticsTrendItem } from '../services/api'
import { colorInfo, colorNegative, colorNeutral, colorPositive, colorIncome, colorExpense, fontWeightBold } from '../styles/tokens'
import { getTokenValue } from '../styles/utils'

const Dashboard: React.FC = () => {
  const { accounts, transactions, fetchAccounts, fetchTransactions } = useStore()
  const [loading, setLoading] = useState(false)
  const [trendData, setTrendData] = useState<AnalyticsTrendItem[]>([])
  const [categoryData, setCategoryData] = useState<AnalyticsCategoryBreakdownItem[]>([])

  useEffect(() => {
    fetchAccounts()
    fetchTransactions()
    void fetchAnalytics()
  }, [fetchAccounts, fetchTransactions])

  const fetchAnalytics = async () => {
    setLoading(true)
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
      setLoading(false)
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
    title: {
      text: '支出趋势',
      left: 'left',
      textStyle: {
        color: getTokenValue('--mb-color-text'),
        fontSize: 16,
        fontWeight: 700,
      },
    },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: trendData.map((item) => item.label),
      axisLabel: { rotate: 40, color: getTokenValue('--mb-color-neutral') },
      axisLine: { lineStyle: { color: getTokenValue('--mb-color-border') } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: '¥{value}', color: getTokenValue('--mb-color-neutral') },
      splitLine: { lineStyle: { color: getTokenValue('--mb-color-border') } },
    },
    series: [
      {
        data: trendData.map((item) => item.amount),
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.2 },
        itemStyle: { color: getTokenValue('--mb-color-primary') },
        lineStyle: { width: 3, color: getTokenValue('--mb-color-primary') },
      },
    ],
    grid: { left: '8%', right: '4%', bottom: '18%', top: '20%' },
  }

  return (
    <Spin spinning={loading}>
      <PageHeader
        eyebrow="Overview"
        title="财务总览"
        description="先看净资产、本月收支和近期变动。"
      />

      <div className="kpi-grid">
        <Card className="surface-card metric-card">
          <span className="metric-card__label">总资产</span>
          <div className="metric-card__value" style={{ color: totalAssets >= 0 ? colorPositive : colorNegative }}>
            ¥{totalAssets.toFixed(2)}
          </div>
        </Card>

        <Card className="surface-card metric-card">
          <span className="metric-card__label">总负债</span>
          <div className="metric-card__value" style={{ color: totalLiabilities <= 0 ? colorNegative : colorPositive }}>
            ¥{Math.abs(totalLiabilities).toFixed(2)}
          </div>
        </Card>

        <Card className="surface-card metric-card">
          <span className="metric-card__label">净资产</span>
          <div className="metric-card__value" style={{ color: colorInfo }}>
            ¥{netWorth.toFixed(2)}
          </div>
        </Card>

        <Card className="surface-card metric-card">
          <span className="metric-card__label">本月结余</span>
          <div className="metric-card__value" style={{ color: thisMonthBalance >= 0 ? colorPositive : colorNegative }}>
            ¥{thisMonthBalance.toFixed(2)}
          </div>
        </Card>
      </div>

      <div className="split-grid">
        <Card className="surface-card" title="本月收支">
          <div className="split-grid">
            <Card className="surface-card surface-card--muted" bordered={false}>
              <Statistic
                title="收入"
                value={thisMonthIncome}
                precision={2}
                valueStyle={{ color: colorPositive }}
                prefix={<ArrowUpOutlined />}
                formatter={(value) => `¥${Number(value).toFixed(2)}`}
              />
            </Card>
            <Card className="surface-card surface-card--muted" bordered={false}>
              <Statistic
                title="支出"
                value={thisMonthExpense}
                precision={2}
                valueStyle={{ color: colorNegative }}
                prefix={<ArrowDownOutlined />}
                formatter={(value) => `¥${Number(value).toFixed(2)}`}
              />
            </Card>
          </div>
        </Card>

        <Card className="surface-card" title="最近交易">
          <List
            dataSource={recentTransactions}
            locale={{ emptyText: '暂无交易记录' }}
            renderItem={(item) => (
              <List.Item>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, width: '100%' }}>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Tag style={{ color: item.type === 'income' ? colorIncome : colorExpense, borderColor: item.type === 'income' ? colorIncome : colorExpense, backgroundColor: 'transparent' }}>
                        <DynamicIcon name={item.category?.icon} size={14} /> {item.category?.name || '未分类'}
                      </Tag>
                      <span style={{ color: colorNeutral }}>{dayjs(item.date).format('MM-DD')}</span>
                    </div>
                    <span style={{ color: colorNeutral }}>{item.account?.name || '未关联账户'}</span>
                  </div>
                  <span
                    style={{
                      color: item.type === 'income' ? colorPositive : colorNegative,
                      fontWeight: fontWeightBold,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.type === 'income' ? '+' : '-'}¥{Number(item.amount).toFixed(2)}
                  </span>
                </div>
              </List.Item>
            )}
          />
        </Card>
      </div>

      <div className="split-grid">
        <Card className="surface-card chart-panel">
          <ReactECharts option={trendOption} style={{ height: 320 }} />
        </Card>
        <Card className="surface-card chart-panel">
          <PieChart title="支出分类" data={categoryData} height={320} onDrillDown={handleDrillDown} />
        </Card>
      </div>
    </Spin>
  )
}

export default Dashboard
