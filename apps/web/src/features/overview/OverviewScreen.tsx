import { useMemo, useState } from 'react'
import { UnstyledButton } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react'
import type { ColorScheme } from '../../styles/theme/tokens'
import { ACCOUNTS, CATEGORIES, PREVIEW_TODAY, TRANSACTIONS } from '../transactions/mock'
import { ColdStartState, ErrorState } from '../transactions/TransactionStates'
import { TransactionDetail } from '../transactions/TransactionDetail'
import { TransactionList } from '../transactions/TransactionList'
import { showUndoToast } from '../transactions/undo-toast'
import {
  formatAmount,
  formatPercent,
  formatUnsigned,
  summarize,
} from '../transactions/transaction-utils'
import type { DataState, DeviceMode, Transaction } from '../transactions/types'
import { NetWorthTrend } from './NetWorthTrend'
import { OVERVIEW_MOCK, RECENT_LIMIT } from './overview-mock'
import { OverviewLoadingState } from './OverviewStates'
import { deriveNetWorth, savingsRate } from './overview-utils'

type OverviewScreenProps = {
  device: DeviceMode
  scheme: ColorScheme
  dataState: DataState
  items: Transaction[]
  freshLedger: boolean
  setItems: (updater: (current: Transaction[]) => Transaction[]) => void
  onRecord: () => void
  onRetry: () => void
  onOpenTransactions: () => void
}

/** mock 流水的净额：总览快照与本次会话新增记录之间的基准线。 */
const BASELINE_NET = summarize(TRANSACTIONS).net
const NO_SELECTION: Set<string> = new Set()
const noop = () => {}

function money(value: number): string {
  return value < 0 ? formatAmount(value) : formatUnsigned(value)
}

