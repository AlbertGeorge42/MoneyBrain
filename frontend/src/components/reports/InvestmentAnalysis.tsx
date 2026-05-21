import React, { useMemo, useState } from 'react'
import { Button, Card, Empty, Grid, Popover, Statistic, Tag, Typography, theme } from 'antd'
import { CameraOutlined, SettingOutlined } from '@ant-design/icons'
import DynamicIcon from '../common/DynamicIcon'
import { RangeTimePickerField, type RangeTimePickerConfig, type RangeTimeValue } from '../common'
import { LineChart, PieChart } from '../charts'
import ReportViewSwitcher from './ReportViewSwitcher'
import InvestmentAssetClassConfigModal from './InvestmentAssetClassConfigModal'
import InvestmentSnapshotHistoryModal from './InvestmentSnapshotHistoryModal'
import RebalanceModal from './RebalanceModal'
import type {
  AccountAllocationDetail,
  AccountAllocationItem,
  InvestmentAccountDetail,
  InvestmentAnalysisReportData,
} from '@shared/types'
import { formatCurrency } from '../../utils/format'

const { Text } = Typography

const EMPTY_BY_CATEGORY: InvestmentAnalysisReportData['byCategory'] = []
const EMPTY_ALLOCATIONS: InvestmentAnalysisReportData['byAccountAllocation'] = []
const EMPTY_STALE_ACCOUNTS: InvestmentAnalysisReportData['staleAccounts'] = []

interface InvestmentAnalysisProps {
  timeRange: RangeTimeValue
  pickerConfig: RangeTimePickerConfig
  investmentData: InvestmentAnalysisReportData | null
  onTimeRangeChange: (value: RangeTimeValue) => void
  onRefresh: () => void
}

interface AccountBoardItem {
  key: string
  account: InvestmentAccountDetail
  allocation?: AccountAllocationDetail
  assets: AccountAllocationItem[]
}

