import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Drawer, Modal, UnstyledButton } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { Settings2, Trash2 } from 'lucide-react'
import { ACCOUNTS, CATEGORIES, PREVIEW_TODAY } from './mock'
import { readListDisplay, writeListDisplay, type ListDisplay } from './display-settings'
import { TransactionDetail } from './TransactionDetail'
import { TransactionList } from './TransactionList'
import { AdvancedFilterFields, ConditionChips, ListDisplayFields, TransactionsToolbar } from './TransactionsToolbar'
import { ColdStartState, ErrorState, NoResultState, TransactionLoadingState } from './TransactionStates'
import {
  filterTransactions,
  formatAmount,
  formatUnsigned,
  hasActiveFilters,
  summarize,
} from './transaction-utils'
import {
  EMPTY_FILTERS,
  type Account,
  type Category,
  type DataState,
  type DeviceMode,
  type LedgerActions,
  type Transaction,
  type TransactionFilters,
  type TransactionFocus,
} from './types'

type TransactionsScreenProps = {
  device: DeviceMode
  dataState: DataState
  batchMode: boolean
  items: Transaction[]
  accounts?: Account[]
  categories?: Category[]
  today?: string
  periodLabel?: string
  actions: LedgerActions
  /** 报表下钻携带的一次性筛选；按 key 应用，避免重复覆盖用户后续修改。 */
  focus?: TransactionFocus | null
  onEntryOpen: () => void
  onBatchModeChange: (value: boolean) => void
  onRetry: () => void
}

