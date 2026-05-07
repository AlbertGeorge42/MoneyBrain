import React from 'react'
import { Button, Card, Grid, Statistic, Tag } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import { RangeTimePickerField, type RangeTimePickerConfig, type RangeTimeValue } from '../common'
import { BarChart, SankeyChart } from '../charts'
import ReportViewSwitcher from './ReportViewSwitcher'
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
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md

  const activityConfig = [
    { key: 'operating' as const, color: 'green', label: '经营', title: '经营活动' },
    { key: 'investing' as const, color: 'blue', label: '投资', title: '投资活动' },
    { key: 'financing' as const, color: 'orange', label: '筹资', title: '筹资活动' },
  ]

  const summarySection = (
    <>
      <div className="report-hero-section">
        <Card className="surface-card report-section-card report-hero-card">
          <Statistic
            title="净现金流"
            value={cashFlowData?.netCashFlow || 0}
            precision={2}
            valueStyle={{
              color: (cashFlowData?.netCashFlow || 0) >= 0 ? colorPositive : colorNegative,
            }}
            prefix="¥"
          />
        </Card>
      </div>

      <div className="report-secondary-section report-secondary-section--2">
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="现金流入" value={cashFlowData?.cashInflow || 0} precision={2} valueStyle={{ color: colorPositive }} prefix="¥" />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="现金流出" value={cashFlowData?.cashOutflow || 0} precision={2} valueStyle={{ color: colorNegative }} prefix="¥" />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="期初现金" value={cashFlowData?.startCash || 0} precision={2} valueStyle={{ color: colorInfo }} prefix="¥" />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="期末现金" value={cashFlowData?.endCash || 0} precision={2} valueStyle={{ color: colorSuccess }} prefix="¥" />
        </Card>
      </div>
    </>
  )
  
  const chartSection = (
    <div className="report-chart-grid report-chart-grid--2">
      <Card className="surface-card report-section-card" size="small">
        <BarChart
          title="三类现金流对比"
          xAxisData={['经营', '投资', '筹资']}
          seriesData={[
            {
              name: '流入',
              data: [
                cashFlowData?.byActivity?.operating?.inflow || 0,
                cashFlowData?.byActivity?.investing?.inflow || 0,
                cashFlowData?.byActivity?.financing?.inflow || 0,
              ],
            },
            {
              name: '流出',
              data: [
                Math.abs(cashFlowData?.byActivity?.operating?.outflow || 0),
                Math.abs(cashFlowData?.byActivity?.investing?.outflow || 0),
                Math.abs(cashFlowData?.byActivity?.financing?.outflow || 0),
              ],
            },
          ]}
          height={isMobile ? 240 : 280}
          loading={cashFlowLoading}
        />
      </Card>
      <Card className="surface-card report-section-card" size="small">
        <SankeyChart
          title="现金流量流向"
          nodes={cashFlowData?.sankey?.nodes || []}
          links={cashFlowData?.sankey?.links || []}
          height={isMobile ? 240 : 280}
          loading={cashFlowLoading}
        />
      </Card>
    </div>
  )
                
  const detailSection = (
    <div className="report-chart-grid report-chart-grid--3">
      {activityConfig.map(({ key, color, label, title }) => {
        const activity = cashFlowData?.byActivity?.[key]
        const net = activity?.net ?? 0
        const inflow = activity?.inflow ?? 0
        const outflow = activity?.outflow ?? 0

        return (
          <Card
            key={key}
            className="surface-card report-section-card"
            title={
              <>
                <Tag color={color}>{label}</Tag> {title}
              </>
            }
            size="small"
            extra={
              <span style={{ fontWeight: fontWeightBold, color: net >= 0 ? colorPositive : colorNegative }}>
                ¥{net.toFixed(2)}
              </span>
            }
          >
            <div className="report-summary-stack">
              <span>流入: ¥{inflow.toFixed(2)}</span>
              <span>流出: ¥{outflow.toFixed(2)}</span>
            </div>
          </Card>
        )
      })}

      {cashFlowData?.cashAccounts && (
        <Card title="现金账户" size="small" className="surface-card report-section-card">
          <div className="report-summary-note">{cashFlowData.cashAccounts.join('、')}</div>
        </Card>
      )}
    </div>
  )

  return (
    <div className="section-grid">
      <div className="report-toolbar" style={{ marginBottom: spaceMd }}>
        <div className="report-toolbar__filters">
          <RangeTimePickerField value={timeRange} config={pickerConfig} onChange={onTimeRangeChange} />
        </div>
        <div className="report-toolbar__actions">
          <Button icon={<SettingOutlined />} onClick={onOpenSettings}>
            设置
          </Button>
        </div>
      </div>

      {summarySection}

      {isMobile ? (
        <>
          <ReportViewSwitcher
            className="report-view-switcher"
            items={[
              {
                key: 'overview',
                label: '总览',
                content: (
                  <Card className="surface-card report-section-card" size="small">
                    <BarChart
                      title="三类现金流对比"
                      xAxisData={['经营', '投资', '筹资']}
                      seriesData={[
                        {
                          name: '流入',
                          data: [
                            cashFlowData?.byActivity?.operating?.inflow || 0,
                            cashFlowData?.byActivity?.investing?.inflow || 0,
                            cashFlowData?.byActivity?.financing?.inflow || 0,
                          ],
                        },
                        {
                          name: '流出',
                          data: [
                            Math.abs(cashFlowData?.byActivity?.operating?.outflow || 0),
                            Math.abs(cashFlowData?.byActivity?.investing?.outflow || 0),
                            Math.abs(cashFlowData?.byActivity?.financing?.outflow || 0),
                          ],
                        },
                      ]}
                      height={240}
                      loading={cashFlowLoading}
                    />
                  </Card>
                ),
              },
              {
                key: 'flow',
                label: '流向',
                content: (
                  <Card className="surface-card report-section-card" size="small">
                    <SankeyChart
                      title="现金流量流向"
                      nodes={cashFlowData?.sankey?.nodes || []}
                      links={cashFlowData?.sankey?.links || []}
                      height={240}
                      loading={cashFlowLoading}
                    />
                  </Card>
                ),
              },
            ]}
          />
          {detailSection}
        </>
      ) : (
        <>
          {chartSection}
          {detailSection}
        </>
      )}
    </div>
  )
}

export default CashFlowReport
