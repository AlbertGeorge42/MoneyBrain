import React, { useMemo } from 'react'
import { Button, Card, Grid, Statistic, Tag, theme } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import type { IncomeExpenseReportData, ReportCategoryDetail } from '@shared/types'
import { BarChart, PieChart, type PieChartDataItem } from '../charts'
import { RangeTimePickerField, type RangeTimePickerConfig, type RangeTimeValue, ReportDetailList } from '../common'
import type { ReportTreeNode, ReportDetailColumn } from '../common'
import ReportViewSwitcher from './ReportViewSwitcher'
import PredictionStatistic from './PredictionStatistic'
import * as api from '../../services/api'
import { toDateRangeParams, getRangeTimeSemantics } from '../../utils/timePicker'
import { formatCurrency, formatPercent } from '../../utils/format'
import { getAmountColor } from '../../utils/formatAmount'
import { getFinancialTokens } from '../../styles/theme/financial-tokens'
import { useTheme } from '../../styles/ThemeContext'
import { useAmountColors } from '../../constants/transactionType'

// ---- 本报表专属：metrics 类型 ----
interface IncomeExpenseMetrics {
  total: number
  actual: number
  predicted: number
}

// ---- 本报表专属：列配置 ----
const createIncomeColumns = (isDark: boolean): ReportDetailColumn<IncomeExpenseMetrics>[] => [
  {
    key: 'amount',
    metric: 'total',
    width: 140,
    align: 'right',
    prediction: { displayMetric: 'total', actualMetric: 'actual', predictedMetric: 'predicted' },
    format: (v) => formatCurrency(v as number),
    color: getAmountColor(1, 'flow', isDark),
  },
]

const createExpenseColumns = (isDark: boolean): ReportDetailColumn<IncomeExpenseMetrics>[] => [
  {
    key: 'amount',
    metric: 'total',
    width: 140,
    align: 'right',
    prediction: { displayMetric: 'total', actualMetric: 'actual', predictedMetric: 'predicted' },
    format: (v) => formatCurrency(Math.abs(v as number)),
    color: getAmountColor(-1, 'flow', isDark),
  },
]

// ---- 本报表专属：数据适配 ----
function adaptIncomeExpenseTree(
  details: ReportCategoryDetail[],
  reportType: 'income' | 'expense'
): ReportTreeNode<IncomeExpenseMetrics>[] {
  return details.map(item => ({
    key: `${reportType}-${item.categoryId}`,
    name: item.name,
    icon: item.icon,
    iconColor: item.color ?? null,
    children: item.children ? adaptIncomeExpenseTree(item.children, reportType) : undefined,
    metrics: {
      total: reportType === 'expense' ? Math.abs(item.actual + item.predicted) : item.actual + item.predicted,
      actual: item.actual,
      predicted: item.predicted,
    },
  }))
}

interface IncomeExpenseReportProps {
  timeRange: RangeTimeValue
  pickerConfig: RangeTimePickerConfig
  incomeExpenseData: IncomeExpenseReportData | null
  loading?: boolean
  onTimeRangeChange: (value: RangeTimeValue) => void
  onOpenSettings: () => void
}

