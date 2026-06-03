import React, { useMemo, useState } from 'react'
import { Button, Card, Empty, Grid, Statistic, theme } from 'antd'
import { CameraOutlined, SettingOutlined } from '@ant-design/icons'
import { RangeTimePickerField, ReportDetailList, type RangeTimePickerConfig, type RangeTimeValue, type ReportTreeNode, type ReportDetailColumn } from '../../components/common'
import { LineChart, PieChart } from '../../components/charts'
import ReportViewSwitcher from './ReportViewSwitcher'
import InvestmentAssetClassConfigModal from '../investment/InvestmentAssetClassConfigModal'
import InvestmentSnapshotHistoryModal from '../investment/InvestmentSnapshotHistoryModal'
import type {
  AccountAllocationDetail,
  InvestmentAnalysisReportData,
} from '@shared/types'
import { formatCurrency, createStatisticFormatter } from '../../utils/format'

const statisticFormatter = createStatisticFormatter()

const EMPTY_BY_CATEGORY: InvestmentAnalysisReportData['byCategory'] = []
const EMPTY_ALLOCATIONS: InvestmentAnalysisReportData['byAccountAllocation'] = []

interface InvestmentDetailMetrics {
  balance: number
  marketValue: number
  ratio: number
  returnRate: number | null
}

const investmentColumns: ReportDetailColumn<InvestmentDetailMetrics>[] = [
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
    format: (v) => (v as number) > 0 ? `${(v as number).toFixed(1)}%` : '--',
  },
  {
    key: 'returnRate',
    metric: 'returnRate',
    title: '收益率',
    width: 80,
    align: 'right',
    format: (v) => v != null ? `${(v as number) >= 0 ? '+' : ''}${(v as number).toFixed(1)}%` : '--',
    color: (v) => v != null && (v as number) >= 0 ? 'var(--mb-color-positive)' : 'var(--mb-color-negative)',
  },
]

