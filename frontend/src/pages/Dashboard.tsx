import React, { useMemo } from 'react'
import { Card, Empty, Skeleton, Progress, theme } from 'antd'
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
  AccountBookOutlined,
  CreditCardOutlined,
  TransactionOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/common'
import PieChart, { PieChartDataItem } from '../components/charts/PieChart'
import LineChart from '../components/charts/LineChart'
import { TransactionItemRow } from '../components/transactions'
import {
  useDashboardSummary,
  useBalanceSheet,
  useTrends,
  useCategoryBreakdown,
  useAssetTrend,
  useBudgets,
  useBudgetStatuses,
} from '../queries'
import type { AnalyticsCategoryBreakdownItem } from '../services/api'
import { analyticsApi } from '../services/api'
import { formatCurrency, formatPercent } from '../utils/format'
import { formatAmount, getAmountColor } from '../utils/formatAmount'
import { useAmountColors } from '../constants/transactionType'
import { useTheme } from '../styles/ThemeContext'

// ===== 预算进度条色相：支出=红 =====
const getBudgetProgressColor = (percentage: number, isOverBudget: boolean): string => {
  if (isOverBudget) return 'hsla(0, 85%, 45%, 1)'
  const sat = 55 + percentage * 0.3
  const light = 72 - percentage * 0.27
  return `hsla(0, ${Math.round(sat)}%, ${Math.round(light)}%, 1)`
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const { isDark } = useTheme()
  const amountColors = useAmountColors()
  const colorActionPrimary = token.colorPrimary

  // -- 时间锚点 --
  const today = useMemo(() => new Date().toISOString().split('T')[0], [])

  // -- 数据 hooks --
  const { data: dashboardSummary, isLoading: dashboardLoading } = useDashboardSummary()
  const { data: balanceSheetData } = useBalanceSheet(today)

  const { data: expenseTrend = [], isLoading: expenseTrendLoading } = useTrends('expense')
  const { data: categoryData = [], isLoading: categoryLoading } = useCategoryBreakdown('expense')
  const { data: assetTrend = [] } = useAssetTrend()

  const { data: budgets = [] } = useBudgets()
  const activeExpenseBudgetIds = useMemo(
    () => budgets.filter((b) => b.type === 'expense' && b.isActive).map((b) => b.id),
    [budgets],
  )
  const { data: budgetStatuses = [] } = useBudgetStatuses(activeExpenseBudgetIds)

  const chartLoading = dashboardLoading || expenseTrendLoading || categoryLoading

  // -- 计算数据（直接从聚合 API 取，不再全量拉交易列表） --
  const balanceData = useMemo(() => {
    if (!balanceSheetData) return { totalAssets: 0, totalLiabilities: 0, netWorth: 0 }
    return {
      totalAssets: balanceSheetData.assets.actual,
      totalLiabilities: balanceSheetData.liabilities.actual,
      netWorth: balanceSheetData.netWorth.actual,
    }
  }, [balanceSheetData])

  const thisMonthIncome = dashboardSummary?.thisMonth.income ?? 0
  const thisMonthExpense = dashboardSummary?.thisMonth.expense ?? 0
  const thisMonthBalance = dashboardSummary?.thisMonth.balance ?? 0
  const lastMonthIncome = dashboardSummary?.lastMonth.income ?? 0
  const lastMonthExpense = dashboardSummary?.lastMonth.expense ?? 0
  const recentTransactions = dashboardSummary?.recentTransactions ?? []

  // 净资产变化（从 assetTrend 取最后两个数据点）
  const netWorthChange = useMemo(() => {
    if (assetTrend.length < 2) return null
    const current = assetTrend[assetTrend.length - 1].netWorth
    const previous = assetTrend[assetTrend.length - 2].netWorth
    const diff = current - previous
    const rate = previous !== 0 ? (diff / Math.abs(previous)) * 100 : 0
    return { diff, rate }
  }, [assetTrend])

  // 上月收支（从聚合 API 取，已在上面赋值 lastMonthIncome / lastMonthExpense）

  // 预算进度摘要（按使用率降序，取前 3）
  const topBudgets = useMemo(() => {
    return [...budgetStatuses]
      .filter((s) => s.percentage > 0)
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 3)
  }, [budgetStatuses])

  // 饼图下钻
  const handleDrillDown = async (item: PieChartDataItem): Promise<AnalyticsCategoryBreakdownItem[]> => {
    if (!item.categoryId) return []
    try {
      const res = await analyticsApi.getCategoryBreakdown('expense', undefined, undefined, item.categoryId)
      if (res.data.success && res.data.data) {
        return res.data.data
      }
    } catch (error) {
      console.error('获取二级分类数据失败:', error)
    }
    return []
  }

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="财务总览"
        description="净资产、本月收支和近期变动一览。"
      />

      {/* ===== 净资产 Hero ===== */}
      <Card className="surface-card dashboard-hero">
        <div className="dashboard-hero__body">
          <div className="dashboard-hero__label">净资产</div>
          <div className="dashboard-hero__value" style={{ color: getAmountColor(balanceData.netWorth, 'flow', isDark) }}>
            {formatAmount(balanceData.netWorth, 'flow').text}
          </div>
          {netWorthChange && (
            <div className={`dashboard-hero__change ${netWorthChange.diff >= 0 ? 'dashboard-hero__change--up' : netWorthChange.diff < 0 ? 'dashboard-hero__change--down' : 'dashboard-hero__change--flat'}`}>
              {netWorthChange.diff >= 0 ? <ArrowUpOutlined /> : netWorthChange.diff < 0 ? <ArrowDownOutlined /> : <MinusOutlined />}
              <span>{formatCurrency(netWorthChange.diff, { showSign: true })}</span>
              <span>{formatPercent(netWorthChange.rate)}</span>
            </div>
          )}
        </div>
      </Card>

      {/* ===== KPI 指标行（3 卡） ===== */}
      <div className="kpi-grid dashboard-kpi-grid">
        <Card className="surface-card metric-card">
          <div className="metric-card__header">
            <AccountBookOutlined style={{ fontSize: 20, color: colorActionPrimary }} />
            <span className="metric-card__label">总资产</span>
          </div>
          <div className="metric-card__value" style={{ color: getAmountColor(balanceData.totalAssets, 'asset', isDark) }}>
            {formatAmount(balanceData.totalAssets, 'asset').text}
          </div>
        </Card>

        <Card className="surface-card metric-card">
          <div className="metric-card__header">
            <CreditCardOutlined style={{ fontSize: 20, color: amountColors.negative }} />
            <span className="metric-card__label">总负债</span>
          </div>
          <div className="metric-card__value" style={{ color: getAmountColor(balanceData.totalLiabilities, 'liability', isDark) }}>
            {formatAmount(balanceData.totalLiabilities, 'liability').text}
          </div>
        </Card>

        <Card className="surface-card metric-card">
          <div className="metric-card__header">
            <TransactionOutlined style={{ fontSize: 20, color: getAmountColor(thisMonthBalance, 'flow', isDark) }} />
            <span className="metric-card__label">本月结余</span>
          </div>
          <div className="metric-card__value" style={{ color: getAmountColor(thisMonthBalance, 'flow', isDark) }}>
            {formatAmount(thisMonthBalance, 'flow').text}
          </div>
        </Card>
      </div>

      {/* ===== 本月收支快览 ===== */}
      <Card className="surface-card">
        <div className="dashboard-income-expense">
          <div className="dashboard-income-expense__item">
            <div className="dashboard-income-expense__label">
              <ArrowUpOutlined style={{ color: amountColors.positive, marginRight: 4 }} />
              本月收入
            </div>
            <div className="dashboard-income-expense__value" style={{ color: amountColors.positive }}>
              {formatCurrency(thisMonthIncome)}
            </div>
            {lastMonthIncome > 0 && (
              <div className={`dashboard-income-expense__trend ${thisMonthIncome >= lastMonthIncome ? 'dashboard-income-expense__trend--up' : 'dashboard-income-expense__trend--down'}`}>
                {thisMonthIncome >= lastMonthIncome ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                较上月 {formatPercent(lastMonthIncome > 0 ? ((thisMonthIncome - lastMonthIncome) / lastMonthIncome) * 100 : 0)}
              </div>
            )}
          </div>
          <div className="dashboard-income-expense__item">
            <div className="dashboard-income-expense__label">
              <ArrowDownOutlined style={{ color: amountColors.negative, marginRight: 4 }} />
              本月支出
            </div>
            <div className="dashboard-income-expense__value" style={{ color: amountColors.negative }}>
              {formatCurrency(thisMonthExpense)}
            </div>
            {lastMonthExpense > 0 && (
              <div className={`dashboard-income-expense__trend ${thisMonthExpense <= lastMonthExpense ? 'dashboard-income-expense__trend--up' : 'dashboard-income-expense__trend--down'}`}>
                {thisMonthExpense <= lastMonthExpense ? <ArrowDownOutlined /> : <ArrowUpOutlined />}
                较上月 {formatPercent(lastMonthExpense > 0 ? ((thisMonthExpense - lastMonthExpense) / lastMonthExpense) * 100 : 0)}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ===== 预算进度摘要 ===== */}
      {topBudgets.length > 0 && (
        <Card
          className="surface-card"
          title="预算执行"
          extra={
            <span className="card-extra-link" onClick={() => navigate('/budgets')}>
              查看全部 <RightOutlined style={{ fontSize: 10 }} />
            </span>
          }
        >
          <div className="dashboard-budget-list">
            {topBudgets.map((status) => (
              <div
                key={status.budget.id}
                className="dashboard-budget-item"
                onClick={() => navigate('/budgets')}
              >
                <div className="dashboard-budget-item__header">
                  <span className="dashboard-budget-item__name">{status.budget.name}</span>
                  <span className="dashboard-budget-item__ratio">
                    {formatPercent(status.percentage, 0, false)}
                  </span>
                </div>
                <Progress
                  className="budget-progress"
                  percent={Math.min(status.percentage, 100)}
                  strokeColor={getBudgetProgressColor(status.percentage, status.isOverBudget)}
                  showInfo={false}
                  size="small"
                />
                <div className="dashboard-budget-item__footer">
                  <span>已使用: {formatCurrency(status.used)}</span>
                  <span>预算: {formatCurrency(status.budget.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ===== 趋势图表区 ===== */}
      <div className="split-grid">
        <Card className="surface-card chart-panel">
          <div className="chart-panel__header">
            <h3 className="chart-panel__title">支出趋势</h3>
          </div>
          {chartLoading ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : expenseTrend.length === 0 ? (
            <Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 80 }} />
          ) : (
            <LineChart
              title=""
              xAxisData={expenseTrend.map((item) => item.label)}
              seriesData={[{
                name: '支出',
                data: expenseTrend.map((item) => item.amount),
                color: colorActionPrimary,
              }]}
              height={300}
            />
          )}
        </Card>
        <Card className="surface-card chart-panel">
          <div className="chart-panel__header">
            <h3 className="chart-panel__title">支出分类</h3>
          </div>
          {chartLoading ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : (
            <PieChart title="" data={categoryData} height={300} onDrillDown={handleDrillDown} />
          )}
        </Card>
      </div>

      {/* ===== 最近交易 ===== */}
      <Card
        className="surface-card"
        title="最近交易"
        extra={
          <span className="card-extra-link" onClick={() => navigate('/transactions')}>
            查看全部 <RightOutlined style={{ fontSize: 10 }} />
          </span>
        }
      >
        {recentTransactions.length === 0 ? (
          <Empty description="暂无交易记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div className="tx-item-row-list">
            {recentTransactions.map((item) => (
              <TransactionItemRow
                key={item.id}
                transaction={item}
                onClick={() => navigate('/transactions')}
              />
            ))}
          </div>
        )}
      </Card>
    </>
  )
}

export default Dashboard
