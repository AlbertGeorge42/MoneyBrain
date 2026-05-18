import React, { useMemo } from 'react'
import { Button, Card, Grid, Space, Statistic, theme } from 'antd'
import { SaveOutlined, SettingOutlined } from '@ant-design/icons'
import type { BalanceSheetReportData } from '@shared/types'
import { DynamicIcon, PointTimePickerField, type PointTimePickerConfig, type PointTimeValue } from '../common'
import { PieChart, type PieChartDataItem } from '../charts'
import ReportViewSwitcher from './ReportViewSwitcher'
import { formatBalance } from '../../utils/formatBalance'

interface BalanceSheetTreeNode {
  key: string
  name: string
  balance: number
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
  const { token } = theme.useToken()

  const assetPieData = useMemo(
    () =>
      buildBalanceSheetTreeData.assetNodes
        .filter((node) => node.type === 'category')
        .map((node) => ({
          name: node.name,
          value: Math.abs(node.balance),
          categoryId: node.key,
          hasChildren: Boolean(node.children?.length),
        }))
        .filter((item) => item.value > 0),
    [buildBalanceSheetTreeData.assetNodes]
  )

  const liabilityPieData = useMemo(
    () =>
      buildBalanceSheetTreeData.liabilityNodes
        .filter((node) => node.type === 'category')
        .map((node) => ({
          name: node.name,
          value: Math.abs(node.balance),
          categoryId: node.key,
          hasChildren: Boolean(node.children?.length),
        }))
        .filter((item) => item.value > 0),
    [buildBalanceSheetTreeData.liabilityNodes]
  )

  const handleDrillDown = async (
    nodes: BalanceSheetTreeNode[],
    item: PieChartDataItem
  ): Promise<PieChartDataItem[]> => {
    if (!item.categoryId) return []

    const categoryNode = nodes.find((node) => node.key === item.categoryId && node.type === 'category')
    if (!categoryNode?.children) return []

    return categoryNode.children
      .filter((account) => account.balance !== 0)
      .map((account) => ({
        name: account.name,
        value: Math.abs(account.balance),
      }))
  }

  const summarySection = (
    <>
      <div className="report-hero-section">
        <Card className="surface-card report-section-card report-hero-card">
          <Statistic
            title="净资产"
            value={balanceSheetData?.netWorth || 0}
            precision={2}
            valueStyle={{ color: (balanceSheetData?.netWorth || 0) >= 0 ? 'var(--mb-color-positive)' : 'var(--mb-color-negative)' }}
            formatter={(value) => `¥${Number(value).toFixed(2)}`}
          />
          <div className="report-hero-card__sub">
            <Statistic
              title="资产负债率"
              value={balanceSheetData?.assets ? (Math.abs(balanceSheetData?.liabilities || 0) / balanceSheetData.assets) * 100 : 0}
              precision={1}
              valueStyle={{ color: 'var(--mb-color-neutral)' }}
              suffix="%"
            />
          </div>
        </Card>
      </div>

      <div className="report-secondary-section report-secondary-section--2">
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic
            title="总资产"
            value={balanceSheetData?.assets || 0}
            precision={2}
            valueStyle={{ color: (balanceSheetData?.assets || 0) >= 0 ? 'var(--mb-color-positive)' : 'var(--mb-color-negative)' }}
            formatter={(value) => `¥${Number(value).toFixed(2)}`}
          />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic
            title="总负债"
            value={Math.abs(balanceSheetData?.liabilities || 0)}
            precision={2}
            valueStyle={{ color: 'var(--mb-color-negative)' }}
            formatter={(value) => `¥${Number(value).toFixed(2)}`}
          />
        </Card>
      </div>
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
        />
      </Card>
      <Card className="surface-card report-section-card" size="small">
        <PieChart
          title="负债结构"
          data={liabilityPieData}
          height={isMobile ? 240 : 280}
          onDrillDown={(item) => handleDrillDown(buildBalanceSheetTreeData.liabilityNodes, item)}
        />
      </Card>
    </div>
  )

  const assetDetailCard = (
    <Card className="surface-card report-section-card" title="资产明细" size="small">
      <div className="report-detail-list">
        {buildBalanceSheetTreeData.assetNodes.map((node) => {
          const result = formatBalance(node.balance, node.nodeType)
          return (
            <div key={node.key} className="report-detail-list__item">
              <div className="report-detail-list__header">
                <span className="report-detail-list__title">
                  <DynamicIcon name={node.icon || (node.type === 'category' ? 'folder' : 'wallet')} size={16} /> {node.name}
                </span>
                <span style={{ color: result.color, fontWeight: 700 }}>{result.text}</span>
              </div>
              {node.children?.length ? (
                <div className="report-detail-list__subitems">
                  {node.children.map((child) => {
                    const childResult = formatBalance(child.balance, child.nodeType)
                    return (
                      <div key={child.key} className="report-detail-list__subitem">
                        <span>{child.name}</span>
                        <span style={{ color: childResult.color }}>{childResult.text}</span>
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
    <Card className="surface-card report-section-card" title="负债明细" size="small">
      <div className="report-detail-list">
        {buildBalanceSheetTreeData.liabilityNodes.map((node) => {
          const result = formatBalance(node.balance, node.nodeType)
          return (
            <div key={node.key} className="report-detail-list__item">
              <div className="report-detail-list__header">
                <span className="report-detail-list__title">
                  <DynamicIcon name={node.icon || (node.type === 'category' ? 'folder' : 'wallet')} size={16} /> {node.name}
                </span>
                <span style={{ color: result.color, fontWeight: 700 }}>{result.text}</span>
              </div>
              {node.children?.length ? (
                <div className="report-detail-list__subitems">
                  {node.children.map((child) => {
                    const childResult = formatBalance(child.balance, child.nodeType)
                    return (
                      <div key={child.key} className="report-detail-list__subitem">
                        <span>{child.name}</span>
                        <span style={{ color: childResult.color }}>{childResult.text}</span>
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