const InvestmentAnalysis: React.FC<InvestmentAnalysisProps> = ({
  timeRange,
  pickerConfig,
  investmentData,
  onTimeRangeChange,
  onRefresh,
}) => {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const isDesktop = screens.md
  const { token } = theme.useToken()

  const [configModalVisible, setConfigModalVisible] = useState(false)
  const [snapshotHistoryModalVisible, setSnapshotHistoryModalVisible] = useState(false)
  const [rebalanceModalVisible, setRebalanceModalVisible] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(undefined)
  const [selectedAllocation, setSelectedAllocation] = useState<AccountAllocationDetail | null>(null)

  const handleOpenConfig = (accountId?: string) => {
    setSelectedAccountId(accountId)
    setConfigModalVisible(true)
  }

  const handleOpenSnapshotHistory = (accountId?: string) => {
    setSelectedAccountId(accountId)
    setSnapshotHistoryModalVisible(true)
  }

  const handleOpenRebalance = (allocation: AccountAllocationDetail) => {
    setSelectedAllocation(allocation)
    setRebalanceModalVisible(true)
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
        onRefresh={onRefresh}
        initialAccountId={selectedAccountId}
      />
    </div>
  )

  const reportByCategory = investmentData?.byCategory ?? EMPTY_BY_CATEGORY
  const reportAllocations = investmentData?.byAccountAllocation ?? EMPTY_ALLOCATIONS
  const reportStaleAccounts = investmentData?.staleAccounts ?? EMPTY_STALE_ACCOUNTS

  const allAccounts: InvestmentAccountDetail[] = useMemo(
    () => reportByCategory.flatMap((category) => category.accounts),
    [reportByCategory]
  )

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

  const allocationMap = useMemo(
    () => new Map(reportAllocations.map((allocation) => [allocation.accountId, allocation])),
    [reportAllocations]
  )

  const staleAccountSet = useMemo(
    () => new Set(reportStaleAccounts.map((account) => account.accountId)),
    [reportStaleAccounts]
  )

  const accountBoardItems: AccountBoardItem[] = useMemo(
    () =>
      allAccounts.map((account) => {
        const allocation = allocationMap.get(account.id)
        return {
          key: account.id,
          account,
          allocation,
          assets: allocation?.items ?? [],
        }
      }),
    [allAccounts, allocationMap]
  )

  if (!investmentData) return renderEmptyState()

  const { returnAnalysis, trend, totalAssets, investmentRatio } = investmentData

  const getAccountStatus = (allocation?: AccountAllocationDetail) => {
    if (!allocation) return null
    if (!allocation.hasAssetClasses) return { color: 'warning', text: '未配置资产类型', type: 'no-config' }
    if (allocation.items.length === 0) return { color: 'processing', text: '未录入快照', type: 'no-snapshot' }
    if (staleAccountSet.has(allocation.accountId)) return { color: 'warning', text: '快照超期', type: 'stale' }

    const hasTargetRatio = allocation.items.some(item => item.targetRatio !== null)
    if (!hasTargetRatio) return { color: 'default', text: '目标未配置', type: 'no-target' }

    const maxDeviation = Math.max(
      ...allocation.items
        .filter((item) => item.deviation !== null)
        .map((item) => Math.abs(item.deviation as number)),
      0
    )

    if (maxDeviation <= 2) return { color: 'success', text: '配置均衡', type: 'balanced', maxDeviation }
    if (maxDeviation <= 5) return { color: 'warning', text: `偏离 ${maxDeviation.toFixed(1)}%`, type: 'deviation', maxDeviation }
    return { color: 'error', text: `偏离 ${maxDeviation.toFixed(1)}%`, type: 'deviation', maxDeviation }
  }

  const getRebalanceSummary = (allocation: AccountAllocationDetail) => {
    const maxDeviationItem = allocation.items
      .filter(item => item.deviation !== null)
      .reduce((max, item) => {
        if (!max) return item
        return Math.abs(item.deviation as number) > Math.abs(max.deviation as number) ? item : max
      }, null as AccountAllocationItem | null)

    if (!maxDeviationItem || maxDeviationItem.deviation === null) return null

    const maxDeviation = maxDeviationItem.deviation
    const sign = maxDeviation > 0 ? '+' : ''

    const suggestionParts: string[] = []
    allocation.items.forEach(item => {
      if (item.rebalanceAmount !== null && Math.abs(item.rebalanceAmount) > 0.01) {
        if (item.rebalanceAmount > 0) {
          suggestionParts.push(`买入${item.name} ${formatCurrency(item.rebalanceAmount)}`)
        } else {
          suggestionParts.push(`卖出${item.name} ${formatCurrency(Math.abs(item.rebalanceAmount))}`)
        }
      }
    })

    return {
      maxDeviationText: `最大偏离：${maxDeviationItem.name} ${sign}${maxDeviation.toFixed(1)}%`,
      suggestion: suggestionParts.length > 0 ? `建议：${suggestionParts.join('，')}` : null,
    }
  }

  const renderReturnRate = (rate: number | null, precision = 2) => {
    if (rate === null) return <Text type="secondary">--</Text>
    const color = rate >= 0 ? 'var(--mb-color-positive)' : 'var(--mb-color-negative)'
    return <Text style={{ color }}>{rate >= 0 ? '+' : ''}{rate.toFixed(precision)}%</Text>
  }

  const renderStatusTag = (allocation?: AccountAllocationDetail) => {
    const status = getAccountStatus(allocation)
    if (!status) return null

    const tagElement = (
      <Tag
        color={status.color}
        style={{ cursor: 'pointer' }}
        onClick={() => {
          if (!allocation) return
          if (status.type === 'no-config') {
            handleOpenConfig(allocation.accountId)
          } else {
            handleOpenRebalance(allocation)
          }
        }}
      >
        {status.text}
      </Tag>
    )

    if (isDesktop && allocation && (status.type === 'deviation' || status.type === 'balanced' || status.type === 'no-target')) {
      const summary = status.type !== 'no-target' ? getRebalanceSummary(allocation) : null

      const popoverContent = status.type === 'no-target' ? (
        <div style={{ maxWidth: 200 }}>
          <Text type="secondary">尚未配置目标比例，点击设置目标比例</Text>
        </div>
      ) : summary ? (
        <div style={{ maxWidth: 280 }}>
          <Text>{summary.maxDeviationText}</Text>
          {summary.suggestion && (
            <div style={{ marginTop: 4 }}>
              <Text type="secondary">{summary.suggestion}</Text>
            </div>
          )}
        </div>
      ) : null

      if (popoverContent) {
        return (
          <Popover content={popoverContent} trigger="hover">
            {tagElement}
          </Popover>
        )
      }
    }

    return tagElement
  }

  const renderAccountBoardItem = ({ account, allocation, assets }: AccountBoardItem) => {
    return (
      <div key={account.id} className="report-detail-list__item investment-board__item">
        <div className="report-detail-list__header investment-board__account-row">
          <span className="report-detail-list__title">
            <DynamicIcon name={account.icon} size={16} fallback="wallet" />
            <span>{account.name}</span>
            {renderStatusTag(allocation)}
          </span>
          <span className="investment-board__account-value">
            <Text strong>{formatCurrency(account.balance)}</Text>
            {renderReturnRate(account.cumulativeReturnRate)}
          </span>
        </div>

        {allocation && allocation.latestSnapshotDate && (
          <div style={{ 
            fontSize: token.fontSizeSM,
            color: token.colorTextTertiary,
          }}>
            快照日期：{allocation.latestSnapshotDate}
          </div>
        )}

        {allocation && allocation.hasAssetClasses && assets.length > 0 ? (
          <div className="report-detail-list__subitems investment-board__asset-list">
            {assets.map((asset) => (
              <div key={asset.assetClassId} className="investment-board__asset-row">
                <span className="investment-board__asset-name">
                  <DynamicIcon name={asset.icon} size={14} fallback="investment" />
                  {asset.name}
                </span>
                <span className="investment-board__asset-metrics">
                  <Text type="secondary">{asset.ratio.toFixed(1)}%</Text>
                  <Text>{formatCurrency(asset.marketValue)}</Text>
                  {renderReturnRate(asset.returnRate, 1)}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {allocation && !allocation.hasAssetClasses ? (
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            未配置资产类型，当前按未分类处理。
          </Text>
        ) : null}

        {allocation && allocation.hasAssetClasses && assets.length === 0 ? (
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            尚未录入资产分类快照。
          </Text>
        ) : null}
      </div>
    )
  }

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
          <Statistic title="期末市值" value={returnAnalysis.endValue} precision={2} valueStyle={{ color: 'var(--mb-color-investing)' }} prefix="¥" />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="期间投入" value={returnAnalysis.periodInvested} precision={2} valueStyle={{ color: token.colorTextSecondary }} prefix="¥" />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="期间取出" value={returnAnalysis.periodWithdrawn} precision={2} valueStyle={{ color: token.colorTextSecondary }} prefix="¥" />
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

  const detailSection = (
    <Card title="投资账户明细" className="surface-card report-section-card" size="small">
      <div className="report-detail-list investment-board">
        {accountBoardItems.map(renderAccountBoardItem)}
      </div>
    </Card>
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
        onRefresh={onRefresh}
        initialAccountId={selectedAccountId}
      />
      <RebalanceModal
        visible={rebalanceModalVisible}
        onClose={() => setRebalanceModalVisible(false)}
        allocation={selectedAllocation}
      />
    </div>
  )
}

export default InvestmentAnalysis
