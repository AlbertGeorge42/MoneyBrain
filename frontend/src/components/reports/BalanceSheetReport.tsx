import React, { useMemo } from 'react'
import { Button, Card, Grid, Space, Statistic, Tag, theme } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import type { BalanceSheetCategoryNode, BalanceSheetReportData } from '@shared/types'
import { PointTimePickerField, ReportDetailList } from '../common'
import type { PointTimePickerConfig, PointTimeValue, ReportTreeNode, ReportDetailColumn } from '../common'
import { PieChart, type PieChartDataItem } from '../charts'
import ReportViewSwitcher from './ReportViewSwitcher'
import { getPointTimeSemantics } from '../../utils/timePicker'
import { formatCurrency } from '../../utils/format'
import { formatAmount, getAmountColor } from '../../utils/formatAmount'
import { useTheme } from '../../styles/ThemeContext'
import { useAmountColors } from '../../constants/transactionType'
import { PredictionStatistic } from '.'

// ---- 本报表专属：metrics 类型 ----
export interface BalanceSheetMetrics {
  balance: number
  actual: number
  predicted: number
  nodeType: 'asset' | 'liability'
}

export type BalanceSheetNode = ReportTreeNode<BalanceSheetMetrics>

// ---- 本报表专属：列配置 ----
const createBalanceSheetColumns = (isDark: boolean): ReportDetailColumn<BalanceSheetMetrics>[] => [
  {
    key: 'amount',
    metric: 'balance',
    width: 140,
    align: 'right',
    prediction: { displayMetric: 'balance', actualMetric: 'actual', predictedMetric: 'predicted' },
    format: (v, node) => formatAmount(v as number, node.metrics?.nodeType ?? 'asset', { isDark }).text,
    color: (_v, node) => formatAmount(_v as number, node.metrics?.nodeType ?? 'asset', { isDark }).color,
  },
]

// 适配后端返回的树形数据为前端 ReportTreeNode 格式
function adaptBalanceSheetNode(
  node: BalanceSheetCategoryNode,
  nodeType: 'asset' | 'liability'
): ReportTreeNode<BalanceSheetMetrics> {
  return {
    key: `category-${node.id}`,
    name: node.name,
    icon: node.icon || undefined,
    iconColor: node.color ?? null,
    metrics: {
      balance: node.actual + node.predicted,
      actual: node.actual,
      predicted: node.predicted,
      nodeType,
    },
    children: node.children?.map(child => ({
      key: `account-${child.id}`,
      name: child.name,
      icon: child.icon || undefined,
      iconColor: child.color ?? null,
      metrics: {
        balance: child.actual + child.predicted,
        actual: child.actual,
        predicted: child.predicted,
        nodeType,
      },
    })),
  }
}

interface BalanceSheetReportProps {
  selectedTime: PointTimeValue
  pickerConfig: PointTimePickerConfig
  balanceSheetData: BalanceSheetReportData | null
  loading?: boolean
  onTimeChange: (value: PointTimeValue) => void
  onOpenSettings: () => void
}

