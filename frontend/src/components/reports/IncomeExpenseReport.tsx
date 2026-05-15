import React from 'react'
import { Button, Card, Grid, Statistic } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import type { IncomeExpenseReportData } from '@shared/types'
import { BarChart, PieChart, type PieChartDataItem } from '../charts'
import { RangeTimePickerField, type RangeTimePickerConfig, type RangeTimeValue } from '../common'
import ReportViewSwitcher from './ReportViewSwitcher'
import * as api from '../../services/api'
import { colorNeutral, colorNegative, colorPositive, spaceCardPadding } from '../../styles/tokens'
import { toDateRangeParams } from '../../utils/timePicker'

interface IncomeExpenseReportProps {
  timeRange: RangeTimeValue
  pickerConfig: RangeTimePickerConfig
  incomeExpenseData: IncomeExpenseReportData | null
  onTimeRangeChange: (value: RangeTimeValue) => void
  onOpenSettings: () => void
}

const formatCurrency = (value: number) => `¥${Number(value).toFixed(2)}`
const statisticFormatter = (value: string | number) => formatCurrency(Number(value || 0))

const IncomeExpenseReport: React.FC<IncomeExpenseReportProps> = ({
  timeRange,
  pickerConfig,
  incomeExpenseData,
  onTimeRangeChange,
  onOpenSettings,
}) => {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md

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

  const summarySection = (
    <>
      <div className="report-hero-section">
        <Card className="surface-card report-section-card report-hero-card">
          <Statistic
            title="结余"
            value={incomeExpenseData?.balance || 0}
            precision={2}
            valueStyle={{ color: (incomeExpenseData?.balance || 0) >= 0 ? colorPositive : colorNegative }}
            formatter={statisticFormatter}
          />
        </Card>
      </div>

      <div className="report-secondary-section report-secondary-section--2">
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="收入" value={incomeExpenseData?.income || 0} precision={2} valueStyle={{ color: colorPositive }} formatter={statisticFormatter} />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="支出" value={incomeExpenseData?.expense || 0} precision={2} valueStyle={{ color: colorNegative }} formatter={statisticFormatter} />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="期初净值" value={incomeExpenseData?.startNetWorth || 0} precision={2} formatter={statisticFormatter} />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="期末净值" value={incomeExpenseData?.endNetWorth || 0} precision={2} formatter={statisticFormatter} />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic
            title="资产变动"
            value={incomeExpenseData?.assetChange || 0}
            precision={2}
            valueStyle={{ color: (incomeExpenseData?.assetChange || 0) >= 0 ? colorPositive : colorNegative }}
            formatter={statisticFormatter}
          />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic
            title="储蓄率"
            value={incomeExpenseData?.income ? ((incomeExpenseData?.balance || 0) / incomeExpenseData.income) * 100 : 0}
            precision={1}
            valueStyle={{ color: colorNeutral }}
            suffix="%"
          />
        </Card>
      </div>
</>
  )

  const chartSection = (
    <div className="report-chart-grid report-chart-grid--3">
      <Card className="surface-card report-section-card" size="small">
        <BarChart
          title="收支对比"
          xAxisData={['收入', '支出']}
          seriesData={[{ name: '金额', data: [incomeExpenseData?.income || 0, incomeExpenseData?.expense || 0] }]}
          height={isMobile ? 220 : 250}
        />
      </Card>
      <Card className="surface-card report-section-card" size="small">
        <PieChart title="收入分类" data={incomePieData} height={isMobile ? 220 : 250} onDrillDown={(item) => handleDrillDown('income', item)} />
      </Card>
      <Card className="surface-card report-section-card" size="small">
        <PieChart title="支出分类" data={expensePieData} height={isMobile ? 220 : 250} onDrillDown={(item) => handleDrillDown('expense', item)} />
      </Card>
    </div>
  )

  const incomeDetailCard = (
    <Card className="surface-card report-section-card" title="收入明细" size="small">
      <div className="report-detail-list">
        {(incomeExpenseData?.incomeCategoryDetails || []).map((item) => (
          <div key={item.categoryId} className="report-detail-list__item">
            <div className="report-detail-list__header">
              <span className="report-detail-list__title">{item.name}</span>
              <span style={{ color: colorPositive }}>{formatCurrency(item.value)}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )

  const expenseDetailCard = (
    <Card className="surface-card report-section-card" title="支出明细" size="small">
      <div className="report-detail-list">
        {(incomeExpenseData?.expenseCategoryDetails || []).map((item) => (
          <div key={item.categoryId} className="report-detail-list__item">
            <div className="report-detail-list__header">
              <span className="report-detail-list__title">{item.name}</span>
              <span style={{ color: colorNegative }}>{formatCurrency(Math.abs(item.value))}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )

  const detailTables = (
    <div className="report-chart-grid report-chart-grid--2">
      {incomeDetailCard}
      {expenseDetailCard}
    </div>
  )

  return (
    <div className="section-grid">
      <div className="report-toolbar" style={{ marginBottom: spaceCardPadding }}>
        <div className="report-toolbar__filters">
          <RangeTimePickerField value={timeRange} config={pickerConfig} onChange={onTimeRangeChange} />
        </div>
        <div className="report-toolbar__actions">
          <Button icon={<SettingOutlined />} onClick={onOpenSettings}>
            设置
          </Button>
        </div>
      </div>

      {summarySection}

      {isMobile ? (
        <div className="report-detail-stack">
          <Card className="surface-card report-section-card" size="small">
            <BarChart
              title="收支对比"
              xAxisData={['收入', '支出']}
              seriesData={[{ name: '金额', data: [incomeExpenseData?.income || 0, incomeExpenseData?.expense || 0] }]}
              height={220}
            />
          </Card>
          <ReportViewSwitcher
            className="report-view-switcher"
            items={[
              {
                key: 'income',
                label: '收入',
                content: (
                  <div className="report-detail-stack">
                    <Card className="surface-card report-section-card" size="small">
                      <PieChart title="收入分类" data={incomePieData} height={220} onDrillDown={(item) => handleDrillDown('income', item)} />
                    </Card>
                    {incomeDetailCard}
                  </div>
                ),
              },
              {
                key: 'expense',
                label: '支出',
                content: (
                  <div className="report-detail-stack">
                    <Card className="surface-card report-section-card" size="small">
                      <PieChart title="支出分类" data={expensePieData} height={220} onDrillDown={(item) => handleDrillDown('expense', item)} />
                    </Card>
                    {expenseDetailCard}
                  </div>
                ),
              },
            ]}
          />
        </div>
      ) : (
        <>
          {chartSection}
          {detailTables}
        </>
      )}      
    </div>
  )
}

export default IncomeExpenseReport
