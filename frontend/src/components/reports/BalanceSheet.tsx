import React, { useMemo } from 'react'
import { Button, Card, Col, Row, Space, Statistic, Table } from 'antd'
import { SaveOutlined, SettingOutlined } from '@ant-design/icons'
import type { BalanceSheetReportData } from '@shared/types'
import { DynamicIcon, PointTimePickerField, type PointTimePickerConfig, type PointTimeValue } from '../common'
import { PieChart, type PieChartDataItem } from '../charts'
import { formatBalance } from '../../utils/formatBalance'
import { colorNegative, colorPositive, fontWeightBold, spaceMd } from '../../styles/tokens'

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

  const assetColumns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: BalanceSheetTreeNode) => (
        <span>
          <DynamicIcon name={record.icon || (record.type === 'category' ? 'folder' : 'wallet')} size={16} /> {text}
        </span>
      ),
    },
    {
      title: '金额',
      dataIndex: 'balance',
      key: 'balance',
      width: 140,
      align: 'right' as const,
      render: (value: number, record: BalanceSheetTreeNode) => {
        const result = formatBalance(value, record.nodeType)
        return <span style={{ color: result.color, fontWeight: fontWeightBold }}>{result.text}</span>
      },
    },
  ]

  return (
    <div className="section-grid">
      <div style={{ marginBottom: spaceMd, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <PointTimePickerField value={selectedTime} config={pickerConfig} onChange={onTimeChange} />
        <Space>
          <Button icon={<SettingOutlined />} onClick={onOpenSettings}>
            设置
          </Button>
          <Button icon={<SaveOutlined />} onClick={onOpenCalibrate}>
            校准
          </Button>
        </Space>
      </div>

      <Card className="surface-card">
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="总资产"
              value={balanceSheetData?.assets || 0}
              precision={2}
              valueStyle={{ color: (balanceSheetData?.assets || 0) >= 0 ? colorPositive : colorNegative }}
              formatter={(value) => `¥${Number(value).toFixed(2)}`}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="总负债"
              value={Math.abs(balanceSheetData?.liabilities || 0)}
              precision={2}
              valueStyle={{ color: colorNegative }}
              formatter={(value) => `¥${Number(value).toFixed(2)}`}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="净资产"
              value={balanceSheetData?.netWorth || 0}
              precision={2}
              valueStyle={{ color: (balanceSheetData?.netWorth || 0) >= 0 ? colorPositive : colorNegative }}
              formatter={(value) => `¥${Number(value).toFixed(2)}`}
            />
          </Col>
        </Row>
      </Card>

      <div className="split-grid">
        <Card className="surface-card" size="small">
          <PieChart
            title="资产结构"
            data={assetPieData}
            height={280}
            onDrillDown={(item) => handleDrillDown(buildBalanceSheetTreeData.assetNodes, item)}
          />
        </Card>
        <Card className="surface-card" size="small">
          <PieChart
            title="负债结构"
            data={liabilityPieData}
            height={280}
            onDrillDown={(item) => handleDrillDown(buildBalanceSheetTreeData.liabilityNodes, item)}
          />
        </Card>
      </div>

      <div className="split-grid">
        <Card className="surface-card" title="资产明细" size="small">
          <Table
            dataSource={buildBalanceSheetTreeData.assetNodes}
            columns={assetColumns}
            rowKey="key"
            size="small"
            pagination={false}
            defaultExpandAllRows
            indentSize={16}
          />
        </Card>
        <Card className="surface-card" title="负债明细" size="small">
          <Table
            dataSource={buildBalanceSheetTreeData.liabilityNodes}
            columns={assetColumns}
            rowKey="key"
            size="small"
            pagination={false}
            defaultExpandAllRows
            indentSize={16}
          />
        </Card>
      </div>
    </div>
  )
}

export default BalanceSheet
