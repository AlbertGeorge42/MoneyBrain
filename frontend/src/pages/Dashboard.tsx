import React, { useEffect, useState } from 'react'
import { Card, Row, Col, Statistic, List, Tag, Spin } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import dayjs from 'dayjs'
import { useStore } from '../stores'
import * as api from '../services/api'

const Dashboard: React.FC = () => {
  const { accounts, transactions, fetchAccounts, fetchTransactions } = useStore()
  const [loading, setLoading] = useState(false)
  const [trendData, setTrendData] = useState<any[]>([])
  const [categoryData, setCategoryData] = useState<any[]>([])

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

  const totalAssets = accounts
    .filter(a => a.type === 'asset')
    .reduce((sum, a) => sum + Number(a.balance), 0)
  const totalLiabilities = accounts
    .filter(a => a.type === 'liability')
    .reduce((sum, a) => sum + Number(a.balance), 0)
  const netWorth = totalAssets - totalLiabilities

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
      itemStyle: { color: '#1890ff' },
    }],
    grid: { left: '10%', right: '10%', bottom: '20%' },
  }

  const categoryOption = {
    title: { text: '支出分类', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      data: categoryData.slice(0, 6).map(d => ({ name: d.name, value: d.value })),
      label: { show: true, formatter: '{b}\n{d}%' },
    }],
  }

  return (
    <Spin spinning={loading}>
      <div>
        <h2 style={{ marginBottom: 24 }}>首页概览</h2>
        
        <Row gutter={16}>
          <Col span={6}>
            <Card>
              <Statistic
                title="总资产"
                value={totalAssets}
                precision={2}
                valueStyle={{ color: '#3f8600' }}
                prefix="¥"
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="总负债"
                value={totalLiabilities}
                precision={2}
                valueStyle={{ color: '#cf1322' }}
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
                valueStyle={{ color: '#1890ff' }}
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
                valueStyle={{ color: thisMonthBalance >= 0 ? '#3f8600' : '#cf1322' }}
                prefix="¥"
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col span={12}>
            <Card title="本月收支">
              <Row gutter={16}>
                <Col span={12}>
                  <Statistic
                    title="收入"
                    value={thisMonthIncome}
                    precision={2}
                    valueStyle={{ color: '#3f8600' }}
                    prefix={<ArrowUpOutlined />}
                    suffix="元"
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="支出"
                    value={thisMonthExpense}
                    precision={2}
                    valueStyle={{ color: '#cf1322' }}
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
                          {item.category?.icon} {item.category?.name || '未分类'}
                        </Tag>
                        <span style={{ marginLeft: 8, color: '#666' }}>
                          {dayjs(item.date).format('MM-DD')}
                        </span>
                      </div>
                      <span style={{ 
                        color: item.type === 'income' ? '#3f8600' : '#cf1322',
                        fontWeight: 'bold'
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

        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col span={12}>
            <Card>
              <ReactECharts option={trendOption} style={{ height: 300 }} />
            </Card>
          </Col>
          <Col span={12}>
            <Card>
              <ReactECharts option={categoryOption} style={{ height: 300 }} />
            </Card>
          </Col>
        </Row>
      </div>
    </Spin>
  )
}

export default Dashboard
