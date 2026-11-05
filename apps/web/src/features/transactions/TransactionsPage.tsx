import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { useLedger } from '@/features/overview/ledgerStore'
import {
  CURRENT_MONTH_LABEL,
  TODAY,
  getCategory,
} from '@/features/overview/model'
import { ColdStartGuide, ErrorPanel, LoadingSkeleton } from '@/features/shared/StateViews'
import type { DataState, DeviceMode } from '@/features/shared/types'
import { BatchBar } from './BatchBar'
import { BatchCategoryDialog, BatchDeleteDialog } from './BatchDialogs'
import {
  DesktopDisplayPanel,
  MobileDisplayDrawer,
} from './DisplayPanel'
import { DEFAULT_DISPLAY, readDisplaySettings, writeDisplaySettings, type DisplaySettings } from './displaySettings'
import {
  DesktopFilterPanel,
  MobileFilterDrawer,
} from './FilterPanel'
import { TransactionDetailPanel } from './TransactionDetailPanel'
import { TransactionsList } from './TransactionsList'
import {
  restoreTransactionCategoriesInLedger,
  restoreTransactionsInLedger,
} from './ledgerOps'
import {
  EMPTY_ADVANCED,
  TYPE_OPTIONS,
  filterChips,
  filterTransactions,
  groupTransactions,
  type AdvancedFilters,
  type TypeFilter,
} from './filters'
import './transactions.css'

interface TransactionsPageProps {
  device: DeviceMode
  dataState: DataState
  batchMode: boolean
  onBatchModeChange: (next: boolean) => void
  displayOpen: boolean
  onDisplayToggle: () => void
  onRetry: () => void
  onCreateAccount: () => void
  onImport: () => void
}

interface ToastState {
  id: number
  message: string
  undo?: () => void
}

function PageHead({
  device,
  dataState,
  count,
}: {
  device: DeviceMode
  dataState: DataState
  count: number
}) {
  const note =
    dataState === 'normal'
      ? `共 ${count} 笔 · 数据截至 ${TODAY.slice(5)}`
      : dataState === 'loading'
        ? '正在读取本地账本'
        : dataState === 'empty'
          ? '尚未开始记账'
          : '本地账本读取失败'

  if (device === 'mobile') {
    return (
      <p className="mb-tx-page-meta">
        {CURRENT_MONTH_LABEL} · {note}
      </p>
    )
  }

  return (
    <div className="mb-page-head">
      <h1 className="mb-page-title">流水</h1>
      <p className="mb-page-sub">{note}</p>
    </div>
  )
}

