import React from 'react'
import { Button, Card, Grid, Statistic, Tag, theme } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import { RangeTimePickerField, type RangeTimePickerConfig, type RangeTimeValue } from '../common'
import { BarChart, SankeyChart } from '../charts'
import ReportViewSwitcher from './ReportViewSwitcher'
import PredictionStatistic from './PredictionStatistic'
import ReportValueDisplay from './ReportValueDisplay'
import type { CashFlowReportData } from '@shared/types'
import { formatCurrency } from '../../utils/format'
import { getRangeTimeSemantics } from '../../utils/timePicker'

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
  const { token } = theme.useToken()

  const { isPast, isFuture, isMixed } = getRangeTimeSemantics(timeRange.start, timeRange.end)

  const formatStatValue = (v: number) => formatCurrency(v)

  const activityConfig = [
    { key: 'operating' as const, color: 'green', label: '经营', title: '经营活动' },
    { key: 'investing' as const, color: 'blue', label: '投资', title: '投资活动' },
    { key: 'financing' as const, color: 'orange', label: '筹资', title: '筹资活动' },
  ]

  const netCashFlowValue = cashFlowData?.netCashFlow || { actual: 0, predicted: 0 }
  const cashInflowValue = cashFlowData?.cashInflow || { actual: 0, predicted: 0 }
  const cashOutflowValue = cashFlowData?.cashOutflow || { actual: 0, predicted: 0 }
  const cashChangeValue = cashFlowData?.cashChange || { actual: 0, predicted: 0 }
  const hasPrediction = cashInflowValue.predicted !== 0 || cashOutflowValue.predicted !== 0
  const netCashFlowTotal = isPast ? netCashFlowValue.actual : isFuture ? netCashFlowValue.predicted : netCashFlowValue.actual + netCashFlowValue.predicted

  const summarySection = (
    <>
      <div className="report-hero-section">
        <Card className="surface-card report-section-card report-hero-card">
          {isMixed && hasPrediction ? (
            <PredictionStatistic
              title="净现金流"
              value={netCashFlowValue}
              valueStyle={{
                color: netCashFlowTotal >= 0 ? 'var(--mb-color-positive)' : 'var(--mb-color-negative)',
              }}
            />
          ) : (
            <Statistic
              title={isFuture ? <>净现金流 <Tag color="processing" style={{ fontSize: 10 }}>预测</Tag></> : '净现金流'}
              value={netCashFlowTotal}
              formatter={(v) => formatStatValue(Number(v))}
              valueStyle={{
                color: netCashFlowTotal >= 0 ? 'var(--mb-color-positive)' : 'var(--mb-color-negative)',
              }}
            />
          )}
        </Card>
      </div>

      <div className="report-secondary-section report-secondary-section--2">
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          {isMixed && hasPrediction ? (
            <PredictionStatistic title="现金流入" value={cashInflowValue} valueStyle={{ color: 'var(--mb-color-positive)' }} />
          ) : (
            <Statistic
              title={isFuture ? <>现金流入 <Tag color="processing" style={{ fontSize: 10 }}>预测</Tag></> : '现金流入'}
              value={isPast ? cashInflowValue.actual : isFuture ? cashInflowValue.predicted : cashInflowValue.actual + cashInflowValue.predicted}
              formatter={(v) => formatStatValue(Number(v))}
              valueStyle={{ color: 'var(--mb-color-positive)' }}
            />
          )}
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          {isMixed && hasPrediction ? (
            <PredictionStatistic title="现金流出" value={cashOutflowValue} valueStyle={{ color: 'var(--mb-color-negative)' }} />
          ) : (
            <Statistic
              title={isFuture ? <>现金流出 <Tag color="processing" style={{ fontSize: 10 }}>预测</Tag></> : '现金流出'}
              value={isPast ? cashOutflowValue.actual : isFuture ? cashOutflowValue.predicted : cashOutflowValue.actual + cashOutflowValue.predicted}
              formatter={(v) => formatStatValue(Number(v))}
              valueStyle={{ color: 'var(--mb-color-negative)' }}
            />
          )}
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic
            title="期初现金"
            value={cashFlowData?.startCash || 0}
            formatter={(v) => formatStatValue(Number(v))}
          />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic
            title="期末现金"
            value={cashFlowData?.endCash || 0}
            formatter={(v) => formatStatValue(Number(v))}
          />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          {isMixed && hasPrediction ? (
            <PredictionStatistic
              title="现金变动"
              value={cashChangeValue}
              valueStyle={{ color: (cashChangeValue.actual + cashChangeValue.predicted) >= 0 ? 'var(--mb-color-positive)' : 'var(--mb-color-negative)' }}
            />
          ) : (
            <Statistic
              title={isFuture ? <>现金变动 <Tag color="processing" style={{ fontSize: 10 }}>预测</Tag></> : '现金变动'}
              value={isPast ? cashChangeValue.actual : isFuture ? cashChangeValue.predicted : cashChangeValue.actual + cashChangeValue.predicted}
              formatter={(v) => formatStatValue(Number(v))}
              valueStyle={{ color: (isPast ? cashChangeValue.actual : isFuture ? cashChangeValue.predicted : cashChangeValue.actual + cashChangeValue.predicted) >= 0 ? 'var(--mb-color-positive)' : 'var(--mb-color-negative)' }}
            />
          )}
        </Card>
      </div>

      {((isMixed && hasPrediction) || isFuture) && cashFlowData?.predictionNote && (
        <div style={{ color: token.colorTextTertiary, fontSize: token.fontSizeSM, textAlign: 'center', marginTop: -8 }}>
          {cashFlowData.predictionNote}
        </div>
      )}
    </>
  )

  const getChartData = (activityKey: 'operating' | 'investing' | 'financing') => {
    const activity = cashFlowData?.byActivity?.[activityKey]
    if (!activity) return { inflowActual: 0, inflowPredicted: 0, outflowActual: 0, outflowPredicted: 0 }
    const iActual = activity.inflow.actual
    const iPredicted = activity.inflow.predicted
    const oActual = Math.abs(activity.outflow.actual)
    const oPredicted = Math.abs(activity.outflow.predicted)
    return { inflowActual: iActual, inflowPredicted: iPredicted, outflowActual: oActual, outflowPredicted: oPredicted }
  }

  const chartInflowData = [
    isPast ? getChartData('operating').inflowActual : (isFuture ? getChartData('operating').inflowPredicted : getChartData('operating').inflowActual),
    isPast ? getChartData('investing').inflowActual : (isFuture ? getChartData('investing').inflowPredicted : getChartData('investing').inflowActual),
    isPast ? getChartData('financing').inflowActual : (isFuture ? getChartData('financing').inflowPredicted : getChartData('financing').inflowActual),
  ]
  const chartInflowPredicted = [
    getChartData('operating').inflowPredicted,
    getChartData('investing').inflowPredicted,
    getChartData('financing').inflowPredicted,
  ]
  const chartOutflowData = [
    isPast ? getChartData('operating').outflowActual : (isFuture ? getChartData('operating').outflowPredicted : getChartData('operating').outflowActual),
    isPast ? getChartData('investing').outflowActual : (isFuture ? getChartData('investing').outflowPredicted : getChartData('investing').outflowActual),
    isPast ? getChartData('financing').outflowActual : (isFuture ? getChartData('financing').outflowPredicted : getChartData('financing').outflowActual),
  ]
  const chartOutflowPredicted = [
    getChartData('operating').outflowPredicted,
    getChartData('investing').outflowPredicted,
    getChartData('financing').outflowPredicted,
  ]

  const chartSection = (
    <div className="report-chart-grid report-chart-grid--2">
      <Card className="surface-card report-section-card" size="small">
        <BarChart
          title="三类现金流对比"
          xAxisData={['经营', '投资', '筹资']}
          seriesData={[
            {
              name: '流入',
              data: chartInflowData,
              predictedData: isMixed && hasPrediction ? chartInflowPredicted : undefined,
            },
            {
              name: '流出',
              data: chartOutflowData,
              predictedData: isMixed && hasPrediction ? chartOutflowPredicted : undefined,
            },
          ]}
          height={isMobile ? 240 : 280}
          loading={cashFlowLoading}
          isPurePrediction={isFuture}
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
        const net = activity?.net || { actual: 0, predicted: 0 }
        const inflow = activity?.inflow || { actual: 0, predicted: 0 }
        const outflow = activity?.outflow || { actual: 0, predicted: 0 }
        const netTotal = isPast ? net.actual : isFuture ? net.predicted : net.actual + net.predicted
        const showInflowValue = isPast ? inflow.actual : isFuture ? inflow.predicted : inflow.actual + inflow.predicted
        const showOutflowValue = isPast ? Math.abs(outflow.actual) : isFuture ? Math.abs(outflow.predicted) : Math.abs(outflow.actual + outflow.predicted)
        const showPred = isMixed && (inflow.predicted !== 0 || outflow.predicted !== 0)

        return (
          <Card
            key={key}
            className="surface-card report-section-card"
            title={
              <>
                <Tag color={color}>{label}</Tag> {isFuture ? <>{title} <Tag color="processing" style={{ fontSize: 10 }}>预测</Tag></> : title}
              </>
            }
            size="small"
            extra={
              <span style={{ fontWeight: 700, color: netTotal >= 0 ? 'var(--mb-color-positive)' : 'var(--mb-color-negative)' }}>
                {formatCurrency(netTotal)}
              </span>
            }
          >
            <div className="report-summary-stack">
              <span>
                流入: {showPred ? <ReportValueDisplay value={inflow} showBreakdown={false} /> : formatStatValue(showInflowValue)}
              </span>
              <span>
                流出: {showPred ? <ReportValueDisplay value={{ actual: Math.abs(outflow.actual), predicted: Math.abs(outflow.predicted) }} showBreakdown={false} /> : formatStatValue(showOutflowValue)}
              </span>
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
      <div className="report-toolbar" style={{ marginBottom: `${token.padding}px` }}>
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
                          data: chartInflowData,
                          predictedData: isMixed && hasPrediction ? chartInflowPredicted : undefined,
                        },
                        {
                          name: '流出',
                          data: chartOutflowData,
                          predictedData: isMixed && hasPrediction ? chartOutflowPredicted : undefined,
                        },
                      ]}
                      height={240}
                      loading={cashFlowLoading}
                      isPurePrediction={isFuture}
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
