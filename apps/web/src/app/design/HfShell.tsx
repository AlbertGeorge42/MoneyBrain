import { Button, UnstyledButton } from '@mantine/core'
import { Hammer, Plus } from 'lucide-react'
import { TransactionsScreen } from '../../features/transactions/TransactionsScreen'
import { MONTH_SUMMARY } from '../../features/transactions/mock'
import { formatAmount } from '../../features/transactions/transaction-utils'
import type { DataState, DeviceMode } from '../../features/transactions/types'
import { NAV_ITEMS, navLabel, type NavPage } from './navigation'

type HfShellProps = {
  device: DeviceMode
  page: NavPage
  dataState: DataState
  batchMode: boolean
  entryOpen: boolean
  onPageChange: (page: NavPage) => void
  onRecord: () => void
  onEntryOpen: () => void
  onEntryClose: () => void
  onBatchModeChange: (value: boolean) => void
  onRetry: () => void
}

function Brand() {
  return (
    <div className="hf-brand">
      <span className="hf-brand-mark mb-num" aria-hidden>MB</span>
      <span className="hf-brand-name">MoneyBrain</span>
    </div>
  )
}

type ContentProps = {
  device: DeviceMode
  page: NavPage
  dataState: DataState
  batchMode: boolean
  entryOpen: boolean
  onEntryOpen: () => void
  onEntryClose: () => void
  onBatchModeChange: (value: boolean) => void
  onRetry: () => void
  onPageChange: (page: NavPage) => void
}

function PageContent({
  device,
  page,
  dataState,
  batchMode,
  entryOpen,
  onEntryOpen,
  onEntryClose,
  onBatchModeChange,
  onRetry,
  onPageChange,
}: ContentProps) {
  if (page !== 'transactions') {
    return (
      <div className="hf-placeholder">
        <div className="hf-state-icon"><Hammer aria-hidden /></div>
        <h2 className="mb-title-4">「{navLabel(page)}」不在本批</h2>
        <p className="mb-text-1 hf-state-copy">HF 首批交付流水闭环与记账。该页在下一批高保真补齐。</p>
        <Button variant="default" onClick={() => onPageChange('transactions')}>回到流水</Button>
      </div>
    )
  }

  return (
    <TransactionsScreen
      device={device}
      dataState={dataState}
      batchMode={batchMode}
      entryOpen={entryOpen}
      onEntryOpen={onEntryOpen}
      onEntryClose={onEntryClose}
      onBatchModeChange={onBatchModeChange}
      onRetry={onRetry}
    />
  )
}

export function HfShell({
  device,
  page,
  dataState,
  batchMode,
  entryOpen,
  onPageChange,
  onRecord,
  onEntryOpen,
  onEntryClose,
  onBatchModeChange,
  onRetry,
}: HfShellProps) {
  const contentProps: ContentProps = {
    device,
    page,
    dataState,
    batchMode,
    entryOpen,
    onEntryOpen,
    onEntryClose,
    onBatchModeChange,
    onRetry,
    onPageChange,
  }

  if (device === 'mobile') {
    return (
      <div className="hf-shell-mobile">
        <header className="hf-mobile-header">
          <Brand />
          <span className="hf-mobile-page-title mb-title-3">{navLabel(page)}</span>
        </header>
        <div className="hf-mobile-body">
          <PageContent {...contentProps} />
        </div>
        <nav className="hf-bottom-nav" aria-label="底部导航">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = item.page === page
            return (
              <UnstyledButton
                key={item.page}
                className="hf-bottom-nav-item"
                data-active={active}
                aria-current={active ? 'page' : undefined}
                onClick={() => onPageChange(item.page)}
              >
                <Icon aria-hidden />
                <span>{item.label}</span>
              </UnstyledButton>
            )
          })}
        </nav>
        {!batchMode && (
          <UnstyledButton className="hf-fab" aria-label="记一笔" onClick={onRecord}>
            <Plus aria-hidden />
          </UnstyledButton>
        )}
      </div>
    )
  }

  return (
    <div className="hf-shell-pc">
      <aside className="hf-sidebar">
        <Brand />
        <nav className="hf-nav" aria-label="主导航">
          {NAV_ITEMS.map((item, index) => {
            const Icon = item.icon
            const active = item.page === page
            return (
              <UnstyledButton
                key={item.page}
                className="hf-nav-item"
                data-active={active}
                aria-current={active ? 'page' : undefined}
                onClick={() => onPageChange(item.page)}
              >
                <Icon className="hf-nav-icon" aria-hidden />
                <span>{item.label}</span>
                <kbd className="hf-kbd">{index + 1}</kbd>
              </UnstyledButton>
            )
          })}
        </nav>
        <div className="hf-sidebar-foot">
          <div className="hf-sidebar-status">
            <span className="mb-text-0">本月收支</span>
            <span className="hf-sidebar-amount mb-num" data-tone="expense">{formatAmount(-MONTH_SUMMARY.expense)}</span>
            <span className="mb-text-0">连续 {MONTH_SUMMARY.streakDays} 天有记录</span>
          </div>
          <Button
            className="hf-record-btn mb-accent-btn"
            fullWidth
            leftSection={<Plus aria-hidden />}
            rightSection={<kbd className="hf-kbd hf-kbd--onfill">N</kbd>}
            onClick={onRecord}
          >
            记一笔
          </Button>
        </div>
      </aside>
      <main className="hf-main">
        <div className="hf-content">
          <PageContent {...contentProps} />
        </div>
      </main>
    </div>
  )
}
