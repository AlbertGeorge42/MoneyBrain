import React from 'react'
import { Card, DatePicker, Button, Row, Col, Statistic, Tag, Divider } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { BarChart, SankeyChart } from '../charts'
import type { SankeyNode } from '../charts/SankeyChart'

const { RangePicker } = DatePicker

interface CashFlowActivity {
  inflow: number
  outflow: number
  net: number
  items: Array<{
    categoryName: string
    amount: number
    type: string
    direction: string
  }>
}

interface CashFlowData {
  startCash?: number
  endCash?: number
  cashInflow?: number
  cashOutflow?: number
  netCashFlow?: number
  byActivity?: {
    operating: CashFlowActivity
    investing: CashFlowActivity
    financing: CashFlowActivity
    uncategorized: CashFlowActivity
  }
  sankey?: {
    nodes: SankeyNode[]
    links: Array<{ source: string; target: string; value: number }>
  }
  cashAccounts?: string[]
}

interface CashFlowReportProps {
  cashFlowDateRange: [dayjs.Dayjs, dayjs.Dayjs]
  cashFlowData: CashFlowData | null
  cashFlowLoading: boolean
  onDateRangeChange: (dates: [dayjs.Dayjs, dayjs.Dayjs]) => void
  onOpenSettings: () => void
}

const CashFlowReport: React.FC<CashFlowReportProps> = ({
  cashFlowDateRange,
  cashFlowData,
  cashFlowLoading,
  onDateRangeChange,
  onOpenSettings,
}) => {
  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <RangePicker
          value={cashFlowDateRange}
          onChange={(dates) => dates && onDateRangeChange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
        />
        <Button icon={<SettingOutlined />} onClick={onOpenSettings}>
          设置
        </Button>
      </div>

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
              valueStyle={{ color: (cashFlowData?.netCashFlow || 0) >= 0 ? '#3f8600' : '#cf1322' }}
              prefix="¥"
            />
          </Col>
        </Row>
      </Card>

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
}

export default CashFlowReport
