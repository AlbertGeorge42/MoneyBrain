import { useEffect } from 'react'
import type { LedgerTransaction } from './model'
import type { DataState, DeviceMode } from '@/features/shared/types'
import { ColdStartGuide, ErrorPanel, LoadingSkeleton } from '@/features/shared/StateViews'
import { PageShell } from '@/features/shared/skeleton/PageShell'
import { AccountEntry } from './AccountEntry'
import { BudgetCard } from './BudgetCard'
import { ExpenseCategoryPie, type ExpenseCategoryDrill } from './ExpenseCategoryPie'
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

/** 下钻前记录总览滚动位置；从流水返回时一次性恢复，保证图表停在原位。 */
const OVERVIEW_SCROLL_KEY = 'mb-hf-overview-drill-scroll'

/** 总览的滚动宿主：移动端是 shell 内滚动区，桌面/预览是设计画布。 */
function overviewScrollHost(): HTMLElement | null {
  const node = document.querySelector('.mb-mobile-scroll') ?? document.querySelector('.mb-hf-canvas')
  return node instanceof HTMLElement ? node : null
}

function rememberOverviewScroll() {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(
    OVERVIEW_SCROLL_KEY,
    JSON.stringify({
      windowY: window.scrollY || document.documentElement.scrollTop || 0,
      hostY: overviewScrollHost()?.scrollTop ?? 0,
    }),
  )
}

function useRestoreOverviewScroll() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return
    const raw = sessionStorage.getItem(OVERVIEW_SCROLL_KEY)
    if (!raw) return
    let saved: { windowY?: number; hostY?: number }
    try {
      saved = JSON.parse(raw) as { windowY?: number; hostY?: number }
    } catch {
      sessionStorage.removeItem(OVERVIEW_SCROLL_KEY)
      return
    }
    const frame = requestAnimationFrame(() => {
      if (typeof saved.windowY === 'number' && saved.windowY > 0) {
        window.scrollTo(0, saved.windowY)
      }
      if (typeof saved.hostY === 'number' && saved.hostY > 0) {
        const host = overviewScrollHost()
        if (host) host.scrollTop = saved.hostY
      }
      // StrictMode 下 effect 会执行两次，key 必须等真正恢复后再清，否则第二次读不到。
      sessionStorage.removeItem(OVERVIEW_SCROLL_KEY)
    })
    return () => cancelAnimationFrame(frame)
  }, [])
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
  onImport: () => void
  /** 点击支出分类下钻到带分类 + 期间的流水页；未接线时分类图不可下钻。 */
  onDrillCategory?: (target: ExpenseCategoryDrill) => void
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
    return <p className="mb-m-page-meta">{sub}</p>
  }
  return (
    <div className="mb-page-head">
      <h1 className="mb-page-title">总览</h1>
      <p className="mb-page-sub">{sub}</p>
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
  onImport,
  onDrillCategory,
}: OverviewPageProps) {
  const { ledger } = useLedger()
  useRestoreOverviewScroll()
  // API 模式用真实数据所在月份；种子模式保持原来的固定期间。
  const periodLabel = ledger.snapshot?.periodLabel ?? CURRENT_MONTH_LABEL
  const today = ledger.snapshot?.today

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
        <ColdStartGuide variant="overview" onPrimary={onCreateAccount} onImport={onImport} />
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
  const drillCategory = (target: ExpenseCategoryDrill) => {
    if (!onDrillCategory) return
    rememberOverviewScroll()
    onDrillCategory(target)
  }

  if (device === 'mobile') {
    return (
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
        <div className="mb-dash-charts">
          <ExpenseTrendChart points={expenseCharts.trend} device="mobile" />
          <ExpenseCategoryPie
            slices={expenseCharts.categories}
            range={expenseCharts.range}
            device="mobile"
            onDrill={onDrillCategory ? drillCategory : undefined}
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
    )
  }

  return (
    <PageShell head={<PageHead device={device} dataState={dataState} periodLabel={periodLabel} />}>
      <NetWorthHero summary={summary} />
      <AccountEntry
        summary={summary}
        accounts={ledger.accounts}
        categories={ledger.accountCategories}
        onOpen={onOpenAccounts}
      />
      <div className="mb-dash-mid">
        <RecentTransactions
          device="desktop"
          groups={groups}
          ledger={ledger}
          onOpenDetail={onOpenDetail}
          onOpenAll={onOpenTransactions}
        />
        <div className="mb-dash-aside">
          <BudgetCard summary={budget} onOpenAll={onOpenBudgets} />
        </div>
      </div>
      <NetWorthTrend points={trend} device="desktop" />
      <div className="mb-dash-charts">
        <ExpenseTrendChart points={expenseCharts.trend} device="desktop" />
        <ExpenseCategoryPie
          slices={expenseCharts.categories}
          range={expenseCharts.range}
          device="desktop"
          onDrill={onDrillCategory ? drillCategory : undefined}
          colorUniverse={categoryUniverse}
        />
      </div>
    </PageShell>
  )
}