function TrendChip({ direction, label }: { direction: 'up' | 'down'; label: string }) {
  const Icon = direction === 'up' ? TrendingUp : TrendingDown
  return (
    <span className="ov-trend" data-dir={direction}>
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
  setItems,
  onRecord,
  onRetry,
  onOpenTransactions,
}: OverviewScreenProps) {
  const [detailId, setDetailId] = useState<string | null>(null)

  const summary = useMemo(() => summarize(items), [items])
  const netWorth = deriveNetWorth({
    freshLedger,
    base: OVERVIEW_MOCK.netWorth,
    baselineNet: BASELINE_NET,
    currentNet: summary.net,
  })
  const rate = savingsRate(summary.income, summary.net)
  const detailTx = items.find((tx) => tx.id === detailId)
  const limit = device === 'mobile' ? RECENT_LIMIT.mobile : RECENT_LIMIT.pc
  const recentItems = items.slice(0, limit)

  const trendPoints = freshLedger
    ? [{ label: '现在', value: netWorth }]
    : OVERVIEW_MOCK.trend.map((point, index) => ({
        ...point,
        value: index === OVERVIEW_MOCK.trend.length - 1 ? netWorth : point.value,
      }))

  const updateTransaction = (next: Transaction) => {
    setItems((current) => current.map((tx) => (tx.id === next.id ? next : tx)))
    notifications.show({ message: '已保存修改', autoClose: 2600 })
  }

  const removeOne = (id: string) => {
    const index = items.findIndex((tx) => tx.id === id)
    if (index < 0) return
    const removed = items[index]
    setItems((current) => current.filter((tx) => tx.id !== id))
    setDetailId(null)
    showUndoToast(`ov-delete-${id}`, '已删除这笔', () => {
      setItems((current) => {
        const next = [...current]
        next.splice(Math.min(index, next.length), 0, removed)
        return next
      })
    })
  }

  const header = device === 'pc' ? (
    <header className="hf-page-header">
      <div>
        <h1 className="mb-title-5">总览</h1>
        <p className="mb-text-1">{OVERVIEW_MOCK.monthLabel} · {OVERVIEW_MOCK.asOfLabel}</p>
      </div>
    </header>
  ) : (
    <div className="ov-mobile-meta">
      <span className="mb-text-1">{OVERVIEW_MOCK.monthLabel}</span>
      <span className="mb-text-0">{OVERVIEW_MOCK.asOfLabel}</span>
    </div>
  )

  const trendCard = (
    <section className="ov-card" aria-label="净资产走势">
      <div className="ov-section-head">
        <div>
          <h2 className="mb-title-4">净资产走势</h2>
          <p className="mb-text-0">{freshLedger ? '刚起步 · 数据来自你的记录' : '近 12 个月'}</p>
        </div>
      </div>
      <NetWorthTrend points={trendPoints} scheme={scheme} />
    </section>
  )

  const recentSection = (
    <section className="ov-section" aria-label="最近流水">
      <div className="ov-section-head">
        <div>
          <h2 className="mb-title-4">最近流水</h2>
          <p className="mb-text-0">
            {freshLedger ? '冷启动后的第一笔' : `最新 ${limit} 笔 · 点击查看详情`}
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
        accounts={ACCOUNTS}
        categories={CATEGORIES}
        batchMode={false}
        selectedIds={NO_SELECTION}
        today={PREVIEW_TODAY}
        onToggleSelect={noop}
        onOpen={setDetailId}
      />
    </section>
  )

  const heroCells = (
    <div className="ov-hero-cells">
      <div className="ov-cell">
        <span className="ov-cell-label">本月收入</span>
        <span className="ov-cell-value mb-num" data-tone="income">{formatAmount(summary.income)}</span>
        {!freshLedger && <TrendChip direction="up" label={`较上月 +${OVERVIEW_MOCK.incomeChange}%`} />}
      </div>
      <div className="ov-cell">
        <span className="ov-cell-label">本月支出</span>
        <span className="ov-cell-value mb-num" data-tone="expense">{formatUnsigned(summary.expense)}</span>
        {!freshLedger && <TrendChip direction="down" label={`较上月 +${OVERVIEW_MOCK.expenseChange}%`} />}
      </div>
      <div className="ov-cell">
        <span className="ov-cell-label">本月结余</span>
        <span className="ov-cell-value mb-num" data-tone={summary.net >= 0 ? 'income' : 'expense'}>
          {formatAmount(summary.net)}
        </span>
      </div>
      <div className="ov-cell">
        <span className="ov-cell-label">储蓄率</span>
        <span className="ov-cell-value mb-num">{rate === null ? '—' : formatPercent(rate)}</span>
      </div>
    </div>
  )

  const body = device === 'pc' ? (
    <>
      <section className="ov-hero">
        <div className="ov-hero-head">
          <span className="mb-text-1">净资产</span>
          {!freshLedger && <TrendChip direction="up" label={`较上月 +${OVERVIEW_MOCK.netWorthChange}%`} />}
        </div>
        <div className="ov-hero-amount mb-num">{money(netWorth)}</div>
        <div className="ov-hero-sub mb-text-1">
          {freshLedger
            ? `本月结余 ${formatAmount(summary.net)} · 已记 ${summary.count} 笔`
            : `现金等价 ${formatUnsigned(OVERVIEW_MOCK.liquid)} · 投资 ${formatUnsigned(OVERVIEW_MOCK.invest)} · ${ACCOUNTS.length} 个账户`}
        </div>
        {heroCells}
      </section>
      {trendCard}
      {recentSection}
    </>
  ) : (
    <>
      <section className="ov-hero">
        <div className="ov-hero-head">
          <span className="mb-text-1">净资产</span>
          {!freshLedger && <TrendChip direction="up" label={`较上月 +${OVERVIEW_MOCK.netWorthChange}%`} />}
        </div>
        <div className="ov-hero-amount mb-num">{money(netWorth)}</div>
        <div className="ov-hero-sub mb-text-1">
          {freshLedger
            ? `本月结余 ${formatAmount(summary.net)} · 已记 ${summary.count} 笔`
            : `现金等价 ${formatUnsigned(OVERVIEW_MOCK.liquid)} · ${ACCOUNTS.length} 个账户`}
        </div>
      </section>
      <div className="ov-quick">
        <div className="ov-card ov-quick-card">
          <span className="ov-cell-label">本月收入</span>
          <span className="ov-cell-value mb-num" data-tone="income">{formatAmount(summary.income)}</span>
          {!freshLedger && <TrendChip direction="up" label={`较上月 +${OVERVIEW_MOCK.incomeChange}%`} />}
        </div>
        <div className="ov-card ov-quick-card">
          <span className="ov-cell-label">本月支出</span>
          <span className="ov-cell-value mb-num" data-tone="expense">{formatUnsigned(summary.expense)}</span>
          {!freshLedger && <TrendChip direction="down" label={`较上月 +${OVERVIEW_MOCK.expenseChange}%`} />}
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
        accounts={ACCOUNTS}
        onClose={() => setDetailId(null)}
        onSave={updateTransaction}
        onDelete={removeOne}
      />
    </div>
  )
}
