import { useMemo, useState } from 'react'
import type { ExpenseCategorySlice, LedgerTransaction } from './model'
import type { DataState, DeviceMode } from '@/features/shared/types'
import { Card } from '@/features/shared/Card'
import { DonutChart, type DonutNode } from '@/features/shared/DonutChart'
import { DrillDrawer } from '@/features/reports/DrillDrawer'
import {
  buildDrillFor,
  type DrillData,
  type DrillTarget,
} from '@/features/reports/reportsModel'
import { ColdStartGuide, ErrorPanel, LoadingSkeleton } from '@/features/shared/StateViews'
import { PageShell } from '@/features/shared/skeleton/PageShell'
import { AccountEntry } from './AccountEntry'
import { BudgetCard } from './BudgetCard'
import { ExpenseTrendChart } from './ExpenseTrendChart'
import { MobileHero, MobileSnapshots, NetWorthHero } from './Hero'
import { NetWorthTrend } from './NetWorthTrend'
import { RecentTransactions } from './RecentTransactions'
import { useLedger } from './ledgerStore'
import {
  CURRENT_MONTH_LABEL,
  deriveBudgets,
  deriveExpenseCharts,
  deriveNetWorthTrend,
  deriveOverview,
  groupRecentTransactions,
} from './model'
import './overview.css'
import '@/features/reports/reports.css'

/** 总览支出分类环：把 category-breakdown 的扁平切片适配成共享环的节点，不算第二份环实现。 */
function ExpenseDonut({
  slices,
  device,
  onOpen,
  colorUniverse,
}: {
  slices: ExpenseCategorySlice[]
  device: DeviceMode
  onOpen?: (node: DonutNode) => void
  colorUniverse?: readonly string[]
}) {
  const visible = slices.filter((slice) => slice.amount > 0)
  const total = visible.reduce((sum, slice) => sum + slice.amount, 0)
  const nodes: DonutNode[] = visible.map((slice) => ({
    id: slice.id,
    name: slice.name,
    amount: slice.amount,
    count: 0,
    share: total > 0 ? (slice.amount / total) * 100 : 0,
    level: 0,
    children: [],
  }))
  return (
    <Card className="mb-ov-pie-card">
      <div className="mb-shared-head">
        <div>
          <h2 className="mb-shared-sec-title">支出分类</h2>
          <p className="mb-shared-sec-desc">近 12 个月 · 点击分类查看流水</p>
        </div>
      </div>
      <DonutChart
        nodes={nodes}
        total={total}
        device={device}
        kind="expense"
        title="支出分类"
        emptyText="近 12 个月没有支出数据"
        colorUniverse={colorUniverse}
        onOpen={onOpen}
      />
    </Card>
  )
}

interface OverviewPageProps {
  device: DeviceMode
  dataState: DataState
  onOpenDetail: (transaction: LedgerTransaction) => void
  onOpenTransactions: () => void
  onOpenBudgets: () => void
  onOpenAccounts: () => void
  onRetry: () => void
  onCreateAccount: () => void
  /** 记一笔：打开快速记账（引导第二步）。 */
  onRecord: () => void
  onImport: () => void
  /** 打开报表页（引导第三步）。 */
  onOpenReports: () => void
}

function PageHead({
  device,
  dataState,
  periodLabel,
}: {
  device: DeviceMode
  dataState: DataState
  periodLabel: string
}) {
  const note =
    dataState === 'loading'
      ? '正在读取本地账本'
      : dataState === 'empty'
        ? '尚未开始记账'
        : dataState === 'error'
          ? '本地账本读取失败'
          : null
  const sub = note ? `${periodLabel} · ${note}` : periodLabel
  if (device === 'mobile') {
    return <p className="mb-ov-page-meta">{sub}</p>
  }
  return (
    <div className="mb-shell-page-head">
      <h1 className="mb-shell-page-title">总览</h1>
      <p className="mb-shell-sub">{sub}</p>
    </div>
  )
}

