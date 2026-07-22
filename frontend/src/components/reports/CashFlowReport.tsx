import React from 'react'
import { Button, Card, Grid, Statistic, Tag, theme } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import { RangeTimePickerField, ReportDetailList, type RangeTimePickerConfig, type RangeTimeValue, type ReportTreeNode, type ReportDetailColumn } from '../common'
import { BarChart, SankeyChart } from '../charts'
import ReportViewSwitcher from './ReportViewSwitcher'
import PredictionStatistic from './PredictionStatistic'
import type { CashFlowReportData } from '@shared/types'
import { formatCurrency } from '../../utils/format'
import { formatAmount, getAmountColor } from '../../utils/formatAmount'
import { getRangeTimeSemantics } from '../../utils/timePicker'
import { getFinancialTokens } from '../../styles/theme/financial-tokens'
import { useTheme } from '../../styles/ThemeContext'
import { useAmountColors } from '../../constants/transactionType'

/** 默认分类的固定图标和颜色映射 */
const ACTIVITY_META: Record<string, { icon: string; iconColor: string }> = {
  operating: { icon: 'briefcase', iconColor: 'blue' },
  investing: { icon: 'trending-up', iconColor: 'purple' },
  financing: { icon: 'landmark', iconColor: 'orange' },
}

/** 流入/流出父节点的固定颜色 */
const INFLOW_COLOR = 'green'
const OUTFLOW_COLOR = 'red'

interface CashFlowDetailMetrics {
  inflow: number
  outflow: number
  net: number
  actual: number
  predicted: number
}

// 详情列表中要显示的"代表值"：inflow 节点为正、outflow 节点为负
const getDisplayValue = (m: CashFlowDetailMetrics): number => {
  if ((m.inflow ?? 0) !== 0) return m.inflow
  if ((m.outflow ?? 0) !== 0) return m.outflow
  return m.net
}

// 现金流场景下流入显示绿色正数、流出显示红色正数（与资产负债表一致）
const formatCashFlowValue = (m: CashFlowDetailMetrics) => {
  const value = getDisplayValue(m)
  // outflow 存储为负数 → displayAbs 让文本为正、颜色按原值判定为红
  return formatAmount(value, 'flow', { displayAbs: value < 0 })
}

const cashFlowColumns: ReportDetailColumn<CashFlowDetailMetrics>[] = [
  {
    key: 'amount',
    metric: 'inflow',
    width: 140,
    align: 'right',
    prediction: { displayMetric: 'inflow', actualMetric: 'actual', predictedMetric: 'predicted' },
    format: (_v, node) => formatCashFlowValue(node.metrics!).text,
    color: (_v, node) => formatCashFlowValue(node.metrics!).color,
  },
]

const activityEntries: Array<{ key: 'operating' | 'investing' | 'financing'; title: string }> = [
  { key: 'operating', title: '经营活动' },
  { key: 'investing', title: '投资活动' },
  { key: 'financing', title: '筹资活动' },
]

function adaptCashFlowActivity(
  activity: CashFlowReportData['byActivity']['operating'],
  activityKey: string,
): ReportTreeNode<CashFlowDetailMetrics>[] {
  const inflowItems: ReportTreeNode<CashFlowDetailMetrics>[] = []
  const outflowItems: ReportTreeNode<CashFlowDetailMetrics>[] = []

  // 后端已返回树形结构，直接适配
  activity.items.forEach((item) => {
    const node: ReportTreeNode<CashFlowDetailMetrics> = {
      key: `item-${activityKey}-${item.categoryId || item.categoryName}`,
      name: item.categoryName,
      icon: item.icon ?? undefined,
      iconColor: item.color ?? null,
      metrics: {
        inflow: item.direction === 'inflow' ? item.amount : 0,
        outflow: item.direction === 'outflow' ? item.amount : 0,
        net: item.amount,
        actual: item.actual,
        predicted: item.predicted,
      },
      children: item.children?.map(child => ({
        key: `item-${activityKey}-${child.categoryId || child.categoryName}`,
        name: child.categoryName,
        icon: child.icon ?? undefined,
        iconColor: child.color ?? null,
        metrics: {
          inflow: child.direction === 'inflow' ? child.amount : 0,
          outflow: child.direction === 'outflow' ? child.amount : 0,
          net: child.amount,
          actual: child.actual,
          predicted: child.predicted,
        },
      })),
    }
    if (item.direction === 'inflow') {
      inflowItems.push(node)
    } else {
      outflowItems.push(node)
    }
  })

  const totalInflow = activity.inflow.actual + activity.inflow.predicted
  const totalOutflow = activity.outflow.actual + activity.outflow.predicted

  return [
    {
      key: `inflow-${activityKey}`,
      name: '流入',
      icon: 'arrow-up',
      iconColor: INFLOW_COLOR,
      metrics: { inflow: totalInflow, outflow: 0, net: totalInflow, actual: activity.inflow.actual, predicted: activity.inflow.predicted },
      children: inflowItems,
    },
    {
      key: `outflow-${activityKey}`,
      name: '流出',
      icon: 'arrow-down',
      iconColor: OUTFLOW_COLOR,
      // outflow 已是负数
      metrics: { inflow: 0, outflow: totalOutflow, net: totalOutflow, actual: activity.outflow.actual, predicted: activity.outflow.predicted },
      children: outflowItems,
    },
  ]
}

