import React, { useEffect, useState } from 'react'
import { Card, Row, Col, Statistic, List, Tag, Spin } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import dayjs from 'dayjs'
import { useStore } from '../stores'
import * as api from '../services/api'
import DynamicIcon from '../components/common/DynamicIcon'
import PieChart, { PieChartDataItem } from '../components/charts/PieChart'
import type { AnalyticsCategoryBreakdownItem, AnalyticsTrendItem } from '../services/api'
import {
  colorInfo,
  colorPositive,
  colorNegative,
  colorNeutral,
  spaceLg,
  spaceMd,
  fontWeightBold,
} from '../styles/tokens'
import { getTokenValue } from '../styles/utils'

const Dashboard: React.FC = () => {
  const { accounts, transactions, fetchAccounts, fetchTransactions } = useStore()
  const [loading, setLoading] = useState(false)
  const [trendData, setTrendData] = useState<AnalyticsTrendItem[]>([])
  const [categoryData, setCategoryData] = useState<AnalyticsCategoryBreakdownItem[]>([])

  useEffect(() => {
    fetchAccounts()
    fetchTransactions()
    fetchAnalytics()
  }, [])

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
      console.error('获取分析数据失败:', error)
    }
    setLoading(false)
  }

  const handleDrillDown = async (item: PieChartDataItem): Promise<AnalyticsCategoryBreakdownItem[]> => {
    if (!item.categoryId) return []
    try {
      const res = await api.analyticsApi.getCategoryBreakdown('expense', undefined, undefined, item.categoryId)
      if (res.data.success && res.data.data) {
        return res.data.data
      }
    } catch (error) {
      console.error('获取二级分类数据失败:', error)
    }
    return []
  }

  const totalAssets = accounts
    .filter(a => a.type === 'asset')
    .reduce((sum, a) => sum + Number(a.balance), 0)
  const totalLiabilities = accounts
    .filter(a => a.type === 'liability')
    .reduce((sum, a) => sum + Number(a.balance), 0)
  const netWorth = totalAssets + totalLiabilities

  const thisMonthStart = dayjs().startOf('month')
  const thisMonthTransactions = transactions.filter(t =>
    dayjs(t.date).isAfter(thisMonthStart) || dayjs(t.date).isSame(thisMonthStart)
  )
  const thisMonthIncome = thisMonthTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0)
  const thisMonthExpense = thisMonthTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0)
  const thisMonthBalance = thisMonthIncome - thisMonthExpense

  const recentTransactions = [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)

  const trendOption = {
    title: { text: '支出趋势', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: trendData.map(d => d.label),
      axisLabel: { rotate: 45 }
    },
    yAxis: { type: 'value', axisLabel: { formatter: '¥{value}' } },
    series: [{
      data: trendData.map(d => d.amount),
      type: 'line',
      smooth: true,
      areaStyle: { opacity: 0.3 },
      itemStyle: { color: getTokenValue('--mb-chart-color-primary') },
    }],
    grid: { left: '10%', right: '10%', bottom: '20%' },
  }

  return (
    <Spin spinning={loading}>
      <div>
        <h2 style={{ marginBottom: spaceLg }}>首页概览</h2>
        
        <Row gutter={16}>
          <Col span={6}>
            <Card>
              <Statistic
                title="总资产"
                value={totalAssets}
                precision={2}
                valueStyle={{ color: totalAssets >= 0 ? colorPositive : colorNegative }}
                prefix="¥"
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="总负债"
                value={totalLiabilities <= 0 ? Math.abs(totalLiabilities) : -totalLiabilities}
                precision={2}
                valueStyle={{ color: totalLiabilities <= 0 ? colorNegative : colorPositive }}
                prefix="¥"
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="净资产"
                value={netWorth}
                precision={2}
                valueStyle={{ color: colorInfo }}
                prefix="¥"
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="本月结余"
                value={thisMonthBalance}
                precision={2}
                valueStyle={{ color: thisMonthBalance >= 0 ? colorPositive : colorNegative }}
                prefix="¥"
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={16} style={{ marginTop: spaceMd }}>
          <Col span={12}>
            <Card title="本月收支">
              <Row gutter={16}>
                <Col span={12}>
                  <Statistic
                    title="收入"
                    value={thisMonthIncome}
                    precision={2}
                    valueStyle={{ color: colorPositive }}
                    prefix={<ArrowUpOutlined />}
                    suffix="元"
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="支出"
                    value={thisMonthExpense}
                    precision={2}
                    valueStyle={{ color: colorNegative }}
                    prefix={<ArrowDownOutlined />}
                    suffix="元"
                  />
                </Col>
              </Row>
            </Card>
          </Col>
          <Col span={12}>
            <Card title="最近交易">
              <List
                dataSource={recentTransactions}
                renderItem={item => (
                  <List.Item>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <div>
                        <Tag color={item.type === 'income' ? 'green' : 'red'}>
                          <DynamicIcon name={item.category?.icon} size={14} /> {item.category?.name || '未分类'}
                        </Tag>
                        <span style={{ marginLeft: 8, color: colorNeutral }}>
                          {dayjs(item.date).format('MM-DD')}
                        </span>
                      </div>
                      <span style={{
                        color: item.type === 'income' ? colorPositive : colorNegative,
                        fontWeight: fontWeightBold,
                      }}>
                        {item.type === 'income' ? '+' : '-'}¥{Number(item.amount).toFixed(2)}
                      </span>
                    </div>
                  </List.Item>
                )}
                locale={{ emptyText: '暂无交易记录' }}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={16} style={{ marginTop: spaceMd }}>
          <Col span={12}>
            <Card>
              <ReactECharts option={trendOption} style={{ height: 300 }} />
            </Card>
          </Col>
          <Col span={12}>
            <Card>
              <PieChart
                title="支出分类"
                data={categoryData}
                height={300}
                onDrillDown={handleDrillDown}
              />
            </Card>
          </Col>
        </Row>
      </div>
    </Spin>
  )
}

export default Dashboard
