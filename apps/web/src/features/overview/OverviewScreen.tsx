import { useMemo, useState } from 'react'
import { UnstyledButton } from '@mantine/core'
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react'
import type { ColorScheme } from '../../styles/theme/tokens'
import { ACCOUNTS, CATEGORIES, PREVIEW_TODAY, TRANSACTIONS } from '../transactions/mock'
import { ColdStartState, ErrorState } from '../transactions/TransactionStates'
import { TransactionDetail } from '../transactions/TransactionDetail'
import { TransactionList } from '../transactions/TransactionList'
import {
  formatAmount,
  formatPercent,
  formatUnsigned,
  summarize,
} from '../transactions/transaction-utils'
import type {
  Account,
  Category,
  DataState,
  DeviceMode,
  LedgerActions,
  Transaction,
} from '../transactions/types'
import { NetWorthTrend } from './NetWorthTrend'
import { OVERVIEW_MOCK, RECENT_LIMIT } from './overview-mock'
import { OverviewLoadingState } from './OverviewStates'
import type { OverviewView } from './overview-data'
import { buildRecordTrend, deriveNetWorth, formatNetAmount, savingsRate } from './overview-utils'

type OverviewScreenProps = {
  device: DeviceMode
  scheme: ColorScheme
  dataState: DataState
  items: Transaction[]
  freshLedger: boolean
  accounts?: Account[]
  categories?: Category[]
  today?: string
  /** 生产视图模型：有值时覆盖 mock 快照与汇总口径。 */
  view?: OverviewView
  actions: LedgerActions
  onRecord: () => void
  onRetry: () => void
  onOpenTransactions: () => void
}

/** mock 流水的净额：总览快照与本次会话新增记录之间的基准线。 */
const BASELINE_NET = summarize(TRANSACTIONS).net
const NO_SELECTION: Set<string> = new Set()
const noop = () => {}

function TrendChip({
  direction,
  tone,
  label,
}: {
  direction: 'up' | 'down'
  tone: 'income' | 'expense'
  label: string
}) {
  const Icon = direction === 'up' ? TrendingUp : TrendingDown
  return (
    <span className="ov-trend" data-tone={tone}>
      <Icon aria-hidden />
      <span>{label}</span>
    </span>
  )
}

