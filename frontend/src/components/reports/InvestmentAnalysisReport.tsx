import React, { useMemo } from 'react'
import { Button, Card, Empty, Grid, Statistic, theme } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import { RangeTimePickerField, ReportDetailList, type RangeTimePickerConfig, type RangeTimeValue, type ReportTreeNode, type ReportDetailColumn } from '../../components/common'
import { LineChart, PieChart } from '../../components/charts'
import ReportViewSwitcher from './ReportViewSwitcher'
import InvestmentSnapshotHistorySection from '../investment/InvestmentSnapshotHistorySection'
import type {
  AccountAllocationDetail,
  InvestmentAnalysisReportData,
} from '@shared/types'
import { formatCurrency, formatPercent, createStatisticFormatter } from '../../utils/format'
import { getAmountColor } from '../../utils/formatAmount'
import { useAmountColors } from '../../constants/transactionType'
import { useTheme } from '../../styles/ThemeContext'

const statisticFormatter = createStatisticFormatter()

const EMPTY_BY_CATEGORY: InvestmentAnalysisReportData['byCategory'] = []
const EMPTY_ALLOCATIONS: InvestmentAnalysisReportData['byAccountAllocation'] = []

interface InvestmentDetailMetrics {
  balance: number
  marketValue: number
  ratio: number | null
  returnRate: number | null
}

const createInvestmentColumns = (isDark: boolean): ReportDetailColumn<InvestmentDetailMetrics>[] => [
  {
    key: 'value',
    metric: 'marketValue',
    title: '市值',
    width: 140,
    align: 'right',
    format: (v) => formatCurrency(v as number),
  },
  {
    key: 'ratio',
    metric: 'ratio',
    title: '占比',
    width: 80,
    align: 'right',
    format: (v) => v != null ? formatPercent(v as number, 1, false) : '', // 账户行不显示任何值
  },
  {
    key: 'returnRate',
    metric: 'returnRate',
    title: '收益率',
    width: 80,
    align: 'right',
    format: (v) => v != null ? formatPercent(v as number) : '--',
    color: (v) => v != null && (v as number) >= 0 ? getAmountColor(1, 'flow', isDark) : getAmountColor(-1, 'flow', isDark),
  },
]

function buildInvestmentTreeData(
  allocations: AccountAllocationDetail[]
): ReportTreeNode<InvestmentDetailMetrics>[] {
  return allocations.map((allocation) => ({
    key: `account-${allocation.accountId}`,
    name: allocation.accountName,
    icon: allocation.accountIcon || 'wallet',
    iconColor: allocation.accountColor ?? null,
    metrics: {
      balance: allocation.balance,
      marketValue: allocation.balance,
      ratio: null, // 账户行不显示占比
      returnRate: allocation.returnRate, // 显示账户收益率
    },
    children: allocation.items.map((item) => ({
      key: `asset-${allocation.accountId}-${item.assetClassId}`,
      name: item.name,
      icon: item.icon || undefined,
      iconColor: item.color ?? null,
      metrics: {
        balance: 0,
        marketValue: item.marketValue,
        ratio: item.ratio,
        returnRate: item.returnRate,
      },
    })),
  }))
}

interface InvestmentAnalysisReportProps {
  timeRange: RangeTimeValue
  pickerConfig: RangeTimePickerConfig
  investmentData: InvestmentAnalysisReportData | null
  loading?: boolean
  onTimeRangeChange: (value: RangeTimeValue) => void
  onOpenSettings: () => void
  onRefresh: () => void
}