const BalanceSheetReport: React.FC<BalanceSheetReportProps> = ({
  selectedTime,
  pickerConfig,
  balanceSheetData,
  loading,
  onTimeChange,
  onOpenSettings,
}) => {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const useClickTrigger = !screens.lg
  const { token } = theme.useToken()
  const { isDark } = useTheme()
  const amountColors = useAmountColors()

  const targetDate = useMemo(() => {
    if (selectedTime.granularity === 'day') {
      return selectedTime.value
    }
    if (selectedTime.granularity === 'month') {
      return selectedTime.value.endOf('month')
    }
    return selectedTime.value.endOf('year')
  }, [selectedTime])

  const { isFuture } = getPointTimeSemantics(targetDate)

  // 直接使用后端返回的树形数据
  const treeData = useMemo(
    () => ({
      assetNodes: (balanceSheetData?.assetNodes || []).map(node => adaptBalanceSheetNode(node, 'asset')),
      liabilityNodes: (balanceSheetData?.liabilityNodes || []).map(node => adaptBalanceSheetNode(node, 'liability')),
    }),
    [balanceSheetData?.assetNodes, balanceSheetData?.liabilityNodes]
  )

  const assetPieData = useMemo(
    () =>
      treeData.assetNodes
        .map((node) => {
          const total = node.metrics?.balance ?? 0
          return {
            name: node.name,
            value: total,
            predictedValue: isFuture && (node.metrics?.predicted ?? 0) !== 0 ? node.metrics?.predicted : undefined,
            categoryId: node.key,
            hasChildren: Boolean(node.children?.length),
          }
        })
        .filter((item) => item.value > 0),
    [treeData.assetNodes, isFuture]
  )

  const liabilityPieData = useMemo(
    () =>
      treeData.liabilityNodes
        .map((node) => {
          const total = node.metrics?.balance ?? 0
          return {
            name: node.name,
            value: Math.abs(total),
            predictedValue: isFuture && (node.metrics?.predicted ?? 0) !== 0 ? node.metrics?.predicted : undefined,
            categoryId: node.key,
            hasChildren: Boolean(node.children?.length),
            isLiability: true,
          }
        })
        .filter((item) => item.value !== 0),
    [treeData.liabilityNodes, isFuture]
  )

  const handleDrillDown = async (
    nodes: BalanceSheetNode[],
    item: PieChartDataItem
  ): Promise<PieChartDataItem[]> => {
    if (!item.categoryId) return []

    const categoryNode = nodes.find((node) => node.key === item.categoryId)
    if (!categoryNode?.children) return []
    const isLiability = item.isLiability

    return categoryNode.children
      .filter((account) => {
        const total = (account.metrics?.balance ?? 0) + (isFuture ? (account.metrics?.predicted ?? 0) : 0)
        return total !== 0
      })
      .map((account) => {
        const predicted = isFuture ? (account.metrics?.predicted ?? 0) : 0
        const total = (account.metrics?.balance ?? 0) + predicted
        return {
          name: account.name,
          value: total,
          predictedValue: isFuture && predicted !== 0 ? predicted : undefined,
          isLiability,
        }
      })
  }

  const balanceSheetColumns = useMemo(() => createBalanceSheetColumns(isDark), [isDark])

  const netWorthValue = balanceSheetData?.netWorth || { actual: 0, predicted: 0 }
  const assetsValue = balanceSheetData?.assets || { actual: 0, predicted: 0 }
  const liabilitiesValue = balanceSheetData?.liabilities || { actual: 0, predicted: 0 }
  const hasPrediction = assetsValue.predicted !== 0 || liabilitiesValue.predicted !== 0
  const showPred = isFuture && hasPrediction
  const netWorthTotal = showPred ? netWorthValue.actual + netWorthValue.predicted : netWorthValue.actual
  const assetsTotal = showPred ? assetsValue.actual + assetsValue.predicted : assetsValue.actual
  const liabilitiesTotal = showPred ? liabilitiesValue.actual + liabilitiesValue.predicted : liabilitiesValue.actual

  const formatStatValue = (v: number) => formatCurrency(v)

  const summarySection = (
    <>
      <div className="report-hero-section">
        <Card className="surface-card report-section-card report-hero-card">
          {showPred ? (
            <PredictionStatistic
              title="净资产"
              value={netWorthValue}
              useClickTrigger={useClickTrigger}
              valueStyle={{ color: getAmountColor(netWorthTotal, 'flow', isDark) }}
            />
          ) : (
            <Statistic
              title="净资产"
              value={netWorthTotal}
              formatter={(v) => formatStatValue(Number(v))}
              valueStyle={{ color: getAmountColor(netWorthTotal, 'flow', isDark) }}
            />
          )}
          <div className="report-hero-card__sub">
            <Statistic
              title="资产负债率"
              value={assetsTotal > 0 ? (liabilitiesTotal / assetsTotal) * 100 : 0}
              precision={1}
              valueStyle={{ color: amountColors.neutral }}
              suffix="%"
            />
          </div>
        </Card>
      </div>

      <div className="report-secondary-section report-secondary-section--2">
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          {showPred ? (
            <PredictionStatistic
              title="总资产"
              value={assetsValue}
              useClickTrigger={useClickTrigger}
              valueStyle={{ color: getAmountColor(assetsTotal, 'asset', isDark) }}
            />
          ) : (
            <Statistic
              title="总资产"
              value={assetsTotal}
              formatter={(v) => formatStatValue(Number(v))}
              valueStyle={{ color: getAmountColor(assetsTotal, 'asset', isDark) }}
            />
          )}
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          {showPred ? (
            <PredictionStatistic
              title="总负债"
              value={liabilitiesValue}
              useClickTrigger={useClickTrigger}
              valueStyle={{ color: getAmountColor(liabilitiesTotal, 'liability', isDark) }}
            />
          ) : (
            <Statistic
              title="总负债"
              value={liabilitiesTotal}
              formatter={(v) => formatStatValue(Number(v))}
              valueStyle={{ color: getAmountColor(liabilitiesTotal, 'liability', isDark) }}
            />
          )}
        </Card>
      </div>
      {showPred && balanceSheetData?.predictionNote && (
        <div style={{ color: 'var(--mb-color-text-tertiary)', fontSize: 'var(--mb-font-size-sm)', textAlign: 'center', marginTop: -8, marginBottom: token.margin }}>
          {balanceSheetData.predictionNote}
        </div>
      )}
    </>
  )
  
  const chartSection = (
    <div className="report-chart-grid report-chart-grid--2">
      <Card className="surface-card report-section-card" size="small">
        <PieChart
          title="资产结构"
          data={assetPieData}
          height={isMobile ? 240 : 280}
          layout={isMobile ? 'compact' : 'normal'}
          onDrillDown={(item) => handleDrillDown(treeData.assetNodes, item)}
          isPurePrediction={isFuture}
        />
      </Card>
      <Card className="surface-card report-section-card" size="small">
        <PieChart
          title="负债结构"
          data={liabilityPieData}
          height={isMobile ? 240 : 280}
          layout={isMobile ? 'compact' : 'normal'}
          onDrillDown={(item) => handleDrillDown(treeData.liabilityNodes, item)}
          isPurePrediction={isFuture}
        />
      </Card>
    </div>
  )

  const assetDetailCard = (
    <ReportDetailList
      data={treeData.assetNodes}
      config={{
        columns: balanceSheetColumns,
        parentIcon: 'folder',
        leafIcon: 'wallet',
        expandable: true,
        defaultExpandDepth: 1,
      }}
      loading={loading}
      isFuture={showPred}
      useClickTrigger={useClickTrigger}
      title={isFuture ? <>资产明细 <Tag color="processing" style={{ fontSize: 10 }}>预测</Tag></> : '资产明细'}
    />
  )

  const liabilityDetailCard = (
    <ReportDetailList
      data={treeData.liabilityNodes}
      config={{
        columns: balanceSheetColumns,
        parentIcon: 'folder',
        leafIcon: 'wallet',
        expandable: true,
        defaultExpandDepth: 1,
      }}
      loading={loading}
      isFuture={showPred}
      useClickTrigger={useClickTrigger}
      title={isFuture ? <>负债明细 <Tag color="processing" style={{ fontSize: 10 }}>预测</Tag></> : '负债明细'}
    />
  )

  const detailTables = (
    <div className="report-chart-grid report-chart-grid--2">
      {assetDetailCard}
      {liabilityDetailCard}
    </div>
  )

  return (
    <div className="section-grid">
      <div className="report-toolbar" style={{ marginBottom: `${token.padding}px` }}>
        <div className="report-toolbar__filters">
          <PointTimePickerField value={selectedTime} config={pickerConfig} onChange={onTimeChange} />
        </div>
        <Space className="report-toolbar__actions">
          <Button icon={<SettingOutlined />} onClick={onOpenSettings}>
            设置
          </Button>
        </Space>
      </div>

      {summarySection}

      {isMobile ? (
        <ReportViewSwitcher
          className="report-view-switcher"
          items={[
            {
              key: 'assets',
              label: '资产',
              content: (
                <div className="report-detail-stack">
                  <Card className="surface-card report-section-card" size="small">
                    <PieChart
                      title="资产结构"
                      data={assetPieData}
                      height={240}
                      layout="compact"
                      onDrillDown={(item) => handleDrillDown(treeData.assetNodes, item)}
                      isPurePrediction={isFuture}
                    />
                  </Card>
                  {assetDetailCard}
                </div>
              ),
            },
            {
              key: 'liabilities',
              label: '负债',
              content: (
                <div className="report-detail-stack">
                  <Card className="surface-card report-section-card" size="small">
                    <PieChart
                      title="负债结构"
                      data={liabilityPieData}
                      height={240}
                      layout="compact"
                      onDrillDown={(item) => handleDrillDown(treeData.liabilityNodes, item)}
                      isPurePrediction={isFuture}
                    />
                  </Card>
                  {liabilityDetailCard}
                </div>
              ),
            },
          ]}
        />
      ) : (
        <>
          {chartSection}
          {detailTables}
        </>
      )}
    </div>
  )
}

export default BalanceSheetReport