export function OverviewPage({
  device,
  dataState,
  onOpenDetail,
  onOpenTransactions,
  onOpenBudgets,
  onOpenAccounts,
  onRetry,
  onCreateAccount,
  onRecord,
  onImport,
  onOpenReports,
}: OverviewPageProps) {
  const { ledger } = useLedger()
  // 有快照时用真实数据所在月份，否则回退到当月标签。
  const periodLabel = ledger.snapshot?.periodLabel ?? CURRENT_MONTH_LABEL
  const today = ledger.snapshot?.today
  // 引导进度：empty 态按定义没有账户与流水；否则按账本实际内容派生。
  const hasAccount = dataState !== 'empty' && ledger.accounts.length > 0
  const hasEntry = dataState !== 'empty' && ledger.transactions.length > 0
  // 支出分类环统一走「环 → 抽屉 → 流水」：与报表三张环同一份 DrillDrawer。
  // hook 必须在下面的早退分支之前声明，保证调用顺序稳定。
  const [drill, setDrill] = useState<DrillTarget | null>(null)
  const expenseRange = useMemo(
    () => deriveExpenseCharts(ledger).range,
    [ledger],
  )
  const drillData = useMemo<DrillData | null>(
    () => (drill ? buildDrillFor(ledger, drill, expenseRange.from, expenseRange.to) : null),
    [drill, ledger, expenseRange.from, expenseRange.to],
  )

  if (dataState === 'loading') {
    return (
      <PageShell head={<PageHead device={device} dataState={dataState} periodLabel={periodLabel} />}>
        <LoadingSkeleton device={device} />
      </PageShell>
    )
  }

  if (dataState === 'empty') {
    return (
      <PageShell head={<PageHead device={device} dataState={dataState} periodLabel={periodLabel} />}>
        <ColdStartGuide
          variant="overview"
          hasAccount={hasAccount}
          hasEntry={hasEntry}
          onCreateAccount={onCreateAccount}
          onRecord={onRecord}
          onImport={onImport}
          onOpenReports={onOpenReports}
        />
      </PageShell>
    )
  }

  if (dataState === 'error') {
    return (
      <PageShell head={<PageHead device={device} dataState={dataState} periodLabel={periodLabel} />}>
        <ErrorPanel onRetry={onRetry} />
      </PageShell>
    )
  }

  const summary = deriveOverview(ledger)
  const budget = deriveBudgets(ledger)
  const groups = groupRecentTransactions(
    ledger.transactions,
    device === 'mobile' ? 4 : 3,
    today,
  )
  const trend = deriveNetWorthTrend(summary.netWorth, ledger.snapshot?.trend)
  const expenseCharts = deriveExpenseCharts(ledger)
  // 近 12 个月支出一级分类全集：总览与报表共用，保证同一分类跨页面、跨月份同色。
  const categoryUniverse = expenseCharts.categories.map((slice) => slice.name.trim())
  const openCategory = (node: DonutNode) => {
    const ids = node.id === 'rest' && node.mergedIds ? node.mergedIds : [node.id]
    setDrill({
      type: 'category',
      title: node.name,
      amountLabel: '近 12 个月支出',
      amount: node.amount,
      childTitle: '',
      children: [],
      ids,
      side: 'expense',
    })
  }

  if (device === 'mobile') {
    return (
      <>
      <PageShell head={<PageHead device={device} dataState={dataState} periodLabel={periodLabel} />}>
        <MobileHero summary={summary} />
        <MobileSnapshots summary={summary} />
        <AccountEntry
          summary={summary}
          accounts={ledger.accounts}
          categories={ledger.accountCategories}
          onOpen={onOpenAccounts}
        />
        <NetWorthTrend points={trend} device="mobile" />
        <div className="mb-dp-charts">
          <ExpenseTrendChart points={expenseCharts.trend} device="mobile" />
          <ExpenseDonut
            slices={expenseCharts.categories}
            device="mobile"
            onOpen={openCategory}
            colorUniverse={categoryUniverse}
          />
        </div>
        <BudgetCard summary={budget} mobile onOpenAll={onOpenBudgets} />
        <RecentTransactions
          device="mobile"
          groups={groups}
          ledger={ledger}
          onOpenDetail={onOpenDetail}
          onOpenAll={onOpenTransactions}
        />
      </PageShell>
      <DrillDrawer device={device} data={drillData} onClose={() => setDrill(null)} />
      </>
    )
  }

  return (
    <>
    <PageShell head={<PageHead device={device} dataState={dataState} periodLabel={periodLabel} />}>
      <NetWorthHero summary={summary} />
      <AccountEntry
        summary={summary}
        accounts={ledger.accounts}
        categories={ledger.accountCategories}
        onOpen={onOpenAccounts}
      />
      <div className="mb-dp-mid">
        <RecentTransactions
          device="desktop"
          groups={groups}
          ledger={ledger}
          onOpenDetail={onOpenDetail}
          onOpenAll={onOpenTransactions}
        />
        <div className="mb-dp-aside">
          <BudgetCard summary={budget} onOpenAll={onOpenBudgets} />
        </div>
      </div>
      <NetWorthTrend points={trend} device="desktop" />
      <div className="mb-dp-charts">
        <ExpenseTrendChart points={expenseCharts.trend} device="desktop" />
        <ExpenseDonut
          slices={expenseCharts.categories}
          device="desktop"
          onOpen={openCategory}
          colorUniverse={categoryUniverse}
        />
      </div>
    </PageShell>
    <DrillDrawer device={device} data={drillData} onClose={() => setDrill(null)} />
    </>
  )
}
