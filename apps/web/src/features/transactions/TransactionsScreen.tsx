import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Button, Drawer, Modal } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { Trash2 } from 'lucide-react'
import { ACCOUNTS, CATEGORIES, PREVIEW_TODAY } from './mock'
import { TransactionDetail } from './TransactionDetail'
import { TransactionList } from './TransactionList'
import { AdvancedFilterFields, ConditionChips, TransactionsToolbar } from './TransactionsToolbar'
import { ColdStartState, ErrorState, NoResultState, TransactionLoadingState } from './TransactionStates'
import { showUndoToast } from './undo-toast'
import {
  filterTransactions,
  formatAmount,
  formatUnsigned,
  hasActiveFilters,
  summarize,
} from './transaction-utils'
import { EMPTY_FILTERS, type DataState, type DeviceMode, type Transaction, type TransactionFilters } from './types'

type TransactionsScreenProps = {
  device: DeviceMode
  dataState: DataState
  batchMode: boolean
  items: Transaction[]
  setItems: Dispatch<SetStateAction<Transaction[]>>
  onEntryOpen: () => void
  onBatchModeChange: (value: boolean) => void
  onRetry: () => void
}

export function TransactionsScreen({
  device,
  dataState,
  batchMode,
  items,
  setItems,
  onEntryOpen,
  onBatchModeChange,
  onRetry,
}: TransactionsScreenProps) {
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [detailId, setDetailId] = useState<string | null>(null)
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useHotkeys([['/', () => searchRef.current?.focus()]])

  useEffect(() => {
    if (!batchMode) {
      setSelectedIds(new Set())
      setBatchConfirmOpen(false)
    }
  }, [batchMode])

  const filtered = useMemo(
    () => filterTransactions(items, filters, ACCOUNTS, CATEGORIES),
    [items, filters],
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
    const index = items.findIndex((tx) => tx.id === id)
    if (index < 0) return
    const removed = items[index]
    setItems((current) => current.filter((tx) => tx.id !== id))
    setDetailId(null)
    showUndoToast(`tx-delete-${id}`, '已删除这笔', () => {
      setItems((current) => {
        const next = [...current]
        next.splice(Math.min(index, next.length), 0, removed)
        return next
      })
    })
  }

  const removeBatch = () => {
    const removed = items
      .map((tx, index) => ({ tx, index }))
      .filter(({ tx }) => selectedIds.has(tx.id))
    if (removed.length === 0) return
    setItems((current) => current.filter((tx) => !selectedIds.has(tx.id)))
    setBatchConfirmOpen(false)
    setSelectedIds(new Set())
    onBatchModeChange(false)
    showUndoToast('tx-delete-batch', `已删除 ${removed.length} 笔`, () => {
      setItems((current) => {
        const next = [...current]
        for (const entry of removed) {
          next.splice(Math.min(entry.index, next.length), 0, entry.tx)
        }
        return next
      })
    })
  }

  const updateTransaction = (next: Transaction) => {
    setItems((current) => current.map((tx) => (tx.id === next.id ? next : tx)))
    notifications.show({ message: '已保存修改', autoClose: 2600 })
  }

  const body = (
    <>
      {device === 'pc' ? (
        <header className="hf-page-header">
          <div>
            <h1 className="mb-title-5">流水</h1>
            <p className="mb-text-1">2026 年 11 月 · 共 {filtered.length} 笔</p>
          </div>
        </header>
      ) : (
        <div className="tx-mobile-summary">
          <span className="mb-text-1">2026 年 11 月</span>
          <span className="mb-text-0">共 {filtered.length} 笔</span>
        </div>
      )}

      <TransactionsToolbar
        device={device}
        filters={filters}
        accounts={ACCOUNTS}
        categories={CATEGORIES}
        searchInputRef={searchRef}
        advancedOpen={advancedOpen}
        batchMode={batchMode}
        onChange={changeFilters}
        onReset={resetFilters}
        onToggleAdvanced={() => setAdvancedOpen((value) => !value)}
        onToggleBatch={() => (batchMode ? exitBatch() : onBatchModeChange(true))}
      />

      <ConditionChips
        filters={filters}
        accounts={ACCOUNTS}
        categories={CATEGORIES}
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
          accounts={ACCOUNTS}
          categories={CATEGORIES}
          batchMode={batchMode}
          selectedIds={selectedIds}
          today={PREVIEW_TODAY}
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
            accounts={ACCOUNTS}
            categories={CATEGORIES}
            onChange={changeFilters}
            onReset={resetFilters}
          />
          <div className="hf-drawer-footer">
            <Button className="mb-accent-btn" fullWidth onClick={() => setAdvancedOpen(false)}>应用</Button>
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
        accounts={ACCOUNTS}
        onClose={() => setDetailId(null)}
        onSave={updateTransaction}
        onDelete={removeOne}
      />
    </>
  )
}
