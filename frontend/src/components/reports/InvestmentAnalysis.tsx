import React from 'react'
import { Card, Button, Table, Row, Col, Statistic, Space, Empty } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import DynamicIcon from '../common/DynamicIcon'
import { RangeTimePickerField, type RangeTimePickerConfig, type RangeTimeValue } from '../common'
import { PieChart, LineChart } from '../charts'
import type { InvestmentAnalysisReportData, InvestmentAccountDetail } from '@shared/types'

interface InvestmentAnalysisProps {
  timeRange: RangeTimeValue
  pickerConfig: RangeTimePickerConfig
  investmentData: InvestmentAnalysisReportData | null
  onTimeRangeChange: (value: RangeTimeValue) => void
  onOpenSettings: () => void
}

const formatPercent = (value: number | null): string => {
  if (value === null) return '--'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

const formatCurrency = (value: number): string => {
  return `¥${value.toFixed(2)}`
}

const InvestmentAnalysis: React.FC<InvestmentAnalysisProps> = ({
  timeRange,
  pickerConfig,
  investmentData,
  onTimeRangeChange,
  onOpenSettings,
}) => {
  if (!investmentData) {
    return (
      <div>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <RangeTimePickerField value={timeRange} config={pickerConfig} onChange={onTimeRangeChange} />
          </Space>
          <Button icon={<SettingOutlined />} onClick={onOpenSettings}>
            设置
          </Button>
        </div>
        <Card>
          <Empty
            description="暂无投资账户，请在账户分类设置中标记投资类账户"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </Card>
      </div>
    )
  }

  const { returnAnalysis, byCategory, trend } = investmentData

  const pieData = byCategory.map(cat => ({
    name: cat.categoryName,
    value: Math.abs(cat.balance),
  })).filter(d => d.value > 0)

  const lineChartData = {
    xAxisData: trend.map(t => t.month),
    seriesData: [
      {
        name: '投资总额',
        data: trend.map(t => t.investment),
        color: '#722ed1',
      },
    ],
  }

  const allAccounts: InvestmentAccountDetail[] = byCategory.flatMap(cat => cat.accounts)

  const columns = [
    {
      title: '账户名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: InvestmentAccountDetail) => (
        <span>
          <DynamicIcon name={record.icon} size={16} fallback="wallet" /> {text}
        </span>
      ),
    },
    {
      title: '分类',
      dataIndex: 'categoryName',
      key: 'categoryName',
      render: (text: string, record: InvestmentAccountDetail) => (
        <span>
          <DynamicIcon name={record.categoryIcon} size={14} fallback="folder" /> {text}
        </span>
      ),
    },
    {
      title: '期末余额',
      dataIndex: 'balance',
      key: 'balance',
      align: 'right' as const,
      render: (v: number) => formatCurrency(v),
    },
    {
      title: '占比',
      dataIndex: 'ratio',
      key: 'ratio',
      align: 'right' as const,
      width: 80,
      render: (v: number) => `${v.toFixed(1)}%`,
    },
    {
      title: '期间投入',
      dataIndex: 'totalInvested',
      key: 'totalInvested',
      align: 'right' as const,
      render: (v: number) => formatCurrency(v),
    },
    {
      title: '期间取出',
      dataIndex: 'totalWithdrawn',
      key: 'totalWithdrawn',
      align: 'right' as const,
      render: (v: number) => formatCurrency(v),
    },
    {
      title: '期间收益率',
      dataIndex: 'simpleReturnRate',
      key: 'simpleReturnRate',
      align: 'right' as const,
      width: 100,
      render: (v: number) => (
        <span style={{ color: v >= 0 ? '#3f8600' : '#cf1322', fontWeight: 'bold' }}>
          {formatPercent(v)}
        </span>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <RangeTimePickerField value={timeRange} config={pickerConfig} onChange={onTimeRangeChange} />
          <span style={{ color: '#666' }}>
            {investmentData.startDate} 至 {investmentData.endDate}
          </span>
        </Space>
        <Button icon={<SettingOutlined />} onClick={onOpenSettings}>
          设置
        </Button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="期初价值"
              value={returnAnalysis.startValue}
              precision={2}
              valueStyle={{ color: '#666' }}
              prefix="¥"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="期末价值"
              value={returnAnalysis.endValue}
              precision={2}
              valueStyle={{ color: '#722ed1' }}
              prefix="¥"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="价值变化"
              value={returnAnalysis.valueChange}
              precision={2}
              valueStyle={{ color: returnAnalysis.valueChange >= 0 ? '#3f8600' : '#cf1322' }}
              prefix="¥"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="投资占比"
              value={investmentData.investmentRatio}
              precision={2}
              valueStyle={{ color: '#1890ff' }}
              suffix="%"
            />
          </Col>
        </Row>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="期间投入"
              value={returnAnalysis.periodInvested}
              precision={2}
              valueStyle={{ color: '#666' }}
              prefix="¥"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="期间取出"
              value={returnAnalysis.periodWithdrawn}
              precision={2}
              valueStyle={{ color: '#666' }}
              prefix="¥"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="净现金流"
              value={returnAnalysis.netCashFlow}
              precision={2}
              valueStyle={{ color: '#666' }}
              prefix="¥"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="期间收益"
              value={returnAnalysis.periodReturn}
              precision={2}
              valueStyle={{ color: returnAnalysis.periodReturn >= 0 ? '#3f8600' : '#cf1322' }}
              prefix="¥"
            />
          </Col>
        </Row>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="简单收益率"
              value={returnAnalysis.simpleReturnRate}
              precision={2}
              valueStyle={{ color: returnAnalysis.simpleReturnRate >= 0 ? '#3f8600' : '#cf1322' }}
              suffix="%"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="XIRR (年化)"
              value={returnAnalysis.xirr !== null ? returnAnalysis.xirr : '--'}
              precision={returnAnalysis.xirr !== null ? 2 : 0}
              valueStyle={{ color: (returnAnalysis.xirr || 0) >= 0 ? '#3f8600' : '#cf1322' }}
              suffix={returnAnalysis.xirr !== null ? '%' : ''}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="TWR (年化)"
              value={returnAnalysis.annualizedTwr !== null ? returnAnalysis.annualizedTwr : '--'}
              precision={returnAnalysis.annualizedTwr !== null ? 2 : 0}
              valueStyle={{ color: (returnAnalysis.annualizedTwr || 0) >= 0 ? '#3f8600' : '#cf1322' }}
              suffix={returnAnalysis.annualizedTwr !== null ? '%' : ''}
            />
          </Col>
        </Row>
        <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
          投资天数: {returnAnalysis.investmentDays} 天 | 现金流笔数: {returnAnalysis.cashFlowCount} 笔 | 账户数量: {investmentData.accountCount} 个
        </div>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small">
            <PieChart 
              title="投资分布" 
              data={pieData}
              height={280}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small">
            <LineChart 
              title="投资趋势" 
              xAxisData={lineChartData.xAxisData}
              seriesData={lineChartData.seriesData}
              height={280}
            />
          </Card>
        </Col>
      </Row>

      <Card title="投资账户明细" size="small">
        <Table
          dataSource={allAccounts}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={false}
        />
      </Card>
    </div>
  )
}

export default InvestmentAnalysis
