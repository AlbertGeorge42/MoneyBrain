import React, { useMemo } from 'react'
import { Button, Card, Grid, Space, Statistic, Tag, theme } from 'antd'
import { SaveOutlined, SettingOutlined } from '@ant-design/icons'
import type { BalanceSheetReportData } from '@shared/types'
import { DynamicIcon, PointTimePickerField, type PointTimePickerConfig, type PointTimeValue } from '../common'
import { PieChart, type PieChartDataItem } from '../charts'
import ReportViewSwitcher from './ReportViewSwitcher'
import { formatBalance } from '../../utils/formatBalance'
import { getPointTimeSemantics } from '../../utils/timePicker'

import { PredictionStatistic } from '.'
import PredictionPopover from './PredictionPopover'

interface BalanceSheetTreeNode {
  key: string
  name: string
  balance: number
  predicted: number
  nodeType: 'asset' | 'liability'
  type: 'category' | 'account'
  icon?: string
  children?: BalanceSheetTreeNode[]
}

interface BalanceSheetTreeData {
  assetNodes: BalanceSheetTreeNode[]
  liabilityNodes: BalanceSheetTreeNode[]
}

interface BalanceSheetProps {
  selectedTime: PointTimeValue
  pickerConfig: PointTimePickerConfig
  balanceSheetData: BalanceSheetReportData | null
  buildBalanceSheetTreeData: BalanceSheetTreeData
  onTimeChange: (value: PointTimeValue) => void
  onOpenSettings: () => void
  onOpenCalibrate: () => void
}