export function OverviewScreen({
  device,
  scheme,
  dataState,
  items,
  freshLedger,
  accounts = ACCOUNTS,
  categories = CATEGORIES,
  today = PREVIEW_TODAY,
  view,
  actions,
  onRecord,
  onRetry,
  onOpenTransactions,
}: OverviewScreenProps) {
  const [detailId, setDetailId] = useState<string | null>(null)

  const summary = useMemo(() => summarize(items), [items])
  const effectiveSummary = view?.summary ?? summary
  const isFresh = view?.freshLedger ?? freshLedger
  const netWorth = view?.netWorth ?? deriveNetWorth({
    freshLedger,
    base: OVERVIEW_MOCK.netWorth,
    baselineNet: BASELINE_NET,
    currentNet: summary.net,
  })
  const rate = savingsRate(effectiveSummary.income, effectiveSummary.net)
  const detailTx = items.find((tx) => tx.id === detailId)
  const limit = device === 'mobile' ? RECENT_LIMIT.mobile : RECENT_LIMIT.pc
  const recentItems = items.slice(0, limit)
  const isFirstEntry = isFresh && effectiveSummary.count === 1

  // 冷启动账本没有历史快照：走势点只来自已记记录，按记录日累计。
  const recordTrend = useMemo(
    () => (isFresh ? buildRecordTrend(items) : []),
    [isFresh, items],
  )
  const trendReady = view ? view.points.length >= 2 : recordTrend.length >= 2
  const trendPoints = view
    ? view.points
    : isFresh
      ? recordTrend
      : OVERVIEW_MOCK.trend.map((point, index) => ({
          ...point,
          value: index === OVERVIEW_MOCK.trend.length - 1 ? netWorth : point.value,
        }))

  const periodLabel = view?.periodLabel ?? OVERVIEW_MOCK.monthLabel
  const asOfLabel = view?.asOfLabel ?? OVERVIEW_MOCK.asOfLabel
  const trendCaption = view
    ? view.trendCaption
    : isFresh
      ? trendReady
        ? `按记录日累计 · ${recordTrend.length} 天`
        : '再记一天，走势就会出现'
      : '近 12 个月'

  const changeChip = (value: number | null | undefined, fallback: number, tone: 'income' | 'expense') => {
    const percent = view ? value : fallback
    if (percent === null || percent === undefined) return null
    return (
      <TrendChip
        direction={percent >= 0 ? 'up' : 'down'}
        tone={tone}
        label={`较上月 ${percent >= 0 ? '+' : '−'}${Math.abs(percent)}%`}
      />
    )
  }

  const updateTransaction = (next: Transaction) => {
    actions.update(next)
  }

  const removeOne = (id: string) => {
    actions.remove([id])
    setDetailId(null)
  }

  const header = device === 'pc' ? (
    <header className="hf-page-header">
      <div>
        <h1 className="mb-title-5">总览</h1>
        <p className="mb-text-1">{periodLabel} · {asOfLabel}</p>
      </div>
    </header>
  ) : (
    <div className="ov-mobile-meta">
      <span className="mb-text-1">{periodLabel}</span>
      <span className="mb-text-0">{asOfLabel}</span>
    </div>
  )

  const trendCard = (
    <section className="ov-card" aria-label="净资产走势">
      <div className="ov-section-head">
        <div>
          <h2 className="mb-title-4">净资产走势</h2>
          <p className="mb-text-0">{trendCaption}</p>
        </div>
      </div>
      <NetWorthTrend
        points={trendPoints}
        scheme={scheme}
        emptyHint={view ? trendCaption : isFresh ? '再记一天，走势就会出现' : undefined}
      />
    </section>
  )

  const recentSection = (
    <section className="ov-section" aria-label="最近流水">
      <div className="ov-section-head">
        <div>
          <h2 className="mb-title-4">最近流水</h2>
          <p className="mb-text-0">
            {isFirstEntry ? '冷启动后的第一笔' : `最新 ${limit} 笔 · 点击查看详情`}
          </p>
        </div>
        <UnstyledButton className="ov-section-link" onClick={onOpenTransactions}>
          查看全部
          <ArrowRight aria-hidden />
        </UnstyledButton>
      </div>
      <TransactionList
        device={device}
        items={recentItems}
        accounts={accounts}
        categories={categories}
        batchMode={false}
        selectedIds={NO_SELECTION}
        today={today}
        onToggleSelect={noop}
        onOpen={setDetailId}
      />
    </section>
  )

  const heroCells = (
    <div className="ov-hero-cells">
      <div className="ov-cell">
        <span className="ov-cell-label">本月收入</span>
        <span className="ov-cell-value mb-num" data-tone="income">{formatAmount(effectiveSummary.income)}</span>
        {changeChip(view?.incomeChange, OVERVIEW_MOCK.incomeChange, 'income')}
      </div>
      <div className="ov-cell">
        <span className="ov-cell-label">本月支出</span>
        <span className="ov-cell-value mb-num" data-tone="expense">{formatAmount(-effectiveSummary.expense)}</span>
        {changeChip(view?.expenseChange, OVERVIEW_MOCK.expenseChange, 'expense')}
      </div>
      <div className="ov-cell">
        <span className="ov-cell-label">本月结余</span>
        <span className="ov-cell-value mb-num" data-tone={effectiveSummary.net >= 0 ? 'income' : 'expense'}>
          {formatAmount(effectiveSummary.net)}
        </span>
      </div>
      <div className="ov-cell">
        <span className="ov-cell-label">储蓄率</span>
        <span className="ov-cell-value mb-num">{rate === null ? '—' : formatPercent(rate)}</span>
      </div>
    </div>
  )

  const netWorthChange = changeChip(view?.netWorthChange, OVERVIEW_MOCK.netWorthChange, 'income')
  const heroSub = view
    ? view.heroCaption
    : isFresh
      ? `本月结余 ${formatAmount(effectiveSummary.net)} · 已记 ${effectiveSummary.count} 笔`
      : `现金等价 ${formatUnsigned(OVERVIEW_MOCK.liquid)} · 投资 ${formatUnsigned(OVERVIEW_MOCK.invest)} · ${accounts.length} 个账户`

  const body = device === 'pc' ? (
    <>
      <section className="ov-hero" aria-label="净资产">
        <div className="ov-hero-head">
          <span className="mb-text-1">净资产</span>
          {netWorthChange}
        </div>
        <div className="ov-hero-amount mb-num">{formatNetAmount(netWorth)}</div>
        <div className="ov-hero-sub mb-text-1">{heroSub}</div>
        {heroCells}
      </section>
      {trendCard}
      {recentSection}
    </>
  ) : (
    <>
      <section className="ov-hero" aria-label="净资产">
        <div className="ov-hero-head">
          <span className="mb-text-1">净资产</span>
          {netWorthChange}
        </div>
        <div className="ov-hero-amount mb-num">{formatNetAmount(netWorth)}</div>
        <div className="ov-hero-sub mb-text-1">{heroSub}</div>
      </section>
      <div className="ov-quick">
        <div className="ov-card ov-quick-card">
          <span className="ov-cell-label">本月收入</span>
          <span className="ov-cell-value mb-num" data-tone="income">{formatAmount(effectiveSummary.income)}</span>
          {changeChip(view?.incomeChange, OVERVIEW_MOCK.incomeChange, 'income')}
        </div>
        <div className="ov-card ov-quick-card">
          <span className="ov-cell-label">本月支出</span>
          <span className="ov-cell-value mb-num" data-tone="expense">{formatAmount(-effectiveSummary.expense)}</span>
          {changeChip(view?.expenseChange, OVERVIEW_MOCK.expenseChange, 'expense')}
        </div>
      </div>
      {trendCard}
      {recentSection}
    </>
  )

  return (
    <div className="ov-page" data-device={device}>
      {header}
      {dataState === 'loading' ? (
        <OverviewLoadingState />
      ) : dataState === 'error' ? (
        <ErrorState onRetry={onRetry} />
      ) : dataState === 'empty' || items.length === 0 ? (
        <ColdStartState onRecord={onRecord} />
      ) : (
        body
      )}
      <TransactionDetail
        open={Boolean(detailTx)}
        device={device}
        tx={detailTx}
        accounts={accounts}
        categories={categories}
        onClose={() => setDetailId(null)}
        onSave={updateTransaction}
        onDelete={removeOne}
      />
    </div>
  )
}