interface CashFlowReportProps {
  timeRange: RangeTimeValue
  pickerConfig: RangeTimePickerConfig
  cashFlowData: CashFlowReportData | null
  loading?: boolean
  onTimeRangeChange: (value: RangeTimeValue) => void
  onOpenSettings: () => void
}

const CashFlowReport: React.FC<CashFlowReportProps> = ({
  timeRange,
  pickerConfig,
  cashFlowData,
  loading,
  onTimeRangeChange,
  onOpenSettings,
}) => {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const useClickTrigger = !screens.lg
  const { token } = theme.useToken()
  const { isDark } = useTheme()
  const amountColors = useAmountColors()
  const financialTokens = React.useMemo(() => getFinancialTokens(isDark), [isDark])

  const { isFuture, isMixed } = getRangeTimeSemantics(timeRange.start, timeRange.end)

  const formatStatValue = (v: number) => formatCurrency(v)

  const netCashFlowValue = cashFlowData?.netCashFlow || { actual: 0, predicted: 0 }
  const cashInflowValue = cashFlowData?.cashInflow || { actual: 0, predicted: 0 }
  const cashOutflowValue = cashFlowData?.cashOutflow || { actual: 0, predicted: 0 }
  const cashChangeValue = cashFlowData?.cashChange || { actual: 0, predicted: 0 }
  const hasPrediction = cashInflowValue.predicted !== 0 || cashOutflowValue.predicted !== 0
  const netCashFlowTotal = netCashFlowValue.actual + netCashFlowValue.predicted
  // 现金流出本身是负数；汇总展示时按"红色正数"显示，与资产负债表一致
  const cashOutflowTotal = Math.abs(cashOutflowValue.actual + cashOutflowValue.predicted)

  const summarySection = (
    <>
      <div className="report-hero-section">
        <Card className="surface-card report-section-card report-hero-card">
          {isMixed && hasPrediction ? (
            <PredictionStatistic
              title="净现金流"
              value={netCashFlowValue}
              useClickTrigger={useClickTrigger}
              valueStyle={{
                color: getAmountColor(netCashFlowTotal, 'flow', isDark),
              }}
            />
          ) : (
            <Statistic
              title={isFuture ? <>净现金流 <Tag color="processing" style={{ fontSize: 10 }}>预测</Tag></> : '净现金流'}
              value={netCashFlowTotal}
              formatter={(v) => formatStatValue(Number(v))}
              valueStyle={{
                color: getAmountColor(netCashFlowTotal, 'flow', isDark),
              }}
            />
          )}
        </Card>
      </div>

      <div className="report-secondary-section report-secondary-section--2">
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          {isMixed && hasPrediction ? (
            <PredictionStatistic title="现金流入" value={cashInflowValue} useClickTrigger={useClickTrigger} valueStyle={{ color: amountColors.positive }} />
          ) : (
            <Statistic
              title={isFuture ? <>现金流入 <Tag color="processing" style={{ fontSize: 10 }}>预测</Tag></> : '现金流入'}
              value={cashInflowValue.actual + cashInflowValue.predicted}
              formatter={(v) => formatStatValue(Number(v))}
              valueStyle={{ color: amountColors.positive }}
            />
          )}
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          {isMixed && hasPrediction ? (
            <PredictionStatistic
              title="现金流出"
              // outflow 本身为负，预测明细展示用绝对值；汇总仍然只显示"红色正数"
              value={{
                actual: Math.abs(cashOutflowValue.actual),
                predicted: Math.abs(cashOutflowValue.predicted),
              }}
              useClickTrigger={useClickTrigger}
              valueStyle={{ color: amountColors.negative }}
            />
          ) : (
            <Statistic
              title={isFuture ? <>现金流出 <Tag color="processing" style={{ fontSize: 10 }}>预测</Tag></> : '现金流出'}
              value={cashOutflowTotal}
              formatter={(v) => formatStatValue(Number(v))}
              valueStyle={{ color: amountColors.negative }}
            />
          )}
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <PredictionStatistic
            title="期初现金"
            value={cashFlowData?.startCash || { actual: 0, predicted: 0 }}
            useClickTrigger={useClickTrigger}
            valueStyle={{ color: amountColors.neutral }}
          />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <PredictionStatistic
            title="期末现金"
            value={cashFlowData?.endCash || { actual: 0, predicted: 0 }}
            useClickTrigger={useClickTrigger}
            valueStyle={{ color: amountColors.neutral }}
          />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          {isMixed && hasPrediction ? (
            <PredictionStatistic
              title="现金变动"
              value={cashChangeValue}
              useClickTrigger={useClickTrigger}
              valueStyle={{ color: getAmountColor(cashChangeValue.actual + cashChangeValue.predicted, 'flow', isDark) }}
            />
          ) : (
            <Statistic
              title={isFuture ? <>现金变动 <Tag color="processing" style={{ fontSize: 10 }}>预测</Tag></> : '现金变动'}
              value={cashChangeValue.actual + cashChangeValue.predicted}
              formatter={(v) => formatStatValue(Number(v))}
              valueStyle={{ color: getAmountColor(cashChangeValue.actual + cashChangeValue.predicted, 'flow', isDark) }}
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
    // outflow 已是负数，柱状图显示时取反以使柱子向下延伸为负向
    const iActual = activity.inflow.actual
    const iPredicted = activity.inflow.predicted
    const oActual = -activity.outflow.actual
    const oPredicted = -activity.outflow.predicted
    return { inflowActual: iActual, inflowPredicted: iPredicted, outflowActual: oActual, outflowPredicted: oPredicted }
  }

  const chartInflowData = [
    getChartData('operating').inflowActual,
    getChartData('investing').inflowActual,
    getChartData('financing').inflowActual,
  ]
  const chartInflowPredicted = [
    getChartData('operating').inflowPredicted,
    getChartData('investing').inflowPredicted,
    getChartData('financing').inflowPredicted,
  ]
  const chartOutflowData = [
    getChartData('operating').outflowActual,
    getChartData('investing').outflowActual,
    getChartData('financing').outflowActual,
  ]
  const chartOutflowPredicted = [
    getChartData('operating').outflowPredicted,
    getChartData('investing').outflowPredicted,
    getChartData('financing').outflowPredicted,
  ]

  const showChartPred = (isMixed || isFuture) && hasPrediction
  const inflowColor = financialTokens.value.positive
  const outflowColor = financialTokens.value.negative

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
              predictedData: showChartPred ? chartInflowPredicted : undefined,
              color: inflowColor,
            },
            {
              name: '流出',
              data: chartOutflowData,
              predictedData: showChartPred ? chartOutflowPredicted : undefined,
              color: outflowColor,
            },
          ]}
          height={isMobile ? 240 : 280}
          loading={loading}
          isPurePrediction={isFuture}
        />
      </Card>
      <Card className="surface-card report-section-card" size="small">
        <SankeyChart
          title="现金流量流向"
          nodes={cashFlowData?.sankey?.nodes || []}
          links={cashFlowData?.sankey?.links || []}
          height={isMobile ? 240 : 280}
          loading={loading}
          isPurePrediction={isFuture}
        />
      </Card>
    </div>
  )

  const showPred = (isFuture || isMixed) && hasPrediction

  const defaultByActivity = {
    operating: { inflow: { actual: 0, predicted: 0 }, outflow: { actual: 0, predicted: 0 }, net: { actual: 0, predicted: 0 }, items: [] },
    investing: { inflow: { actual: 0, predicted: 0 }, outflow: { actual: 0, predicted: 0 }, net: { actual: 0, predicted: 0 }, items: [] },
    financing: { inflow: { actual: 0, predicted: 0 }, outflow: { actual: 0, predicted: 0 }, net: { actual: 0, predicted: 0 }, items: [] },
    uncategorized: { inflow: { actual: 0, predicted: 0 }, outflow: { actual: 0, predicted: 0 }, net: { actual: 0, predicted: 0 }, items: [] },
  }
  const byActivity = cashFlowData?.byActivity || defaultByActivity

  const detailSection = (
    <>
      <div className="report-chart-grid report-chart-grid--3">
        {activityEntries.map(({ key, title }) => {
          const meta = ACTIVITY_META[key]
          return (
            <ReportDetailList
              key={key}
              data={adaptCashFlowActivity(byActivity[key], key)}
              config={{
                columns: cashFlowColumns,
                parentIcon: meta?.icon ?? 'swap',
                leafIcon: 'transaction',
                expandable: true,
                defaultExpandDepth: 1,
              }}
              loading={loading}
              isFuture={showPred}
              useClickTrigger={useClickTrigger}
              title={isFuture ? <>{title} <Tag color="processing" style={{ fontSize: 10 }}>预测</Tag></> : title}
            />
          )
        })}
      </div>
      {cashFlowData?.cashAccounts && cashFlowData.cashAccounts.length > 0 && (
        <Card title="现金账户" size="small" className="surface-card report-section-card">
          <div className="report-summary-note">{cashFlowData.cashAccounts.join('、')}</div>
        </Card>
      )}
    </>
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
                          predictedData: showChartPred ? chartInflowPredicted : undefined,
                          color: inflowColor,
                        },
                        {
                          name: '流出',
                          data: chartOutflowData,
                          predictedData: showChartPred ? chartOutflowPredicted : undefined,
                          color: outflowColor,
                        },
                      ]}
                      height={240}
                      loading={loading}
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
                      loading={loading}
                      isPurePrediction={isFuture}
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