function Toolbar({
  query,
  type,
  advancedOpen,
  batchMode,
  displayOpen,
  showDisplay,
  onQuery,
  onType,
  onAdvancedToggle,
  onBatchToggle,
  onDisplayToggle,
  searchRef,
}: {
  query: string
  type: TypeFilter
  advancedOpen: boolean
  batchMode: boolean
  displayOpen: boolean
  showDisplay: boolean
  onQuery: (next: string) => void
  onType: (next: TypeFilter) => void
  onAdvancedToggle: () => void
  onBatchToggle: () => void
  onDisplayToggle: () => void
  searchRef: Ref<HTMLInputElement>
}) {
  return (
    <section className="mb-tx-toolbar" aria-label="流水工具栏">
      <div className="mb-tx-toolbar-row">
        <label className="mb-tx-search" htmlFor="mb-tx-search-input">
          <Search size={16} className="mb-tx-search-icon" aria-hidden="true" />
          <input
            ref={searchRef}
            id="mb-tx-search-input"
            className="mb-tx-search-input"
            type="search"
            placeholder="搜索备注、账户、分类…"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              className="mb-tx-search-clear"
              aria-label="清空搜索"
              onClick={() => onQuery('')}
            >
              <X size={14} />
            </button>
          )}
        </label>

        <div className="mb-tx-type-group" role="group" aria-label="类型筛选">
          {TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={option.value === type ? 'mb-tx-type is-active' : 'mb-tx-type'}
              aria-pressed={option.value === type}
              onClick={() => onType(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mb-tx-actions">
          <button
            type="button"
            className={advancedOpen ? 'mb-tx-btn is-toggle is-active' : 'mb-tx-btn is-toggle'}
            aria-expanded={advancedOpen}
            aria-controls="mb-tx-filter-panel"
            onClick={onAdvancedToggle}
          >
            <SlidersHorizontal size={15} />
            {advancedOpen ? '收起筛选' : '高级筛选'}
          </button>
          <button
            type="button"
            className={batchMode ? 'mb-tx-btn is-toggle is-active' : 'mb-tx-btn is-toggle'}
            aria-pressed={batchMode}
            onClick={onBatchToggle}
          >
            {batchMode ? '退出批量' : '批量'}
          </button>
          {showDisplay && (
            <button
              type="button"
              className={displayOpen ? 'mb-tx-btn is-toggle is-active' : 'mb-tx-btn is-toggle'}
              aria-expanded={displayOpen}
              aria-controls="mb-tx-display-panel"
              onClick={onDisplayToggle}
            >
              显示
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

function FilterChips({
  chips,
  onClear,
}: {
  chips: { key: string; label: string }[]
  onClear: (key: string) => void
}) {
  if (chips.length === 0) return null
  return (
    <div className="mb-tx-chips" aria-label="当前生效条件">
      {chips.map((chip) => (
        <button key={chip.key} type="button" className="mb-tx-chip" onClick={() => onClear(chip.key)}>
          {chip.label}
          <X size={12} />
        </button>
      ))}
      <button
        type="button"
        className="mb-tx-chip-clear"
        onClick={() => onClear('all')}
      >
        清除条件
      </button>
    </div>
  )
}

export function TransactionsPage({
  device,
  dataState,
  batchMode,
  onBatchModeChange,
  displayOpen,
  onDisplayToggle,
  onRetry,
  onCreateAccount,
  onImport,
}: TransactionsPageProps) {
  const { ledger, updateTransaction, deleteTransactions, setTransactionCategory, replaceLedger } = useLedger()
  const [query, setQuery] = useState('')
  const [type, setType] = useState<TypeFilter>('all')
  const [advanced, setAdvanced] = useState<AdvancedFilters>(EMPTY_ADVANCED)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [display, setDisplay] = useState<DisplaySettings>(readDisplaySettings)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [detailId, setDetailId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'category' | 'delete' | null>(null)
  const [toasts, setToasts] = useState<ToastState[]>([])
  const toastSeq = useRef(0)
  const toastTimers = useRef<number[]>([])
  const ledgerRef = useRef(ledger)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ledgerRef.current = ledger
  }, [ledger])

  useEffect(
    () => () => {
      toastTimers.current.forEach((timer) => window.clearTimeout(timer))
    },
    [],
  )

  useEffect(() => {
    if (!batchMode) setSelected(new Set())
  }, [batchMode])

  useEffect(() => {
    writeDisplaySettings(display)
  }, [display])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT'
      if (event.key === '/' && !typing) {
        event.preventDefault()
        searchRef.current?.focus()
      }
      if (event.key === 'Escape') {
        if (dialog) {
          setDialog(null)
          return
        }
        if (displayOpen) {
          onDisplayToggle()
          return
        }
        if (advancedOpen) {
          setAdvancedOpen(false)
          return
        }
        if (batchMode) onBatchModeChange(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [advancedOpen, batchMode, dialog, displayOpen, onBatchModeChange, onDisplayToggle])

  const filters = useMemo(() => ({ query, type, advanced }), [query, type, advanced])

  useEffect(() => {
    setSelected((current) => (current.size > 0 ? new Set() : current))
  }, [filters])

  const filtered = dataState === 'normal' ? filterTransactions(ledger, filters) : []
  const sorted =
    display.sort === 'amount'
      ? [...filtered].sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount))
      : filtered
  const groups = groupTransactions(sorted)
  const chips = filterChips(ledger, filters)
  const detail = detailId
    ? ledger.transactions.find((transaction) => transaction.id === detailId) ?? null
    : null
  const categoryRoots = ledger.categories.filter(
    (category) =>
      !category.parentId && (category.type === 'expense' || category.type === 'income'),
  )
  const selectedTransactions = ledger.transactions.filter((transaction) => selected.has(transaction.id))
  const selectedTypes = new Set(selectedTransactions.map((transaction) => transaction.type))
  const selectedType = selectedTypes.size === 1 ? [...selectedTypes][0] : null
  const canBatchCategory = selectedType === 'expense' || selectedType === 'income'
  const batchCategoryRoots = canBatchCategory
    ? categoryRoots.filter((category) => category.type === selectedType)
    : []
  const batchCategoryHint =
    selected.size > 0 && !canBatchCategory
      ? '含转账 / 退款 / 调整，或混选收支类型，不能批量改分类'
      : undefined

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback(
    (message: string, undo?: () => void) => {
      const id = toastSeq.current + 1
      toastSeq.current = id
      setToasts((current) => [...current, { id, message, undo }].slice(-3))
      const timer = window.setTimeout(() => dismissToast(id), 6000)
      toastTimers.current.push(timer)
    },
    [dismissToast],
  )

  const clearKey = (key: string) => {
    if (key === 'all') {
      setQuery('')
      setType('all')
      setAdvanced(EMPTY_ADVANCED)
      return
    }
    if (key === 'type') {
      setType('all')
      return
    }
    if (key === 'account') {
      setAdvanced((current) => ({ ...current, accountId: '' }))
      return
    }
    if (key === 'category') {
      setAdvanced((current) => ({ ...current, categoryId: '' }))
      return
    }
    if (key === 'amount') {
      setAdvanced((current) => ({ ...current, amountMin: '', amountMax: '' }))
      return
    }
    if (key === 'date') {
      setAdvanced((current) => ({ ...current, dateFrom: '', dateTo: '' }))
    }
  }

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = (id: string, patch: Parameters<typeof updateTransaction>[1]) => {
    const before = ledger.transactions.find((transaction) => transaction.id === id)
    updateTransaction(id, patch)
    notify(
      '已保存修改 · 账户余额与总览已同步',
      before
        ? () => {
            replaceLedger(restoreTransactionsInLedger(ledgerRef.current, [before]))
            notify('已撤销修改')
          }
        : undefined,
    )
  }

  const handleDelete = (id: string) => {
    const removed = ledger.transactions.filter((transaction) => transaction.id === id)
    deleteTransactions([id])
    setDetailId(null)
    notify('已删除 1 笔流水', () => {
      replaceLedger(restoreTransactionsInLedger(ledgerRef.current, removed))
      notify('已撤销删除')
    })
  }

  const confirmBatchDelete = () => {
    const ids = [...selected]
    const removed = ledger.transactions.filter((transaction) => ids.includes(transaction.id))
    deleteTransactions(ids)
    setDialog(null)
    onBatchModeChange(false)
    notify(`已删除 ${ids.length} 笔流水`, () => {
      replaceLedger(restoreTransactionsInLedger(ledgerRef.current, removed))
      notify('已撤销批量删除')
    })
  }

  const pickBatchCategory = (categoryId: string) => {
    const category = getCategory(ledger, categoryId)
    const ids = [...selected]
    const before = ledger.transactions
      .filter((transaction) => selected.has(transaction.id))
      .map((transaction) => ({ id: transaction.id, categoryId: transaction.categoryId }))
    setTransactionCategory(ids, categoryId)
    setDialog(null)
    notify(`已将 ${ids.length} 笔改为「${category?.name ?? '新分类'}」`, () => {
      replaceLedger(restoreTransactionCategoriesInLedger(ledgerRef.current, before))
      notify('已撤销分类修改')
    })
  }

  if (dataState === 'loading') {
    return (
      <>
        <PageHead device={device} dataState={dataState} count={0} />
        <LoadingSkeleton device={device} variant="transactions" />
      </>
    )
  }

  if (dataState === 'empty') {
    return (
      <>
        <PageHead device={device} dataState={dataState} count={0} />
        <ColdStartGuide variant="transactions" onPrimary={onCreateAccount} onImport={onImport} />
      </>
    )
  }

  if (dataState === 'error') {
    return (
      <>
        <PageHead device={device} dataState={dataState} count={0} />
        <ErrorPanel onRetry={onRetry} />
      </>
    )
  }

  if (ledger.transactions.length === 0) {
    return (
      <>
        <PageHead device={device} dataState={dataState} count={0} />
        <ColdStartGuide variant="transactions" onPrimary={onCreateAccount} onImport={onImport} />
      </>
    )
  }

  const noResults = filtered.length === 0 && ledger.transactions.length > 0

  return (
    <>
      <PageHead device={device} dataState={dataState} count={filtered.length} />

      <Toolbar
        query={query}
        type={type}
        advancedOpen={advancedOpen}
        batchMode={batchMode}
        displayOpen={displayOpen}
        showDisplay={device === 'desktop'}
        onQuery={setQuery}
        onType={setType}
        onAdvancedToggle={() => setAdvancedOpen((open) => !open)}
        onBatchToggle={() => onBatchModeChange(!batchMode)}
        onDisplayToggle={onDisplayToggle}
        searchRef={searchRef}
      />

      {device === 'desktop' && advancedOpen && (
        <DesktopFilterPanel
          ledger={ledger}
          value={advanced}
          onChange={setAdvanced}
          onReset={() => setAdvanced(EMPTY_ADVANCED)}
          onClose={() => setAdvancedOpen(false)}
        />
      )}

      {device === 'desktop' && displayOpen && (
        <DesktopDisplayPanel
          value={display}
          onChange={setDisplay}
          onReset={() => setDisplay(DEFAULT_DISPLAY)}
          onClose={onDisplayToggle}
        />
      )}

      <MobileFilterDrawer
        opened={device === 'mobile' && advancedOpen}
        device={device}
        ledger={ledger}
        value={advanced}
        onChange={setAdvanced}
        onReset={() => setAdvanced(EMPTY_ADVANCED)}
        onClose={() => setAdvancedOpen(false)}
      />

      <MobileDisplayDrawer
        opened={device === 'mobile' && displayOpen}
        device={device}
        value={display}
        onChange={setDisplay}
        onReset={() => setDisplay(DEFAULT_DISPLAY)}
        onClose={onDisplayToggle}
      />

      <FilterChips chips={chips} onClear={clearKey} />

      {noResults ? (
        <section className="mb-card mb-tx-noresult">
          <span className="mb-tx-noresult-mark" aria-hidden="true">
            <Search size={22} />
          </span>
          <h2 className="mb-tx-noresult-title">没有匹配的记录</h2>
          <p className="mb-tx-noresult-desc">
            试试更短的关键词，或清除类型、账户、日期、金额条件。
          </p>
          <button
            type="button"
            className="mb-tx-btn"
            onClick={() => {
              setQuery('')
              setType('all')
              setAdvanced(EMPTY_ADVANCED)
            }}
          >
            清空筛选
          </button>
        </section>
      ) : (
        <TransactionsList
          device={device}
          groups={groups}
          ledger={ledger}
          batchMode={batchMode}
          display={display}
          selected={selected}
          onToggle={toggleSelected}
          onOpenDetail={setDetailId}
        />
      )}

      {batchMode && (
        <BatchBar
          device={device}
          count={selected.size}
          categoryDisabled={!canBatchCategory}
          categoryHint={batchCategoryHint}
          onCategory={() => setDialog('category')}
          onDelete={() => setDialog('delete')}
          onExit={() => onBatchModeChange(false)}
        />
      )}

      <TransactionDetailPanel
        transaction={detail}
        ledger={ledger}
        device={device}
        onClose={() => setDetailId(null)}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      <BatchCategoryDialog
        opened={dialog === 'category'}
        device={device}
        count={selected.size}
        categories={batchCategoryRoots}
        onPick={pickBatchCategory}
        onClose={() => setDialog(null)}
      />

      <BatchDeleteDialog
        opened={dialog === 'delete'}
        device={device}
        count={selected.size}
        onConfirm={confirmBatchDelete}
        onClose={() => setDialog(null)}
      />

      {toasts.length > 0 && (
        <div className="mb-tx-toast-stack">
          {toasts.map((toast) => (
            <div key={toast.id} className="mb-tx-toast" role="status">
              <span>{toast.message}</span>
              {toast.undo && (
                <button
                  type="button"
                  className="mb-tx-toast-action"
                  onClick={() => {
                    toast.undo?.()
                    dismissToast(toast.id)
                  }}
                >
                  撤销
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <span className="mb-visually-hidden" aria-live="polite">
        当前筛选 {filtered.length} 笔，共 {ledger.transactions.length} 笔
      </span>
    </>
  )
}
