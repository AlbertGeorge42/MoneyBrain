import React, { useMemo } from 'react'
import { Card, Button, Table, Row, Col, Statistic, Space } from 'antd'
import { SettingOutlined, SaveOutlined } from '@ant-design/icons'
import DynamicIcon from '../common/DynamicIcon'
import { PointTimePickerField, type PointTimePickerConfig, type PointTimeValue } from '../common'
import { PieChart, PieChartDataItem } from '../charts'
import { formatBalance } from '../../utils/formatBalance'
import type { BalanceSheetReportData } from '@shared/types'

const getBalanceSheetDescription = (time: PointTimeValue): string => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const selectedDate = time.value.toDate()
  
  if (time.granularity === 'day') {
    const isTodayOrFuture = selectedDate >= today
    if (isTodayOrFuture) {
      return `至今的资产负债状况`
    }
    return `${time.value.format('YYYY年MM月DD日')} 的资产负债状况`
  }
  if (time.granularity === 'month') {
    const selectedMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const isCurrentOrFuture = selectedMonth >= currentMonth
    if (isCurrentOrFuture) {
      return `至今的资产负债状况`
    }
    return `${time.value.format('YYYY年MM月')} 月末的资产负债状况`
  }
  // year
  const selectedYear = selectedDate.getFullYear()
  const currentYear = now.getFullYear()
  const isCurrentOrFuture = selectedYear >= currentYear
  if (isCurrentOrFuture) {
    return `至今的资产负债状况`
  }
  return `${time.value.format('YYYY年')} 年末的资产负债状况`
}

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
  const assetPieData = useMemo(() => 
    buildBalanceSheetTreeData.assetNodes
      .filter((n) => n.type === 'category')
      .map((n) => ({ 
        name: n.name, 
        value: Math.abs(n.balance),
        categoryId: n.key,
        hasChildren: !!(n.children && n.children.length > 0)
      }))
      .filter((d) => d.value > 0),
    [buildBalanceSheetTreeData.assetNodes]
  )

  const liabilityPieData = useMemo(() =>
    buildBalanceSheetTreeData.liabilityNodes
      .filter((n) => n.type === 'category')
      .map((n) => ({ 
        name: n.name, 
        value: Math.abs(n.balance),
        categoryId: n.key,
        hasChildren: !!(n.children && n.children.length > 0)
      }))
      .filter((d) => d.value > 0),
    [buildBalanceSheetTreeData.liabilityNodes]
  )

  const handleDrillDownAsset = async (item: PieChartDataItem): Promise<PieChartDataItem[]> => {
    if (!item.categoryId) return []
    const categoryNode = buildBalanceSheetTreeData.assetNodes.find(
      n => n.key === item.categoryId && n.type === 'category'
    )
    if (!categoryNode || !categoryNode.children) return []
    return categoryNode.children
      .filter(acc => acc.balance !== 0)
      .map(acc => ({
        name: acc.name,
        value: Math.abs(acc.balance),
      }))
  }

  const handleDrillDownLiability = async (item: PieChartDataItem): Promise<PieChartDataItem[]> => {
    if (!item.categoryId) return []
    const categoryNode = buildBalanceSheetTreeData.liabilityNodes.find(
      n => n.key === item.categoryId && n.type === 'category'
    )
    if (!categoryNode || !categoryNode.children) return []
    return categoryNode.children
      .filter(acc => acc.balance !== 0)
      .map(acc => ({
        name: acc.name,
        value: Math.abs(acc.balance),
      }))
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <PointTimePickerField value={selectedTime} config={pickerConfig} onChange={onTimeChange} />
          <span style={{ color: '#666' }}>
            显示 {getBalanceSheetDescription(selectedTime)}
          </span>
        </Space>
        <Space>
          <Button icon={<SettingOutlined />} onClick={onOpenSettings}>
            设置
          </Button>
          <Button icon={<SaveOutlined />} onClick={onOpenCalibrate}>
            校准
          </Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="总资产"
              value={balanceSheetData?.assets || 0}
              precision={2}
              valueStyle={{ color: (balanceSheetData?.assets || 0) >= 0 ? '#3f8600' : '#cf1322' }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="总负债"
              value={(balanceSheetData?.liabilities || 0) <= 0 ? Math.abs(balanceSheetData?.liabilities || 0) : -(balanceSheetData?.liabilities || 0)}
              precision={2}
              valueStyle={{ color: (balanceSheetData?.liabilities || 0) <= 0 ? '#cf1322' : '#3f8600' }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="净资产"
              value={balanceSheetData?.netWorth || 0}
              precision={2}
              valueStyle={{ color: (balanceSheetData?.netWorth || 0) >= 0 ? '#3f8600' : '#cf1322' }}
              prefix="¥"
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small">
            <PieChart 
              title="资产结构" 
              data={assetPieData}
              height={280}
              onDrillDown={handleDrillDownAsset}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small">
            <PieChart 
              title="负债结构" 
              data={liabilityPieData}
              height={280}
              onDrillDown={handleDrillDownLiability}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="资产明细" size="small">
            <Table
              dataSource={buildBalanceSheetTreeData.assetNodes}
              columns={[
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
                  width: 120,
                  align: 'right',
                  render: (v: number, record: BalanceSheetTreeNode) => {
                    const result = formatBalance(v, record.nodeType || 'asset')
                    return (
                      <span style={{ color: result.color, fontWeight: 'bold' }}>
                        {result.text}
                      </span>
                    )
                  },
                },
              ]}
              rowKey="key"
              size="small"
              pagination={false}
              defaultExpandAllRows
              indentSize={16}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="负债明细" size="small">
            <Table
              dataSource={buildBalanceSheetTreeData.liabilityNodes}
              columns={[
                {
                  title: '名称',
                  dataIndex: 'name',
                  key: 'name',
                  render: (text: string, record: BalanceSheetTreeNode) => (
                    <span>
                      <DynamicIcon name={record.icon || (record.type === 'category' ? 'folder' : 'credit-card')} size={16} /> {text}
                    </span>
                  ),
                },
                {
                  title: '金额',
                  dataIndex: 'balance',
                  key: 'balance',
                  width: 120,
                  align: 'right',
                  render: (v: number, record: BalanceSheetTreeNode) => {
                    const result = formatBalance(v, record.nodeType || 'liability')
                    return (
                      <span style={{ color: result.color, fontWeight: 'bold' }}>
                        {result.text}
                      </span>
                    )
                  },
                },
              ]}
              rowKey="key"
              size="small"
              pagination={false}
              defaultExpandAllRows
              indentSize={16}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default BalanceSheet
