import React from 'react'
import { Card, DatePicker, Button, Table, Row, Col, Statistic, Divider } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { PieChart, BarChart } from '../charts'

const { RangePicker } = DatePicker

interface IncomeExpenseData {
  startAssets?: number
  startLiabilities?: number
  startNetWorth?: number
  assetChange?: number
  income?: number
  expense?: number
  balance?: number
  incomeByCategory?: Record<string, number>
  expenseByCategory?: Record<string, number>
  endAssets?: number
  endLiabilities?: number
  endNetWorth?: number
}

interface IncomeExpenseReportProps {
  dateRange: [dayjs.Dayjs, dayjs.Dayjs]
  incomeExpenseData: IncomeExpenseData | null
  onDateRangeChange: (dates: [dayjs.Dayjs, dayjs.Dayjs]) => void
  onOpenSettings: () => void
}

const IncomeExpenseReport: React.FC<IncomeExpenseReportProps> = ({
  dateRange,
  incomeExpenseData,
  onDateRangeChange,
  onOpenSettings,
}) => {
  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <RangePicker
          value={dateRange}
          onChange={(dates) => dates && onDateRangeChange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
        />
        <Button icon={<SettingOutlined />} onClick={onOpenSettings}>
          设置
        </Button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="期初资产"
              value={incomeExpenseData?.startAssets || 0}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.startAssets || 0) >= 0 ? '#3f8600' : '#cf1322', fontSize: 16 }}
              prefix="¥"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="期初负债"
              value={(incomeExpenseData?.startLiabilities || 0) <= 0 ? Math.abs(incomeExpenseData?.startLiabilities || 0) : -(incomeExpenseData?.startLiabilities || 0)}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.startLiabilities || 0) <= 0 ? '#cf1322' : '#3f8600', fontSize: 16 }}
              prefix="¥"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="期初净资产"
              value={incomeExpenseData?.startNetWorth || 0}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.startNetWorth || 0) >= 0 ? '#3f8600' : '#cf1322', fontSize: 16 }}
              prefix="¥"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="资产变动"
              value={incomeExpenseData?.assetChange || 0}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.assetChange || 0) >= 0 ? '#3f8600' : '#cf1322', fontSize: 16 }}
              prefix="¥"
            />
          </Col>
        </Row>
      </Card>

      <Divider style={{ margin: '12px 0' }} />

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="总收入"
              value={incomeExpenseData?.income || 0}
              precision={2}
              valueStyle={{ color: '#3f8600' }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="总支出"
              value={incomeExpenseData?.expense || 0}
              precision={2}
              valueStyle={{ color: '#cf1322' }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="结余"
              value={incomeExpenseData?.balance || 0}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.balance || 0) >= 0 ? '#3f8600' : '#cf1322' }}
              prefix="¥"
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <BarChart 
              title="收支对比" 
              xAxisData={['收入', '支出']}
              seriesData={[
                { name: '金额', data: [incomeExpenseData?.income || 0, incomeExpenseData?.expense || 0] }
              ]}
              height={250}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <PieChart 
              title="收入分类" 
              data={Object.entries(incomeExpenseData?.incomeByCategory || {})
                .map(([name, value]) => ({ name, value: value as number }))
                .filter(d => d.value > 0)
              }
              height={250}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <PieChart 
              title="支出分类" 
              data={Object.entries(incomeExpenseData?.expenseByCategory || {})
                .map(([name, value]) => ({ name, value: Math.abs(value as number) }))
                .filter(d => d.value > 0)
              }
              height={250}
            />
          </Card>
        </Col>
      </Row>

      <Divider style={{ margin: '12px 0' }} />

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="期末资产"
              value={incomeExpenseData?.endAssets || 0}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.endAssets || 0) >= 0 ? '#3f8600' : '#cf1322', fontSize: 16 }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="期末负债"
              value={(incomeExpenseData?.endLiabilities || 0) <= 0 ? Math.abs(incomeExpenseData?.endLiabilities || 0) : -(incomeExpenseData?.endLiabilities || 0)}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.endLiabilities || 0) <= 0 ? '#cf1322' : '#3f8600', fontSize: 16 }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="期末净资产"
              value={incomeExpenseData?.endNetWorth || 0}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.endNetWorth || 0) >= 0 ? '#3f8600' : '#cf1322', fontSize: 16 }}
              prefix="¥"
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="收入明细" size="small">
            <Table
              dataSource={Object.entries(incomeExpenseData?.incomeByCategory || {}).map(([name, value]) => ({
                name,
                value,
              }))}
              columns={[
                { title: '分类', dataIndex: 'name', key: 'name' },
                { title: '金额', dataIndex: 'value', key: 'value', render: (v: number) => `¥${v.toFixed(2)}` },
              ]}
              rowKey="name"
              size="small"
              pagination={false}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="支出明细" size="small">
            <Table
              dataSource={Object.entries(incomeExpenseData?.expenseByCategory || {}).map(([name, value]) => ({
                name,
                value,
              }))}
              columns={[
                { title: '分类', dataIndex: 'name', key: 'name' },
                { title: '金额', dataIndex: 'value', key: 'value', render: (v: number) => `¥${v.toFixed(2)}` },
              ]}
              rowKey="name"
              size="small"
              pagination={false}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default IncomeExpenseReport