export function TransactionsScreen({
  device,
  dataState,
  batchMode,
  items,
  accounts = ACCOUNTS,
  categories = CATEGORIES,
  today = PREVIEW_TODAY,
  periodLabel = '2026 年 11 月',
  actions,
  focus,
  onEntryOpen,
  onBatchModeChange,
  onRetry,
}: TransactionsScreenProps) {
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [detailId, setDetailId] = useState<string | null>(null)
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [display, setDisplay] = useState<ListDisplay>(readListDisplay)
  const searchRef = useRef<HTMLInputElement>(null)

  const changeDisplay = (patch: Partial<ListDisplay>) => {
    setDisplay((current) => {
      const next = { ...current, ...patch }
      writeListDisplay(next)
      return next
    })
  }

  useHotkeys([['/', () => searchRef.current?.focus()]])

  useEffect(() => {
    if (!batchMode) {
      setSelectedIds(new Set())
      setBatchConfirmOpen(false)
    }
  }, [batchMode])

  useEffect(() => {
    if (!focus) return
    setFilters({ ...EMPTY_FILTERS, ...focus.filters })
    setAdvancedOpen(true)
  }, [focus])

  const filtered = useMemo(
    () => filterTransactions(items, filters, accounts, categories),
    [items, filters, accounts, categories],
  )
  const summary = summarize(filtered)
  const detailTx = items.find((tx) => tx.id === detailId)
  const noResult = hasActiveFilters(filters) && filtered.length === 0

  const changeFilters = (patch: Partial<TransactionFilters>) => {
    setFilters((current) => ({ ...current, ...patch }))
    if (batchMode) setSelectedIds(new Set())
  }

  const resetFilters = () => setFilters(EMPTY_FILTERS)

  const toggleSelect = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exitBatch = () => {
    setSelectedIds(new Set())
    onBatchModeChange(false)
  }

  const removeOne = (id: string) => {
    actions.remove([id])
    setDetailId(null)
  }

  const removeBatch = () => {
    if (selectedIds.size === 0) return
    actions.remove([...selectedIds])
    setBatchConfirmOpen(false)
    setSelectedIds(new Set())
    onBatchModeChange(false)
  }

  const updateTransaction = (next: Transaction) => {
    actions.update(next)
  }

  const body = (
    <>
      {device === 'pc' ? (
        <header className="hf-page-header">
          <div>
            <h1 className="mb-title-5">流水</h1>
            <p className="mb-text-1">{periodLabel} · 共 {filtered.length} 笔</p>
          </div>
        </header>
      ) : (
        <div className="tx-mobile-summary">
          <span className="mb-text-1">{periodLabel}</span>
          <div className="tx-mobile-summary-side">
            <span className="mb-text-0">共 {filtered.length} 笔</span>
            <UnstyledButton
              className="mb-chip"
              data-active={displayOpen}
              aria-expanded={displayOpen}
              onClick={() => setDisplayOpen(true)}
            >
              <Settings2 aria-hidden /> 显示
            </UnstyledButton>
          </div>
        </div>
      )}

      <TransactionsToolbar
        device={device}
        filters={filters}
        accounts={accounts}
        categories={categories}
        searchInputRef={searchRef}
        advancedOpen={advancedOpen}
        batchMode={batchMode}
        display={display}
        displayOpen={displayOpen}
        onChange={changeFilters}
        onChangeDisplay={changeDisplay}
        onReset={resetFilters}
        onToggleAdvanced={() => setAdvancedOpen((value) => !value)}
        onToggleBatch={() => (batchMode ? exitBatch() : onBatchModeChange(true))}
        onToggleDisplay={() => setDisplayOpen((value) => !value)}
      />

      <ConditionChips
        filters={filters}
        accounts={accounts}
        categories={categories}
        onChange={changeFilters}
        onReset={resetFilters}
      />

      <div className="tx-stats" aria-label="筛选结果统计">
        <span>收入 <strong className="mb-num" data-tone="income">{formatUnsigned(summary.income)}</strong></span>
        <span>支出 <strong className="mb-num" data-tone="expense">{formatUnsigned(summary.expense)}</strong></span>
        <span>净额 <strong className="mb-num" data-tone={summary.net >= 0 ? 'income' : 'expense'}>{formatAmount(summary.net)}</strong></span>
      </div>

      {dataState === 'loading' ? (
        <TransactionLoadingState />
      ) : dataState === 'error' ? (
        <ErrorState onRetry={onRetry} />
      ) : dataState === 'empty' || items.length === 0 ? (
        <ColdStartState onRecord={onEntryOpen} />
      ) : noResult ? (
        <NoResultState onClear={resetFilters} />
      ) : (
        <TransactionList
          device={device}
          items={filtered}
          accounts={accounts}
          categories={categories}
          batchMode={batchMode}
          selectedIds={selectedIds}
          today={today}
          display={display}
          onToggleSelect={toggleSelect}
          onOpen={setDetailId}
        />
      )}

      {batchMode && dataState === 'ready' && filtered.length > 0 && (
        <div className="tx-batch-bar" role="region" aria-label="批量操作">
          <span className="mb-text-1">已选 <strong className="mb-num">{selectedIds.size}</strong> 笔</span>
          <div className="tx-batch-actions">
            <Button variant="default" onClick={exitBatch}>退出</Button>
            <Button
              className="mb-danger-solid"
              disabled={selectedIds.size === 0}
              leftSection={<Trash2 size={16} />}
              onClick={() => setBatchConfirmOpen(true)}
            >
              删除
            </Button>
          </div>
        </div>
      )}
    </>
  )

  return (
    <>
      {body}

      {device === 'mobile' && (
        <Drawer
          opened={advancedOpen}
          onClose={() => setAdvancedOpen(false)}
          position="bottom"
          size="auto"
          title="高级筛选"
          classNames={{ body: 'hf-drawer-body' }}
        >
          <AdvancedFilterFields
            filters={filters}
            accounts={accounts}
            categories={categories}
            onChange={changeFilters}
            onReset={resetFilters}
          />
          <div className="hf-drawer-footer">
            <Button className="mb-accent-btn" fullWidth onClick={() => setAdvancedOpen(false)}>应用</Button>
          </div>
        </Drawer>
      )}

      {device === 'mobile' && (
        <Drawer
          opened={displayOpen}
          onClose={() => setDisplayOpen(false)}
          position="bottom"
          size="auto"
          title="列表显示"
          classNames={{ body: 'hf-drawer-body' }}
        >
          <ListDisplayFields display={display} onChange={changeDisplay} />
          <div className="hf-drawer-footer">
            <Button className="mb-accent-btn" fullWidth onClick={() => setDisplayOpen(false)}>完成</Button>
          </div>
        </Drawer>
      )}

      {device === 'mobile' ? (
        <Drawer
          opened={batchConfirmOpen}
          onClose={() => setBatchConfirmOpen(false)}
          position="bottom"
          size="auto"
          title={`删除 ${selectedIds.size} 笔？`}
        >
          <div className="hf-confirm">
            <p className="mb-text-1">选中的记录会从账本删除，删除后可撤销。</p>
            <div className="hf-confirm-actions">
              <Button variant="default" onClick={() => setBatchConfirmOpen(false)}>取消</Button>
              <Button className="mb-danger-solid" onClick={removeBatch}>删除</Button>
            </div>
          </div>
        </Drawer>
      ) : (
        <Modal opened={batchConfirmOpen} onClose={() => setBatchConfirmOpen(false)} centered title={`删除 ${selectedIds.size} 笔？`}>
          <div className="hf-confirm">
            <p className="mb-text-1">选中的记录会从账本删除，删除后可撤销。</p>
            <div className="hf-confirm-actions">
              <Button variant="default" onClick={() => setBatchConfirmOpen(false)}>取消</Button>
              <Button className="mb-danger-solid" onClick={removeBatch}>删除</Button>
            </div>
          </div>
        </Modal>
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
    </>
  )
}