const InvestmentAnalysisReport: React.FC<InvestmentAnalysisReportProps> = ({
  timeRange,
  pickerConfig,
  investmentData,
  loading,
  onTimeRangeChange,
  onOpenSettings,
  onRefresh,
}) => {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const { token } = theme.useToken()
  const { isDark } = useTheme()
  const amountColors = useAmountColors()

  const renderEmptyState = () => (
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

      <Card className="surface-card report-section-card">
        <Empty description="暂无投资账户，请先在账户分类设置中标记投资类账户。" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </Card>
    </div>
  )

  const reportByCategory = investmentData?.byCategory ?? EMPTY_BY_CATEGORY
  const reportAllocations = investmentData?.byAccountAllocation ?? EMPTY_ALLOCATIONS

  const pieData = useMemo(
    () =>
      reportByCategory
        .map((category) => ({
          name: category.categoryName,
          value: Math.abs(category.balance),
        }))
        .filter((item) => item.value > 0),
    [reportByCategory]
  )

  const isEmpty = !investmentData

  // 空状态时提前返回，弹窗在最外层渲染
  if (isEmpty) {
    return renderEmptyState()
  }

  const { returnAnalysis, trend, totalAssets, investmentRatio } = investmentData

  const summarySection = (
    <>
      <div className="report-hero-section">
        <Card className="surface-card report-section-card report-hero-card">
          <Statistic
            title="累计收益率"
            value={returnAnalysis.cumulativeReturnRate}
            formatter={(v) => formatPercent(Number(v), 2)}
            valueStyle={{ color: getAmountColor(returnAnalysis.cumulativeReturnRate, 'flow', isDark) }}
          />
          <div style={{ fontSize: `${token.fontSizeSM}px`, color: token.colorTextTertiary, marginTop: 8 }}>
            累计收益 {formatCurrency(returnAnalysis.periodReturn)} | 最高本金 {formatCurrency(returnAnalysis.maxCapitalEmployed)}
          </div>
        </Card>
      </div>

      <div className="report-secondary-section report-secondary-section--2">
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="期末市值" value={returnAnalysis.endValue} precision={2} valueStyle={{ color: amountColors.neutral }} formatter={statisticFormatter} />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="期间投入" value={returnAnalysis.periodInvested} precision={2} valueStyle={{ color: amountColors.positive }} formatter={statisticFormatter} />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="期间取出" value={returnAnalysis.periodWithdrawn} precision={2} valueStyle={{ color: amountColors.negative }} formatter={statisticFormatter} />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic
            title="XIRR 年化"
            value={returnAnalysis.xirr !== null ? returnAnalysis.xirr : '--'}
            formatter={(v) => returnAnalysis.xirr !== null ? formatPercent(Number(v), 2) : '--'}
            valueStyle={{ color: getAmountColor(returnAnalysis.xirr ?? 0, 'flow', isDark) }}
          />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic
            title="TWR 年化"
            value={returnAnalysis.annualizedTwr !== null ? returnAnalysis.annualizedTwr : '--'}
            formatter={(v) => returnAnalysis.annualizedTwr !== null ? formatPercent(Number(v), 2) : '--'}
            valueStyle={{ color: getAmountColor(returnAnalysis.annualizedTwr ?? 0, 'flow', isDark) }}
          />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="投资占比" value={investmentRatio} formatter={(v) => formatPercent(Number(v), 2, false)} valueStyle={{ color: token.colorTextSecondary }} />
        </Card>
      </div>

      <Card className="surface-card report-section-card">
        <div className="report-summary-note" style={{ color: token.colorTextTertiary, fontSize: `${token.fontSizeSM}px` }}>
          投资天数: {returnAnalysis.investmentDays} 天 | 现金流笔数: {returnAnalysis.cashFlowCount} 笔 | 账户数量: {investmentData.accountCount} 个 | 总资产 {formatCurrency(totalAssets)}
        </div>
      </Card>
    </>
  )

  const chartSection = (
    <div className="report-chart-grid report-chart-grid--2">
      <Card className="surface-card report-section-card" size="small">
        <PieChart title="投资分布" data={pieData} height={isMobile ? 240 : 280} layout={isMobile ? 'compact' : 'normal'} />
      </Card>
      <Card className="surface-card report-section-card" size="small">
        <LineChart
          title="投资趋势"
          xAxisData={trend.map((item) => item.month)}
          seriesData={[
            {
              name: '投资总额',
              data: trend.map((item) => item.investment),
            },
          ]}
          height={isMobile ? 240 : 280}
        />
      </Card>
    </div>
  )

  const investmentTreeData = buildInvestmentTreeData(reportAllocations)

  const detailSection = (
    <ReportDetailList
      data={investmentTreeData}
      config={{
        columns: createInvestmentColumns(isDark),
        parentIcon: 'wallet',
        leafIcon: 'investment',
        expandable: true,
        defaultExpandDepth: 1,
      }}
      loading={loading}
      title="投资账户明细"
    />
  )

  return (
    <>
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
                  key: 'trend',
                  label: '趋势',
                  content: (
                    <Card className="surface-card report-section-card" size="small">
                      <LineChart
                        title="投资趋势"
                        xAxisData={trend.map((item) => item.month)}
                        seriesData={[
                          {
                            name: '投资总额',
                            data: trend.map((item) => item.investment),
                          },
                        ]}
                        height={240}
                      />
                    </Card>
                  ),
                },
                {
                  key: 'distribution',
                  label: '分布',
                  content: (
                    <Card className="surface-card report-section-card" size="small">
                      <PieChart title="投资分布" data={pieData} height={240} layout="compact" />
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

      {/* 快照历史区域 */}
      <InvestmentSnapshotHistorySection
        investmentData={investmentData}
        onRefresh={onRefresh}
      />
    </>
  )
}

export default InvestmentAnalysisReport