const IncomeExpenseReport: React.FC<IncomeExpenseReportProps> = ({
  timeRange,
  pickerConfig,
  incomeExpenseData,
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
  const financialTokens = useMemo(() => getFinancialTokens(isDark), [isDark])

  const dateParams = toDateRangeParams(timeRange)
  const { isFuture, isMixed } = getRangeTimeSemantics(timeRange.start, timeRange.end)

  const handleDrillDown = async (type: 'income' | 'expense', item: PieChartDataItem): Promise<PieChartDataItem[]> => {
    if (!item.categoryId) return []

    try {
      const response = await api.analyticsApi.getCategoryBreakdown(
        type,
        dateParams.startDate,
        dateParams.endDate,
        item.categoryId
      )

      if (response.data.success && response.data.data) {
        return response.data.data
      }
    } catch (error) {
      console.error('Failed to fetch category drilldown:', error)
    }

    return []
  }

  const incomeData = incomeExpenseData?.income || { actual: 0, predicted: 0 }
  const expenseData = incomeExpenseData?.expense || { actual: 0, predicted: 0 }
  const balanceData = incomeExpenseData?.balance || { actual: 0, predicted: 0 }
  const assetChangeData = incomeExpenseData?.assetChange || { actual: 0, predicted: 0 }
  const hasPrediction = incomeData.predicted !== 0 || expenseData.predicted !== 0

  const incomeTotal = incomeData.actual + incomeData.predicted
  const expenseTotal = expenseData.actual + expenseData.predicted
  const balanceTotal = balanceData.actual + balanceData.predicted

  const incomePieData: PieChartDataItem[] = useMemo(() =>
    (incomeExpenseData?.incomeCategoryDetails || []).map((item) => ({
      name: item.name,
      value: item.actual + item.predicted,
      predictedValue: item.predicted !== 0 ? item.predicted : undefined,
      categoryId: item.categoryId,
      hasChildren: item.hasChildren,
    })),
    [incomeExpenseData?.incomeCategoryDetails]
  )

  const expensePieData: PieChartDataItem[] = useMemo(() =>
    (incomeExpenseData?.expenseCategoryDetails || []).map((item) => ({
      name: item.name,
      value: Math.abs(item.actual + item.predicted),
      predictedValue: item.predicted !== 0 ? Math.abs(item.predicted) : undefined,
      categoryId: item.categoryId,
      hasChildren: item.hasChildren,
    })),
    [incomeExpenseData?.expenseCategoryDetails]
  )

  const formatStatValue = (v: number) => formatCurrency(Number(v))

  // 柱状图配色：参考现金流量表
  const incomeColor = financialTokens.value.positive
  const expenseColor = financialTokens.value.negative

  const summarySection = (
    <>
      <div className="report-hero-section">
        <Card className="surface-card report-section-card report-hero-card">
          {isMixed && hasPrediction ? (
            <PredictionStatistic
              title="结余"
              value={balanceData}
              useClickTrigger={useClickTrigger}
              valueStyle={{ color: getAmountColor(balanceTotal, 'flow', isDark) }}
            />
          ) : (
            <Statistic
              title={isFuture ? <>结余 <Tag color="processing" style={{ fontSize: 10 }}>预测</Tag></> : '结余'}
              value={balanceTotal}
              formatter={(v) => formatStatValue(Number(v))}
              valueStyle={{ color: getAmountColor(balanceTotal, 'flow', isDark) }}
            />
          )}
        </Card>
      </div>

      <div className="report-secondary-section report-secondary-section--2">
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          {isMixed && hasPrediction ? (
            <PredictionStatistic title="收入" value={incomeData} useClickTrigger={useClickTrigger} valueStyle={{ color: amountColors.positive }} />
          ) : (
            <Statistic
              title={isFuture ? <>收入 <Tag color="processing" style={{ fontSize: 10 }}>预测</Tag></> : '收入'}
              value={incomeTotal}
              formatter={(v) => formatStatValue(Number(v))}
              valueStyle={{ color: amountColors.positive }}
            />
          )}
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          {isMixed && hasPrediction ? (
            <PredictionStatistic title="支出" value={expenseData} useClickTrigger={useClickTrigger} valueStyle={{ color: amountColors.negative }} />
          ) : (
            <Statistic
              title={isFuture ? <>支出 <Tag color="processing" style={{ fontSize: 10 }}>预测</Tag></> : '支出'}
              value={expenseTotal}
              formatter={(v) => formatStatValue(Number(v))}
              valueStyle={{ color: amountColors.negative }}
            />
          )}
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <PredictionStatistic
            title="期初净值"
            value={incomeExpenseData?.startNetWorth || { actual: 0, predicted: 0 }}
            useClickTrigger={useClickTrigger}
            valueStyle={{ color: amountColors.neutral }}
          />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <PredictionStatistic
            title="期末净值"
            value={incomeExpenseData?.endNetWorth || { actual: 0, predicted: 0 }}
            useClickTrigger={useClickTrigger}
            valueStyle={{ color: amountColors.neutral }}
          />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          {isMixed && hasPrediction ? (
            <PredictionStatistic
              title="资产变动"
              value={assetChangeData}
              useClickTrigger={useClickTrigger}
              valueStyle={{ color: getAmountColor(assetChangeData.actual + assetChangeData.predicted, 'flow', isDark) }}
            />
          ) : (
            <Statistic
              title={isFuture ? <>资产变动 <Tag color="processing" style={{ fontSize: 10 }}>预测</Tag></> : '资产变动'}
              value={assetChangeData.actual + assetChangeData.predicted}
              formatter={(v) => formatStatValue(Number(v))}
              valueStyle={{ color: getAmountColor(assetChangeData.actual + assetChangeData.predicted, 'flow', isDark) }}
            />
          )}
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic
            title={isFuture ? <>储蓄率 <Tag color="processing" style={{ fontSize: 10 }}>预测</Tag></> : '储蓄率'}
            value={incomeTotal ? (balanceTotal / incomeTotal) * 100 : 0}
            formatter={(v) => formatPercent(Number(v), 1, false)}
            valueStyle={{ color: amountColors.neutral }}
          />
        </Card>
      </div>

      {((isMixed && hasPrediction) || isFuture) && incomeExpenseData?.predictionNote && (
        <div style={{ color: token.colorTextTertiary, fontSize: token.fontSizeSM, textAlign: 'center', marginTop: -8 }}>
          {incomeExpenseData.predictionNote}
        </div>
      )}
    </>
  )

  const chartSection = (
    <div className="report-chart-grid report-chart-grid--3">
      <Card className="surface-card report-section-card" size="small">
        <BarChart
          title="收支对比"
          xAxisData={['收入', '支出']}
          seriesData={[
            {
              name: '收入',
              data: [incomeData.actual, 0],
              predictedData: hasPrediction ? [incomeData.predicted, 0] : undefined,
              color: incomeColor,
            },
            {
              name: '支出',
              data: [0, expenseData.actual],
              predictedData: hasPrediction ? [0, expenseData.predicted] : undefined,
              color: expenseColor,
            },
          ]}
          height={isMobile ? 220 : 250}
          isPurePrediction={isFuture}
        />
      </Card>
      <Card className="surface-card report-section-card" size="small">
        <PieChart title="收入分类" data={incomePieData} height={isMobile ? 220 : 250} layout={isMobile ? 'compact' : 'compact'} onDrillDown={(item) => handleDrillDown('income', item)} isPurePrediction={isFuture} />
      </Card>
      <Card className="surface-card report-section-card" size="small">
        <PieChart title="支出分类" data={expensePieData} height={isMobile ? 220 : 250} layout={isMobile ? 'compact' : 'compact'} onDrillDown={(item) => handleDrillDown('expense', item)} isPurePrediction={isFuture} />
      </Card>
    </div>
  )

  const showPred = isFuture || isMixed

  const incomeDetailCard = (
    <ReportDetailList
      data={adaptIncomeExpenseTree(incomeExpenseData?.incomeCategoryDetails || [], 'income')}
      config={{ columns: createIncomeColumns(isDark), parentIcon: 'folder', leafIcon: 'circle', expandable: true, defaultExpandDepth: 1 }}
      loading={loading}
      isFuture={showPred}
      useClickTrigger={useClickTrigger}
      title={isFuture ? <>收入明细 <Tag color="processing" style={{ fontSize: 10 }}>预测</Tag></> : '收入明细'}
    />
  )

  const expenseDetailCard = (
    <ReportDetailList
      data={adaptIncomeExpenseTree(incomeExpenseData?.expenseCategoryDetails || [], 'expense')}
      config={{ columns: createExpenseColumns(isDark), parentIcon: 'folder', leafIcon: 'circle', expandable: true, defaultExpandDepth: 1 }}
      loading={loading}
      isFuture={showPred}
      useClickTrigger={useClickTrigger}
      title={isFuture ? <>支出明细 <Tag color="processing" style={{ fontSize: 10 }}>预测</Tag></> : '支出明细'}
    />
  )

  const detailTables = (
    <div className="report-chart-grid report-chart-grid--2">
      {incomeDetailCard}
      {expenseDetailCard}
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
        <div className="report-detail-stack">
          <Card className="surface-card report-section-card" size="small">
            <BarChart
              title="收支对比"
              xAxisData={['收入', '支出']}
              seriesData={[
                {
                  name: '收入',
                  data: [incomeData.actual, 0],
                  predictedData: hasPrediction ? [incomeData.predicted, 0] : undefined,
                  color: incomeColor,
                },
                {
                  name: '支出',
                  data: [0, expenseData.actual],
                  predictedData: hasPrediction ? [0, expenseData.predicted] : undefined,
                  color: expenseColor,
                },
              ]}
              height={220}
              isPurePrediction={isFuture}
            />
          </Card>
          <ReportViewSwitcher
            className="report-view-switcher"
            items={[
              {
                key: 'income',
                label: '收入',
                content: (
                  <div className="report-detail-stack">
                    <Card className="surface-card report-section-card" size="small">
                      <PieChart title="收入分类" data={incomePieData} height={220} layout="compact" onDrillDown={(item) => handleDrillDown('income', item)} isPurePrediction={isFuture} />
                    </Card>
                    {incomeDetailCard}
                  </div>
                ),
              },
              {
                key: 'expense',
                label: '支出',
                content: (
                  <div className="report-detail-stack">
                    <Card className="surface-card report-section-card" size="small">
                      <PieChart title="支出分类" data={expensePieData} height={220} layout="compact" onDrillDown={(item) => handleDrillDown('expense', item)} isPurePrediction={isFuture} />
                    </Card>
                    {expenseDetailCard}
                  </div>
                ),
              },
            ]}
          />
        </div>
      ) : (
        <>
          {chartSection}
          {detailTables}
        </>
      )}      
    </div>
  )
}

export default IncomeExpenseReport