function buildInvestmentTreeData(
  allocations: AccountAllocationDetail[]
): ReportTreeNode<InvestmentDetailMetrics>[] {
  return allocations.map((allocation) => ({
    key: `account-${allocation.accountId}`,
    name: allocation.accountName,
    icon: 'wallet',
    metrics: {
      balance: allocation.balance,
      marketValue: allocation.balance,
      ratio: 0,
      returnRate: null,
    },
    children: allocation.items.map((item) => ({
      key: `asset-${allocation.accountId}-${item.assetClassId}`,
      name: item.name,
      icon: item.icon,
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
  refetch: () => void
  onTimeRangeChange: (value: RangeTimeValue) => void
}

const InvestmentAnalysisReport: React.FC<InvestmentAnalysisReportProps> = ({
  timeRange,
  pickerConfig,
  investmentData,
  loading,
  refetch,
  onTimeRangeChange,
}) => {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const { token } = theme.useToken()

  const [configModalVisible, setConfigModalVisible] = useState(false)
  const [snapshotHistoryModalVisible, setSnapshotHistoryModalVisible] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(undefined)

  const handleOpenConfig = (accountId?: string) => {
    setSelectedAccountId(accountId)
    setConfigModalVisible(true)
  }

  const handleOpenSnapshotHistory = (accountId?: string) => {
    setSelectedAccountId(accountId)
    setSnapshotHistoryModalVisible(true)
  }

  const renderEmptyState = () => (
    <div className="section-grid">
      <div className="report-toolbar" style={{ marginBottom: `${token.padding}px` }}>
        <div className="report-toolbar__filters">
          <RangeTimePickerField value={timeRange} config={pickerConfig} onChange={onTimeRangeChange} />
        </div>
        <div className="report-toolbar__actions">
          <Button icon={<CameraOutlined />} onClick={() => handleOpenSnapshotHistory()}>
            快照
          </Button>
          <Button icon={<SettingOutlined />} onClick={() => handleOpenConfig()}>
            设置
          </Button>
        </div>
      </div>

      <Card className="surface-card report-section-card">
        <Empty description="暂无投资账户，请先在账户分类设置中标记投资类账户。" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </Card>

      <InvestmentAssetClassConfigModal
        visible={configModalVisible}
        onClose={() => setConfigModalVisible(false)}
        initialAccountId={selectedAccountId}
      />
      <InvestmentSnapshotHistoryModal
        visible={snapshotHistoryModalVisible}
        onClose={() => setSnapshotHistoryModalVisible(false)}
        onRefresh={refetch}
        initialAccountId={selectedAccountId}
      />
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

  if (!investmentData) return renderEmptyState()

  const { returnAnalysis, trend, totalAssets, investmentRatio } = investmentData

  const summarySection = (
    <>
      <div className="report-hero-section">
        <Card className="surface-card report-section-card report-hero-card">
          <Statistic
            title="累计收益率"
            value={returnAnalysis.cumulativeReturnRate}
            precision={2}
            valueStyle={{ color: returnAnalysis.cumulativeReturnRate >= 0 ? 'var(--mb-color-positive)' : 'var(--mb-color-negative)' }}
            suffix="%"
          />
          <div style={{ fontSize: `${token.fontSizeSM}px`, color: token.colorTextTertiary, marginTop: 8 }}>
            累计收益 {formatCurrency(returnAnalysis.periodReturn)} | 最高本金 {formatCurrency(returnAnalysis.maxCapitalEmployed)}
          </div>
        </Card>
      </div>

      <div className="report-secondary-section report-secondary-section--2">
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="期末市值" value={returnAnalysis.endValue} precision={2} valueStyle={{ color: 'var(--mb-color-investing)' }} formatter={statisticFormatter} />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="期间投入" value={returnAnalysis.periodInvested} precision={2} valueStyle={{ color: token.colorTextSecondary }} formatter={statisticFormatter} />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="期间取出" value={returnAnalysis.periodWithdrawn} precision={2} valueStyle={{ color: token.colorTextSecondary }} formatter={statisticFormatter} />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic
            title="XIRR 年化"
            value={returnAnalysis.xirr !== null ? returnAnalysis.xirr : '--'}
            precision={returnAnalysis.xirr !== null ? 2 : 0}
            valueStyle={{ color: (returnAnalysis.xirr || 0) >= 0 ? 'var(--mb-color-positive)' : 'var(--mb-color-negative)' }}
            suffix={returnAnalysis.xirr !== null ? '%' : ''}
          />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic
            title="TWR 年化"
            value={returnAnalysis.annualizedTwr !== null ? returnAnalysis.annualizedTwr : '--'}
            precision={returnAnalysis.annualizedTwr !== null ? 2 : 0}
            valueStyle={{ color: (returnAnalysis.annualizedTwr || 0) >= 0 ? 'var(--mb-color-positive)' : 'var(--mb-color-negative)' }}
            suffix={returnAnalysis.annualizedTwr !== null ? '%' : ''}
          />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="投资占比" value={investmentRatio} precision={2} valueStyle={{ color: token.colorTextSecondary }} suffix="%" />
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
        <PieChart title="投资分布" data={pieData} height={isMobile ? 240 : 280} />
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
        columns: investmentColumns,
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
    <div className="section-grid">
      <div className="report-toolbar" style={{ marginBottom: `${token.padding}px` }}>
        <div className="report-toolbar__filters">
          <RangeTimePickerField value={timeRange} config={pickerConfig} onChange={onTimeRangeChange} />
        </div>
        <div className="report-toolbar__actions">
          <Button icon={<CameraOutlined />} onClick={() => handleOpenSnapshotHistory()}>
            快照
          </Button>
          <Button icon={<SettingOutlined />} onClick={() => handleOpenConfig()}>
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
                    <PieChart title="投资分布" data={pieData} height={240} />
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

      <InvestmentAssetClassConfigModal
        visible={configModalVisible}
        onClose={() => setConfigModalVisible(false)}
        initialAccountId={selectedAccountId}
      />
      <InvestmentSnapshotHistoryModal
        visible={snapshotHistoryModalVisible}
        onClose={() => setSnapshotHistoryModalVisible(false)}
        onRefresh={refetch}
        initialAccountId={selectedAccountId}
      />
    </div>
  )
}

export default InvestmentAnalysisReport
