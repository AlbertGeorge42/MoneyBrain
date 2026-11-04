import type { Dispatch, SetStateAction } from 'react'
import { Button } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Hammer } from 'lucide-react'
import type { ColorScheme } from '../../styles/theme/tokens'
import { EntryOverlay } from '../../features/transactions/EntryOverlay'
import { TransactionsScreen } from '../../features/transactions/TransactionsScreen'
import { MONTH_SUMMARY } from '../../features/transactions/mock'
import { showUndoToast } from '../../features/transactions/undo-toast'
import { summarize } from '../../features/transactions/transaction-utils'
import type {
  DataState,
  DeviceMode,
  LedgerActions,
  Transaction,
  TransactionFilters,
  TransactionFocus,
} from '../../features/transactions/types'
import { OverviewScreen } from '../../features/overview/OverviewScreen'
import { ReportsScreen } from '../../features/reports/ReportsScreen'
import { navLabel, type NavPage } from './navigation'
import { ShellFrame } from './ShellFrame'

type HfShellProps = {
  device: DeviceMode
  scheme: ColorScheme
  page: NavPage
  dataState: DataState
  batchMode: boolean
  items: Transaction[]
  freshLedger: boolean
  setItems: Dispatch<SetStateAction<Transaction[]>>
  entryOpen: boolean
  transactionFocus: TransactionFocus | null
  onPageChange: (page: NavPage) => void
  onOpenTransactions: (filters: Partial<TransactionFilters>) => void
  onRecord: () => void
  onEntryOpen: () => void
  onEntryClose: () => void
  onEntrySaved: (tx: Transaction) => void
  onBatchModeChange: (value: boolean) => void
  onRetry: () => void
}

type ContentProps = {
  device: DeviceMode
  scheme: ColorScheme
  page: NavPage
  dataState: DataState
  batchMode: boolean
  items: Transaction[]
  freshLedger: boolean
  actions: LedgerActions
  transactionFocus: TransactionFocus | null
  onEntryOpen: () => void
  onBatchModeChange: (value: boolean) => void
  onRetry: () => void
  onPageChange: (page: NavPage) => void
  onOpenTransactions: (filters: Partial<TransactionFilters>) => void
}

function PageContent({
  device,
  scheme,
  page,
  dataState,
  batchMode,
  items,
  freshLedger,
  actions,
  transactionFocus,
  onEntryOpen,
  onBatchModeChange,
  onRetry,
  onPageChange,
  onOpenTransactions,
}: ContentProps) {
  if (page === 'overview') {
    return (
      <OverviewScreen
        device={device}
        scheme={scheme}
        dataState={dataState}
        items={items}
        freshLedger={freshLedger}
        actions={actions}
        onRecord={onEntryOpen}
        onRetry={onRetry}
        onOpenTransactions={() => onPageChange('transactions')}
      />
    )
  }

  if (page === 'transactions') {
    return (
      <TransactionsScreen
        device={device}
        dataState={dataState}
        batchMode={batchMode}
        items={items}
        actions={actions}
        focus={transactionFocus}
        onEntryOpen={onEntryOpen}
        onBatchModeChange={onBatchModeChange}
        onRetry={onRetry}
      />
    )
  }

  if (page === 'reports') {
    return (
      <ReportsScreen
        device={device}
        scheme={scheme}
        dataState={dataState}
        items={items}
        production={false}
        onRecord={onEntryOpen}
        onRetry={onRetry}
        onOpenTransactions={onOpenTransactions}
      />
    )
  }

  return (
    <div className="hf-placeholder">
      <div className="hf-state-icon"><Hammer aria-hidden /></div>
      <h2 className="mb-title-4">「{navLabel(page)}」不在本批</h2>
      <p className="mb-text-1 hf-state-copy">本批交付总览、流水、报表与记账闭环。该页在下一批高保真补齐。</p>
      <Button variant="default" onClick={() => onPageChange('overview')}>回到总览</Button>
    </div>
  )
}

export function HfShell({
  device,
  scheme,
  page,
  dataState,
  batchMode,
  items,
  freshLedger,
  setItems,
  entryOpen,
  transactionFocus,
  onPageChange,
  onOpenTransactions,
  onRecord,
  onEntryOpen,
  onEntryClose,
  onEntrySaved,
  onBatchModeChange,
  onRetry,
}: HfShellProps) {
  const actions: LedgerActions = {
    update: (next) => {
      setItems((current) => current.map((tx) => (tx.id === next.id ? next : tx)))
      notifications.show({ message: '已保存修改', autoClose: 2600 })
    },
    remove: (ids) => {
      const removed = items
        .map((tx, index) => ({ tx, index }))
        .filter(({ tx }) => ids.includes(tx.id))
      if (removed.length === 0) return
      setItems((current) => current.filter((tx) => !ids.includes(tx.id)))
      showUndoToast(
        `tx-delete-${ids[0]}-${ids.length}`,
        ids.length > 1 ? `已删除 ${ids.length} 笔` : '已删除这笔',
        () => {
          setItems((current) => {
            const next = [...current]
            for (const entry of removed) {
              next.splice(Math.min(entry.index, next.length), 0, entry.tx)
            }
            return next
          })
        },
      )
    },
  }

  // 空账本时侧栏跟随页面一起归零，不残留 mock 汇总
  const summary = summarize(dataState === 'empty' ? [] : items)
  const ledgerNote = dataState === 'empty'
    ? '还没有记录'
    : freshLedger
      ? `已记 ${summary.count} 笔`
      : `连续 ${MONTH_SUMMARY.streakDays} 天有记录`

  const contentProps: ContentProps = {
    device,
    scheme,
    page,
    dataState,
    batchMode,
    items,
    freshLedger,
    actions,
    transactionFocus,
    onEntryOpen,
    onBatchModeChange,
    onRetry,
    onPageChange,
    onOpenTransactions,
  }

  return (
    <ShellFrame
      device={device}
      page={page}
      ledgerExpense={summary.expense}
      ledgerNote={ledgerNote}
      batchMode={batchMode}
      onPageChange={onPageChange}
      onRecord={onRecord}
      overlay={(
        <EntryOverlay
          open={entryOpen}
          device={device}
          defaultAccountId="wx"
          defaultToAccountId="alipay"
          onClose={onEntryClose}
          onSaved={onEntrySaved}
        />
      )}
    >
      <PageContent {...contentProps} />
    </ShellFrame>
  )
}
