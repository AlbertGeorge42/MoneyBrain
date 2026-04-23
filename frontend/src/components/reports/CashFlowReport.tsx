import React from 'react'
import { Card, Button, Row, Col, Statistic, Tag, Divider } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import { RangeTimePickerField, type RangeTimePickerConfig, type RangeTimeValue } from '../common'
import { BarChart, SankeyChart } from '../charts'
import type { CashFlowReportData } from '@shared/types'
import {
  colorInfo,
  colorSuccess,
  colorPositive,
  colorNegative,
  spaceMd,
  fontWeightBold,
} from '../../styles/tokens'

interface CashFlowReportProps {
  timeRange: RangeTimeValue
  pickerConfig: RangeTimePickerConfig
  cashFlowData: CashFlowReportData | null
  cashFlowLoading: boolean
  onTimeRangeChange: (value: RangeTimeValue) => void
  onOpenSettings: () => void
}

const CashFlowReport: React.FC<CashFlowReportProps> = ({
  timeRange,
  pickerConfig,
  cashFlowData,
  cashFlowLoading,
  onTimeRangeChange,
  onOpenSettings,
}) => {
  const activityConfig = [
    { key: 'operating' as const, color: 'green', label: '经营', title: '经营活动' },
    { key: 'investing' as const, color: 'blue', label: '投资', title: '投资活动' },
    { key: 'financing' as const, color: 'orange', label: '筹资', title: '筹资活动' },
  ]

  return (
    <div>
      <div style={{ marginBottom: spaceMd, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <RangeTimePickerField value={timeRange} config={pickerConfig} onChange={onTimeRangeChange} />
        <Button icon={<SettingOutlined />} onClick={onOpenSettings}>
          设置
        </Button>
      </div>

      <Card style={{ marginBottom: spaceMd }}>
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="期初现金"
              value={cashFlowData?.startCash || 0}
              precision={2}
              valueStyle={{ color: colorInfo }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="期末现金"
              value={cashFlowData?.endCash || 0}
              precision={2}
              valueStyle={{ color: colorSuccess }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="现金变动"
              value={(cashFlowData?.endCash || 0) - (cashFlowData?.startCash || 0)}
              precision={2}
              valueStyle={{ color: ((cashFlowData?.endCash || 0) - (cashFlowData?.startCash || 0)) >= 0 ? colorPositive : colorNegative }}
              prefix="¥"
            />
          </Col>
        </Row>
      </Card>

      <Divider style={{ margin: '12px 0' }} />

      <Card style={{ marginBottom: spaceMd }}>
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="现金流入"
              value={cashFlowData?.cashInflow || 0}
              precision={2}
              valueStyle={{ color: colorPositive }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="现金流出"
              value={cashFlowData?.cashOutflow || 0}
              precision={2}
              valueStyle={{ color: colorNegative }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="净现金流"
              value={cashFlowData?.netCashFlow || 0}
              precision={2}
              valueStyle={{ color: (cashFlowData?.netCashFlow || 0) >= 0 ? colorPositive : colorNegative }}
              prefix="¥"
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={16} style={{ marginBottom: spaceMd }}>
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
                ] },
                { name: '流出', data: [
                  Math.abs(cashFlowData?.byActivity?.operating?.outflow || 0),
                  Math.abs(cashFlowData?.byActivity?.investing?.outflow || 0),
                  Math.abs(cashFlowData?.byActivity?.financing?.outflow || 0)
                ] }
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
        {activityConfig.map(({ key, color, label, title }) => {
          const activity = cashFlowData?.byActivity?.[key]
          const net = activity?.net ?? 0
          const inflow = activity?.inflow ?? 0
          const outflow = activity?.outflow ?? 0
          return (
            <Col span={8} key={key}>
              <Card 
                title={<><Tag color={color}>{label}</Tag> {title}</>} 
                size="small"
                extra={<span style={{ fontWeight: fontWeightBold, color: net >= 0 ? colorPositive : colorNegative }}>
                  ¥{net.toFixed(2)}
                </span>}
              >
                <div>流入: ¥{inflow.toFixed(2)}</div>
                <div>流出: ¥{outflow.toFixed(2)}</div>
              </Card>
            </Col>
          )
        })}
      </Row>

      {cashFlowData?.cashAccounts && (
        <Card title="现金账户" size="small" style={{ marginTop: spaceMd }}>
          <div>{cashFlowData.cashAccounts.join('、')}</div>
        </Card>
      )}
    </div>
  )
}

export default CashFlowReport