const BalanceSheet: React.FC<BalanceSheetProps> = ({
  selectedTime,
  pickerConfig,
  balanceSheetData,
  buildBalanceSheetTreeData,
  onTimeChange,
  onOpenSettings,
  onOpenCalibrate,
}) => {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const useClickTrigger = !screens.lg
  const { token } = theme.useToken()

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

  const assetPieData = useMemo(
    () =>
      buildBalanceSheetTreeData.assetNodes
        .filter((node) => node.type === 'category')
        .map((node) => {
          const showPredicted = isFuture ? node.predicted : 0
          const total = node.balance + showPredicted
          return {
            name: node.name,
            value: Math.abs(total),
            predictedValue: isFuture && node.predicted !== 0 ? node.predicted : undefined,
            categoryId: node.key,
            hasChildren: Boolean(node.children?.length),
          }
        })
        .filter((item) => item.value > 0),
    [buildBalanceSheetTreeData.assetNodes, isFuture]
  )

  const liabilityPieData = useMemo(
    () =>
      buildBalanceSheetTreeData.liabilityNodes
        .filter((node) => node.type === 'category')
        .map((node) => {
          const showPredicted = isFuture ? node.predicted : 0
          const total = node.balance + showPredicted
          return {
            name: node.name,
            value: Math.abs(total),
            predictedValue: isFuture && node.predicted !== 0 ? node.predicted : undefined,
            categoryId: node.key,
            hasChildren: Boolean(node.children?.length),
            isLiability: true,
          }
        })
        .filter((item) => item.value > 0),
    [buildBalanceSheetTreeData.liabilityNodes, isFuture]
  )

  const handleDrillDown = async (
    nodes: BalanceSheetTreeNode[],
    item: PieChartDataItem
  ): Promise<PieChartDataItem[]> => {
    if (!item.categoryId) return []

    const categoryNode = nodes.find((node) => node.key === item.categoryId && node.type === 'category')
    if (!categoryNode?.children) return []
    const isLiability = item.isLiability

    return categoryNode.children
      .filter((account) => {
        const total = account.balance + (isFuture ? account.predicted : 0)
        return total !== 0
      })
      .map((account) => {
        const showPredicted = isFuture ? account.predicted : 0
        const total = account.balance + showPredicted
        return {
          name: account.name,
          value: Math.abs(total),
          predictedValue: isFuture && account.predicted !== 0 ? account.predicted : undefined,
          isLiability,
        }
      })
  }

  const netWorthValue = balanceSheetData?.netWorth || { actual: 0, predicted: 0 }
  const assetsValue = balanceSheetData?.assets || { actual: 0, predicted: 0 }
  const liabilitiesValue = balanceSheetData?.liabilities || { actual: 0, predicted: 0 }
  const hasPrediction = assetsValue.predicted !== 0 || liabilitiesValue.predicted !== 0
  const showPred = isFuture && hasPrediction
  const netWorthTotal = showPred ? netWorthValue.actual + netWorthValue.predicted : netWorthValue.actual
  const assetsTotal = showPred ? assetsValue.actual + assetsValue.predicted : assetsValue.actual
  const liabilitiesTotal = showPred ? liabilitiesValue.actual + liabilitiesValue.predicted : liabilitiesValue.actual

  const formatStatValue = (v: number) => `¥${v.toFixed(2)}`

  const summarySection = (
    <>
      <div className="report-hero-section">
        <Card className="surface-card report-section-card report-hero-card">
          {showPred ? (
            <PredictionStatistic
              title="净资产"
              value={netWorthValue}
              useClickTrigger={useClickTrigger}
              valueStyle={{ color: netWorthTotal >= 0 ? 'var(--mb-color-positive)' : 'var(--mb-color-negative)' }}
            />
          ) : (
            <Statistic
              title="净资产"
              value={netWorthTotal}
              formatter={(v) => formatStatValue(Number(v))}
              valueStyle={{ color: netWorthTotal >= 0 ? 'var(--mb-color-positive)' : 'var(--mb-color-negative)' }}
            />
          )}
          <div className="report-hero-card__sub">
            <Statistic
              title="资产负债率"
              value={assetsTotal > 0 ? (Math.abs(liabilitiesTotal) / assetsTotal) * 100 : 0}
              precision={1}
              valueStyle={{ color: 'var(--mb-color-neutral)' }}
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
              valueStyle={{ color: 'var(--mb-color-positive)' }}
            />
          ) : (
            <Statistic
              title="总资产"
              value={assetsTotal}
              formatter={(v) => formatStatValue(Number(v))}
              valueStyle={{ color: 'var(--mb-color-positive)' }}
            />
          )}
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          {showPred ? (
            <PredictionStatistic
              title="总负债"
              value={liabilitiesValue}
              useClickTrigger={useClickTrigger}
              valueStyle={{ color: 'var(--mb-color-negative)' }}
            />
          ) : (
            <Statistic
              title="总负债"
              value={liabilitiesTotal}
              formatter={(v) => formatStatValue(Number(v))}
              valueStyle={{ color: 'var(--mb-color-negative)' }}
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
          onDrillDown={(item) => handleDrillDown(buildBalanceSheetTreeData.assetNodes, item)}
          isPurePrediction={isFuture}
        />
      </Card>
      <Card className="surface-card report-section-card" size="small">
        <PieChart
          title="负债结构"
          data={liabilityPieData}
          height={isMobile ? 240 : 280}
          onDrillDown={(item) => handleDrillDown(buildBalanceSheetTreeData.liabilityNodes, item)}
          isPurePrediction={isFuture}
        />
      </Card>
    </div>
  )

  const assetDetailCard = (
    <Card className="surface-card report-section-card" title={isFuture ? <>资产明细 <Tag color="processing" style={{ fontSize: 10 }}>预测</Tag></> : '资产明细'} size="small">
      <div className="report-detail-list">
        {buildBalanceSheetTreeData.assetNodes.map((node) => {
          const showPredicted = showPred ? node.predicted : 0
          const total = node.balance + showPredicted
          const result = formatBalance(total, node.nodeType)
          return (
            <div key={node.key} className="report-detail-list__item">
              <div className="report-detail-list__header">
                <span className="report-detail-list__title">
                  <DynamicIcon name={node.icon || (node.type === 'category' ? 'folder' : 'wallet')} size={16} /> {node.name}
                </span>
                <span style={{ color: result.color, fontWeight: 700 }}>
                  {showPred && node.predicted !== 0 ? (
                    <PredictionPopover actual={node.balance} predicted={node.predicted} useClickTrigger={useClickTrigger}>
                      {result.text}
                    </PredictionPopover>
                  ) : (
                    result.text
                  )}
                </span>
              </div>
              {node.children?.length ? (
                <div className="report-detail-list__subitems">
                  {node.children.map((child) => {
                    const childShowPredicted = showPred ? child.predicted : 0
                    const childTotal = child.balance + childShowPredicted
                    const childResult = formatBalance(childTotal, child.nodeType)
                    return (
                      <div key={child.key} className="report-detail-list__subitem">
                        <span>{child.name}</span>
                        <span>
                          {showPred && child.predicted !== 0 ? (
                            <PredictionPopover actual={child.balance} predicted={child.predicted} useClickTrigger={useClickTrigger}>
                              <span style={{ color: childResult.color }}>{childResult.text}</span>
                            </PredictionPopover>
                          ) : (
                            <span style={{ color: childResult.color }}>{childResult.text}</span>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </Card>
  )

  const liabilityDetailCard = (
    <Card className="surface-card report-section-card" title={isFuture ? <>负债明细 <Tag color="processing" style={{ fontSize: 10 }}>预测</Tag></> : '负债明细'} size="small">
      <div className="report-detail-list">
        {buildBalanceSheetTreeData.liabilityNodes.map((node) => {
          const showPredicted = showPred ? node.predicted : 0
          const total = node.balance + showPredicted
          const result = formatBalance(total, node.nodeType)
          return (
            <div key={node.key} className="report-detail-list__item">
              <div className="report-detail-list__header">
                <span className="report-detail-list__title">
                  <DynamicIcon name={node.icon || (node.type === 'category' ? 'folder' : 'wallet')} size={16} /> {node.name}
                </span>
                <span style={{ color: result.color, fontWeight: 700 }}>
                  {showPred && node.predicted !== 0 ? (
                    <PredictionPopover actual={node.balance} predicted={node.predicted} useClickTrigger={useClickTrigger}>
                      {result.text}
                    </PredictionPopover>
                  ) : (
                    result.text
                  )}
                </span>
              </div>
              {node.children?.length ? (
                <div className="report-detail-list__subitems">
                  {node.children.map((child) => {
                    const childShowPredicted = showPred ? child.predicted : 0
                    const childTotal = child.balance + childShowPredicted
                    const childResult = formatBalance(childTotal, child.nodeType)
                    return (
                      <div key={child.key} className="report-detail-list__subitem">
                        <span>{child.name}</span>
                        <span>
                          {showPred && child.predicted !== 0 ? (
                            <PredictionPopover actual={child.balance} predicted={child.predicted} useClickTrigger={useClickTrigger}>
                              <span style={{ color: childResult.color }}>{childResult.text}</span>
                            </PredictionPopover>
                          ) : (
                            <span style={{ color: childResult.color }}>{childResult.text}</span>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </Card>
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
          <Button icon={<SaveOutlined />} onClick={onOpenCalibrate}>
            校准
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
                      onDrillDown={(item) => handleDrillDown(buildBalanceSheetTreeData.assetNodes, item)}
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
                      onDrillDown={(item) => handleDrillDown(buildBalanceSheetTreeData.liabilityNodes, item)}
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

export default BalanceSheet
