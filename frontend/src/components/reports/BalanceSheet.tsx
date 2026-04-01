import React from 'react'
import { Card, DatePicker, Button, Table, Row, Col, Statistic, Space } from 'antd'
import { SettingOutlined, SaveOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import DynamicIcon from '../common/DynamicIcon'
import { PieChart } from '../charts'
import { formatBalance } from '../../utils/formatBalance'
import type { BalanceSheetReportData } from '@shared/types'

const { MonthPicker } = DatePicker

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
  selectedMonth: dayjs.Dayjs
  balanceSheetData: BalanceSheetReportData | null
  buildBalanceSheetTreeData: BalanceSheetTreeData
  onMonthChange: (date: dayjs.Dayjs) => void
  onOpenSettings: () => void
  onOpenCalibrate: () => void
}

const BalanceSheet: React.FC<BalanceSheetProps> = ({
  selectedMonth,
  balanceSheetData,
  buildBalanceSheetTreeData,
  onMonthChange,
  onOpenSettings,
  onOpenCalibrate,
}) => {
  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <MonthPicker 
            value={selectedMonth} 
            onChange={(date) => date && onMonthChange(date)}
            allowClear={false}
          />
          <span style={{ color: '#666' }}>
            显示 {selectedMonth.format('YYYY年MM月')} 月初（1日）资产负债状况
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
              data={buildBalanceSheetTreeData.assetNodes
                .filter((n) => n.type === 'category')
                .map((n) => ({ name: n.name, value: Math.abs(n.balance) }))
                .filter((d) => d.value > 0)
              }
              height={280}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small">
            <PieChart 
              title="负债结构" 
              data={buildBalanceSheetTreeData.liabilityNodes
                .filter((n) => n.type === 'category')
                .map((n) => ({ name: n.name, value: Math.abs(n.balance) }))
                .filter((d) => d.value > 0)
              }
              height={280}
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
