import React from 'react'
import { Card, Button, Table, Row, Col, Statistic, Divider } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import { RangeTimePickerField, type RangeTimePickerConfig, type RangeTimeValue } from '../common'
import { PieChart, BarChart } from '../charts'
import { PieChartDataItem } from '../charts/PieChart'
import * as api from '../../services/api'
import { toDateRangeParams } from '../../utils/timePicker'
import type { IncomeExpenseReportData } from '@shared/types'
import {
  colorPositive,
  colorNegative,
  spaceMd,
} from '../../styles/tokens'

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

  const handleDrillDownIncome = async (item: PieChartDataItem): Promise<PieChartDataItem[]> => {
    if (!item.categoryId) return []
    try {
      const res = await api.analyticsApi.getCategoryBreakdown(
        'income', 
        dateParams.startDate,
        dateParams.endDate,
        item.categoryId
      )
      if (res.data.success && res.data.data) {
        return res.data.data
      }
    } catch (error) {
      console.error('获取二级分类数据失败:', error)
    }
    return []
  }

  const handleDrillDownExpense = async (item: PieChartDataItem): Promise<PieChartDataItem[]> => {
    if (!item.categoryId) return []
    try {
      const res = await api.analyticsApi.getCategoryBreakdown(
        'expense', 
        dateParams.startDate,
        dateParams.endDate,
        item.categoryId
      )
      if (res.data.success && res.data.data) {
        return res.data.data
      }
    } catch (error) {
      console.error('获取二级分类数据失败:', error)
    }
    return []
  }

  const incomePieData: PieChartDataItem[] = (incomeExpenseData?.incomeCategoryDetails || []).map(d => ({
    name: d.name,
    value: d.value,
    categoryId: d.categoryId,
    hasChildren: d.hasChildren
  }))

  const expensePieData: PieChartDataItem[] = (incomeExpenseData?.expenseCategoryDetails || []).map(d => ({
    name: d.name,
    value: Math.abs(d.value),
    categoryId: d.categoryId,
    hasChildren: d.hasChildren
  }))

  return (
    <div>
      <div style={{ marginBottom: spaceMd, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <RangeTimePickerField value={timeRange} config={pickerConfig} onChange={onTimeRangeChange} />
        <Button icon={<SettingOutlined />} onClick={onOpenSettings}>
          设置
        </Button>
      </div>

      <Card style={{ marginBottom: spaceMd }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="期初资产"
              value={incomeExpenseData?.startAssets || 0}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.startAssets || 0) >= 0 ? colorPositive : colorNegative }}
              prefix="¥"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="期初负债"
              value={(incomeExpenseData?.startLiabilities || 0) <= 0 ? Math.abs(incomeExpenseData?.startLiabilities || 0) : -(incomeExpenseData?.startLiabilities || 0)}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.startLiabilities || 0) <= 0 ? colorNegative : colorPositive }}
              prefix="¥"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="期初净资产"
              value={incomeExpenseData?.startNetWorth || 0}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.startNetWorth || 0) >= 0 ? colorPositive : colorNegative }}
              prefix="¥"
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="资产变动"
              value={incomeExpenseData?.assetChange || 0}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.assetChange || 0) >= 0 ? colorPositive : colorNegative }}
              prefix="¥"
            />
          </Col>
        </Row>
      </Card>

      <Divider style={{ margin: '12px 0' }} />

      <Card style={{ marginBottom: spaceMd }}>
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="总收入"
              value={incomeExpenseData?.income || 0}
              precision={2}
              valueStyle={{ color: colorPositive }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="总支出"
              value={incomeExpenseData?.expense || 0}
              precision={2}
              valueStyle={{ color: colorNegative }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="结余"
              value={incomeExpenseData?.balance || 0}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.balance || 0) >= 0 ? colorPositive : colorNegative }}
              prefix="¥"
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={16} style={{ marginBottom: spaceMd }}>
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
              data={incomePieData}
              height={250}
              onDrillDown={handleDrillDownIncome}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <PieChart 
              title="支出分类" 
              data={expensePieData}
              height={250}
              onDrillDown={handleDrillDownExpense}
            />
          </Card>
        </Col>
      </Row>

      <Divider style={{ margin: '12px 0' }} />

      <Card style={{ marginBottom: spaceMd }}>
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="期末资产"
              value={incomeExpenseData?.endAssets || 0}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.endAssets || 0) >= 0 ? colorPositive : colorNegative }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="期末负债"
              value={(incomeExpenseData?.endLiabilities || 0) <= 0 ? Math.abs(incomeExpenseData?.endLiabilities || 0) : -(incomeExpenseData?.endLiabilities || 0)}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.endLiabilities || 0) <= 0 ? colorNegative : colorPositive }}
              prefix="¥"
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="期末净资产"
              value={incomeExpenseData?.endNetWorth || 0}
              precision={2}
              valueStyle={{ color: (incomeExpenseData?.endNetWorth || 0) >= 0 ? colorPositive : colorNegative }}
              prefix="¥"
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="收入明细" size="small">
            <Table
              dataSource={incomeExpenseData?.incomeCategoryDetails || []}
              columns={[
                { title: '分类', dataIndex: 'name', key: 'name' },
                { title: '金额', dataIndex: 'value', key: 'value', render: (v: number) => `¥${v.toFixed(2)}` },
              ]}
              rowKey="categoryId"
              size="small"
              pagination={false}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="支出明细" size="small">
            <Table
              dataSource={incomeExpenseData?.expenseCategoryDetails || []}
              columns={[
                { title: '分类', dataIndex: 'name', key: 'name' },
                { title: '金额', dataIndex: 'value', key: 'value', render: (v: number) => `¥${v.toFixed(2)}` },
              ]}
              rowKey="categoryId"
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
