import React from 'react'
import { Button, Card, Col, Row, Statistic, Table } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import type { IncomeExpenseReportData } from '@shared/types'
import { BarChart, PieChart, type PieChartDataItem } from '../charts'
import { RangeTimePickerField, type RangeTimePickerConfig, type RangeTimeValue } from '../common'
import * as api from '../../services/api'
import { colorNegative, colorPositive, spaceMd } from '../../styles/tokens'
import { toDateRangeParams } from '../../utils/timePicker'

interface IncomeExpenseReportProps {
  timeRange: RangeTimeValue
  pickerConfig: RangeTimePickerConfig
  incomeExpenseData: IncomeExpenseReportData | null
  onTimeRangeChange: (value: RangeTimeValue) => void
  onOpenSettings: () => void
}

const IncomeExpenseReport: React.FC<IncomeExpenseReportProps> = ({
  timeRange,
  pickerConfig,
  incomeExpenseData,
  onTimeRangeChange,
  onOpenSettings,
}) => {
  const dateParams = toDateRangeParams(timeRange)

  const handleDrillDown = async (type: 'income' | 'expense', item: PieChartDataItem): Promise<PieChartDataItem[]> => {
    if (!item.categoryId) return []

    try {
      const response = await api.analyticsApi.getCategoryBreakdown(
        type,
        dateParams.startDate,
        dateParams.endDate,
        item.categoryId
      )

      if (response.data.success && response.data.data) {
        return response.data.data
      }
    } catch (error) {
      console.error('Failed to fetch category drilldown:', error)
    }

    return []
  }

  const incomePieData: PieChartDataItem[] = (incomeExpenseData?.incomeCategoryDetails || []).map((item) => ({
    name: item.name,
    value: item.value,
    categoryId: item.categoryId,
    hasChildren: item.hasChildren,
  }))

  const expensePieData: PieChartDataItem[] = (incomeExpenseData?.expenseCategoryDetails || []).map((item) => ({
    name: item.name,
    value: Math.abs(item.value),
    categoryId: item.categoryId,
    hasChildren: item.hasChildren,
  }))

  return (
    <div className="section-grid">
      <div style={{ marginBottom: spaceMd, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <RangeTimePickerField value={timeRange} config={pickerConfig} onChange={onTimeRangeChange} />
        <Button icon={<SettingOutlined />} onClick={onOpenSettings}>
          设置
        </Button>
      </div>

      <Card className="surface-card">
        <Row gutter={16}>
          <Col span={6}>
            <Statistic title="期初资产" value={incomeExpenseData?.startAssets || 0} precision={2} formatter={(value) => `¥${Number(value).toFixed(2)}`} />
          </Col>
          <Col span={6}>
            <Statistic title="期初负债" value={Math.abs(incomeExpenseData?.startLiabilities || 0)} precision={2} formatter={(value) => `¥${Number(value).toFixed(2)}`} />
          </Col>
          <Col span={6}>
            <Statistic title="期初净值" value={incomeExpenseData?.startNetWorth || 0} precision={2} formatter={(value) => `¥${Number(value).toFixed(2)}`} />
          </Col>
          <Col span={6}>
            <Statistic
              title="资产变动"
              value={incomeExpenseData?.assetChange || 0}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.assetChange || 0) >= 0 ? colorPositive : colorNegative }}
              formatter={(value) => `¥${Number(value).toFixed(2)}`}
            />
          </Col>
        </Row>
      </Card>

      <Card className="surface-card">
        <Row gutter={16}>
          <Col span={8}>
            <Statistic title="收入" value={incomeExpenseData?.income || 0} precision={2} valueStyle={{ color: colorPositive }} formatter={(value) => `¥${Number(value).toFixed(2)}`} />
          </Col>
          <Col span={8}>
            <Statistic title="支出" value={incomeExpenseData?.expense || 0} precision={2} valueStyle={{ color: colorNegative }} formatter={(value) => `¥${Number(value).toFixed(2)}`} />
          </Col>
          <Col span={8}>
            <Statistic
              title="结余"
              value={incomeExpenseData?.balance || 0}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.balance || 0) >= 0 ? colorPositive : colorNegative }}
              formatter={(value) => `¥${Number(value).toFixed(2)}`}
            />
          </Col>
        </Row>
      </Card>

      <div className="section-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <Card className="surface-card" size="small">
          <BarChart
            title="收支对比"
            xAxisData={['收入', '支出']}
            seriesData={[{ name: '金额', data: [incomeExpenseData?.income || 0, incomeExpenseData?.expense || 0] }]}
            height={250}
          />
        </Card>
        <Card className="surface-card" size="small">
          <PieChart title="收入分类" data={incomePieData} height={250} onDrillDown={(item) => handleDrillDown('income', item)} />
        </Card>
        <Card className="surface-card" size="small">
          <PieChart title="支出分类" data={expensePieData} height={250} onDrillDown={(item) => handleDrillDown('expense', item)} />
        </Card>
      </div>

      <Card className="surface-card">
        <Row gutter={16}>
          <Col span={8}>
            <Statistic title="期末资产" value={incomeExpenseData?.endAssets || 0} precision={2} formatter={(value) => `¥${Number(value).toFixed(2)}`} />
          </Col>
          <Col span={8}>
            <Statistic title="期末负债" value={Math.abs(incomeExpenseData?.endLiabilities || 0)} precision={2} formatter={(value) => `¥${Number(value).toFixed(2)}`} />
          </Col>
          <Col span={8}>
            <Statistic title="期末净值" value={incomeExpenseData?.endNetWorth || 0} precision={2} formatter={(value) => `¥${Number(value).toFixed(2)}`} />
          </Col>
        </Row>
      </Card>

      <div className="split-grid">
        <Card className="surface-card" title="收入明细" size="small">
          <Table
            dataSource={incomeExpenseData?.incomeCategoryDetails || []}
            columns={[
              { title: '分类', dataIndex: 'name', key: 'name' },
              { title: '金额', dataIndex: 'value', key: 'value', render: (value: number) => `¥${value.toFixed(2)}` },
            ]}
            rowKey="categoryId"
            size="small"
            pagination={false}
          />
        </Card>
        <Card className="surface-card" title="支出明细" size="small">
          <Table
            dataSource={incomeExpenseData?.expenseCategoryDetails || []}
            columns={[
              { title: '分类', dataIndex: 'name', key: 'name' },
              { title: '金额', dataIndex: 'value', key: 'value', render: (value: number) => `¥${Math.abs(value).toFixed(2)}` },
            ]}
            rowKey="categoryId"
            size="small"
            pagination={false}
          />
        </Card>
      </div>
    </div>
  )
}

export default IncomeExpenseReport
