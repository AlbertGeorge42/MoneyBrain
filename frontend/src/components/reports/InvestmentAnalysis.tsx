import React from 'react'
import { Button, Card, Empty, Grid, Statistic } from 'antd'
import { SettingOutlined } from '@ant-design/icons'
import DynamicIcon from '../common/DynamicIcon'
import { RangeTimePickerField, type RangeTimePickerConfig, type RangeTimeValue } from '../common'
import { LineChart, PieChart } from '../charts'
import ReportViewSwitcher from './ReportViewSwitcher'
import type { InvestmentAccountDetail, InvestmentAnalysisReportData } from '@shared/types'
import {
  colorInvesting,
  colorPositive,
  colorNegative,
  colorTextSecondary,
  colorTextMuted,
  fontWeightBold,
  fontSizeCaption,
  spaceCardPadding,
} from '../../styles/tokens'
import { formatCurrency, formatPercent } from '../../utils/format'

interface InvestmentAnalysisProps {
  timeRange: RangeTimeValue
  pickerConfig: RangeTimePickerConfig
  investmentData: InvestmentAnalysisReportData | null
  onTimeRangeChange: (value: RangeTimeValue) => void
  onOpenSettings: () => void
}

const InvestmentAnalysis: React.FC<InvestmentAnalysisProps> = ({
  timeRange,
  pickerConfig,
  investmentData,
  onTimeRangeChange,
  onOpenSettings,
}) => {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md

  if (!investmentData) {
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

        <Card className="surface-card report-section-card">
          <Empty description="暂无投资账户，请先在账户分类设置中标记投资类账户。" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      </div>
    )
  }

  const { returnAnalysis, byCategory, trend } = investmentData

  const pieData = byCategory
    .map((category) => ({
      name: category.categoryName,
      value: Math.abs(category.balance),
    }))
    .filter((item) => item.value > 0)

  const allAccounts: InvestmentAccountDetail[] = byCategory.flatMap((category) => category.accounts)

  const summarySection = (
    <>
      <div className="report-hero-section">
        <Card className="surface-card report-section-card report-hero-card">
          <Statistic
            title="期间收益"
            value={returnAnalysis.periodReturn}
            precision={2}
            valueStyle={{ color: returnAnalysis.periodReturn >= 0 ? colorPositive : colorNegative }}
            prefix="¥"
            suffix={` (${returnAnalysis.simpleReturnRate >= 0 ? '+' : ''}${returnAnalysis.simpleReturnRate.toFixed(2)}%)`}
          />
        </Card>
      </div>

      <div className="report-secondary-section report-secondary-section--2">
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="期初市值" value={returnAnalysis.startValue} precision={2} valueStyle={{ color: colorTextSecondary }} prefix="¥" />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="期末市值" value={returnAnalysis.endValue} precision={2} valueStyle={{ color: colorInvesting }} prefix="¥" />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="期间投入" value={returnAnalysis.periodInvested} precision={2} valueStyle={{ color: colorTextSecondary }} prefix="¥" />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic title="期间取出" value={returnAnalysis.periodWithdrawn} precision={2} valueStyle={{ color: colorTextSecondary }} prefix="¥" />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic
            title="XIRR (年化)"
            value={returnAnalysis.xirr !== null ? returnAnalysis.xirr : '--'}
            precision={returnAnalysis.xirr !== null ? 2 : 0}
            valueStyle={{ color: (returnAnalysis.xirr || 0) >= 0 ? colorPositive : colorNegative }}
            suffix={returnAnalysis.xirr !== null ? '%' : ''}
          />
        </Card>
        <Card className="surface-card metric-card report-section-card report-metric-card--compact">
          <Statistic
            title="TWR (年化)"
            value={returnAnalysis.annualizedTwr !== null ? returnAnalysis.annualizedTwr : '--'}
            precision={returnAnalysis.annualizedTwr !== null ? 2 : 0}
            valueStyle={{ color: (returnAnalysis.annualizedTwr || 0) >= 0 ? colorPositive : colorNegative }}
            suffix={returnAnalysis.annualizedTwr !== null ? '%' : ''}
          />
        </Card>
      </div>

      <Card className="surface-card report-section-card">
        <div className="report-summary-note" style={{ color: colorTextMuted, fontSize: fontSizeCaption }}>
          投资天数: {returnAnalysis.investmentDays} 天 | 现金流笔数: {returnAnalysis.cashFlowCount} 笔 | 账户数量: {investmentData.accountCount} 个
        </div>
      </Card>
    </>
  )

  const chartSection = (
    <div className="report-chart-grid report-chart-grid--2">
      <Card className="surface-card report-section-card" size="small">
        <PieChart title="投资分布" data={pieData} height={isMobile ? 240 : 280} />
      </Card>
      <Card className="surface-card report-section-card" size="small">
        <LineChart
          title="投资趋势"
          xAxisData={trend.map((item) => item.month)}
          seriesData={[
            {
              name: '投资总额',
              data: trend.map((item) => item.investment),
            },
          ]}
          height={isMobile ? 240 : 280}
        />
      </Card>
    </div>
  )

  const detailCards = (
    <Card title="投资账户明细" size="small" className="surface-card report-section-card">
      <div className="report-detail-list">
        {allAccounts.map((account) => (
          <div key={account.id} className="report-detail-list__item">
            <div className="report-detail-list__header">
              <span className="report-detail-list__title">
                <DynamicIcon name={account.icon} size={16} fallback="wallet" /> {account.name}
              </span>
              <span style={{ fontWeight: fontWeightBold }}>{formatCurrency(account.balance)}</span>
            </div>
            <div className="report-detail-list__meta">
              <span>{account.categoryName}</span>
              <span>{account.ratio.toFixed(1)}%</span>
            </div>
            <div className="report-detail-list__meta">
              <span>投入 {formatCurrency(account.totalInvested)}</span>
              <span>取出 {formatCurrency(account.totalWithdrawn)}</span>
            </div>
            <div className="report-detail-list__meta">
              <span>期间收益率</span>
              <span style={{ color: account.simpleReturnRate >= 0 ? colorPositive : colorNegative }}>
                {formatPercent(account.simpleReturnRate)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )

  const detailTable = detailCards

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
        <>
          <ReportViewSwitcher
            className="report-view-switcher"
            items={[
              {
                key: 'trend',
                label: '趋势',
                content: (
                  <Card className="surface-card report-section-card" size="small">
                    <LineChart
                      title="投资趋势"
                      xAxisData={trend.map((item) => item.month)}
                      seriesData={[
                        {
                          name: '投资总额',
                          data: trend.map((item) => item.investment),
                        },
                      ]}
                      height={240}
                    />
                  </Card>
                ),
              },
              {
                key: 'distribution',
                label: '分布',
                content: (
                  <Card className="surface-card report-section-card" size="small">
                    <PieChart title="投资分布" data={pieData} height={240} />
                  </Card>
                ),
              },
            ]}
          />
          {detailCards}
        </>
      ) : (
        <>
          {chartSection}
          {detailTable}
        </>
      )}
    </div>
  )
}

export default InvestmentAnalysis
