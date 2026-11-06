import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { useLedger } from '@/features/overview/ledgerStore'
import {
  CURRENT_MONTH_LABEL,
  TODAY,
  findTransactionDeep,
  getCategory,
  getCategoryName,
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
import { useServerTransactions } from './apiTransactions'
import type { LedgerMutationOutcome } from '@/features/overview/ledgerStore'
import {
  EMPTY_ADVANCED,
  TYPE_OPTIONS,
  filterChips,
  filterTransactions,
  groupTransactions,
  hasActiveFilters,
  readFiltersFromSearch,
  splitTotalsByToday,
  writeFiltersToSearch,
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
  periodLabel,
}: {
  device: DeviceMode
  dataState: DataState
  count: number
  periodLabel: string
}) {
  // 页头「共 N 笔」已是本月口径（不含未来）；未来记录在列表里以「未来」分组自证。
  const note =
    dataState === 'normal'
      ? `共 ${count} 笔`
      : dataState === 'loading'
        ? '正在读取本地账本'
        : dataState === 'empty'
          ? '尚未开始记账'
          : '本地账本读取失败'

  if (device === 'mobile') {
    return (
      <p className="mb-tx-page-meta">
        {periodLabel} · {note}
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
  const { ledger, dataMode, updateTransaction, deleteTransactions, setTransactionCategory, linkRefund, undo } = useLedger()
  const apiMode = dataMode === 'api'
  // 筛选写入 URL：返回列表（含报表下钻）时还原分类/期间，避免静默丢失。
  // API 账本异步到达：分类/账户要等账本就绪才能校验。先冻结进入时的 query，
  // 待分类可用后一次性初始化——否则深链里的分类会被误判为无效，随后 URL 回写把它抹掉。
  const initialSearch = useRef(typeof window === 'undefined' ? '' : window.location.search)
  const [hydrated, setHydrated] = useState(false)
  const [query, setQuery] = useState('')
  const [type, setType] = useState<TypeFilter>('all')
  const [advanced, setAdvanced] = useState<AdvancedFilters>(EMPTY_ADVANCED)
  const [restoreNotice, setRestoreNotice] = useState<string[]>([])
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [display, setDisplay] = useState<DisplaySettings>(readDisplaySettings)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [detailId, setDetailId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'category' | 'delete' | null>(null)
  const [toasts, setToasts] = useState<ToastState[]>([])
  const toastSeq = useRef(0)
  const toastTimers = useRef<number[]>([])
  const searchRef = useRef<HTMLInputElement>(null)

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

  // 深链还原：账本就绪后一次性初始化筛选，并回到列表顶部（不沿用上一页滚动位置）。
  // API 模式下 dataState 翻到 normal 的那一帧，LedgerProvider 可能还持有上一帧的
  // EMPTY_LEDGER（initialLedger 通过 effect 同步），此时分类为空，深链分类会被误丢。
  // 用真实账本独有的 ids 映射判断就绪，确保 hydration 读到的是同一份分类。
  const ledgerReady = apiMode
    ? ledger.ids !== undefined
    : ledger.categories.length > 0

  useEffect(() => {
    if (hydrated || !ledgerReady) return
    const restored = readFiltersFromSearch(initialSearch.current, ledger)
    setQuery(restored.filters.query)
    setType(restored.filters.type)
    setAdvanced(restored.filters.advanced)
    setRestoreNotice(restored.dropped)
    setHydrated(true)
    if (hasActiveFilters(restored.filters)) {
      window.scrollTo(0, 0)
      const mobileScroll = document.querySelector('.mb-mobile-scroll')
      if (mobileScroll instanceof HTMLElement) mobileScroll.scrollTop = 0
    }
  }, [hydrated, ledgerReady, ledger])

  // URL 是筛选状态的唯一持久层：切页回来、报表下钻都从同一组 query 键还原。
  useEffect(() => {
    if (!hydrated) return
    const search = writeFiltersToSearch(window.location.search, filters)
    const next = `${window.location.pathname}${search}`
    if (next === `${window.location.pathname}${window.location.search}`) return
    window.history.replaceState(window.history.state, '', next)
  }, [filters, hydrated])

  // API 模式：筛选与分页都交给 /transactions，页面不再本地过滤一遍。
  // 必须等 hydration 完成后再请求：否则先按空筛选取一轮，再按深链筛选取一轮（双取）。
  const serverList = useServerTransactions(
    filters,
    ledger,
    apiMode && dataState === 'normal' && hydrated,
  )
  const filtered =
    dataState !== 'normal'
      ? []
      : apiMode
        ? serverList.items
        : filterTransactions(ledger, filters)
  const sorted =
    display.sort === 'amount'
      ? [...filtered].sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount))
      : filtered
  // 「本月/未来」以真实账本的今天为准；种子版仍用固定 TODAY，视觉不变。
  const today = ledger.snapshot?.today ?? TODAY
  const periodLabel = ledger.snapshot?.periodLabel ?? CURRENT_MONTH_LABEL
  const groups = groupTransactions(sorted, today)
  const { current: monthTotals, future: futureTotals } = splitTotalsByToday(filtered, today)
  const chips = filterChips(ledger, filters)
  // 关联对方可能不在当前筛选结果里，但一定作为 relatedTransaction/refunds 嵌在行上；
  // 递归查找让「退款 → 原交易」「原交易 → 退款」都能直接打开详情。
  const detail = detailId
    ? findTransactionDeep([...filtered, ...ledger.transactions], detailId) ?? null
    : null
  const categoryRoots = ledger.categories.filter(
    (category) =>
      !category.parentId && (category.type === 'expense' || category.type === 'income'),
  )
  const selectedTransactions = filtered.filter((transaction) => selected.has(transaction.id))
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
  // 批量条要指出「异类」是谁，而不是只给一句概括理由。
  const excludedFromBatch = selectedTransactions
    .filter((transaction) => transaction.type !== 'expense')
    .map((transaction) => ({
      id: transaction.id,
      label: getCategoryName(ledger, transaction.categoryId),
      reason:
        TYPE_OPTIONS.find((option) => option.value === transaction.type)?.label ?? transaction.type,
    }))
  const selectExpenseOnly = () => {
    setSelected(
      new Set(
        selectedTransactions
          .filter((transaction) => transaction.type === 'expense')
          .map((transaction) => transaction.id),
      ),
    )
  }

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
      setAdvanced((current) => ({ ...current, categoryId: '', categoryIds: [] }))
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

  const runUndo = (token: string, message: string) => {
    void undo(token).then((result) =>
      notify(result.ok ? message : `撤销失败：${result.error ?? '请重试'}`),
    )
  }

  const handleSave = async (
    id: string,
    patch: Parameters<typeof updateTransaction>[1],
  ): Promise<LedgerMutationOutcome> => {
    const result = await updateTransaction(id, patch)
    if (!result.ok) {
      notify(`保存失败：${result.error ?? '请重试'}`)
      return result
    }
    notify(
      '已保存修改 · 账户余额与总览已同步',
      result.undoToken ? () => runUndo(result.undoToken!, '已撤销修改') : undefined,
    )
    return result
  }

  const handleDelete = async (id: string): Promise<LedgerMutationOutcome> => {
    const result = await deleteTransactions([id])
    if (!result.ok) {
      notify(`删除失败：${result.error ?? '请重试'}`)
      return result
    }
    setDetailId(null)
    notify(
      `已删除 ${result.succeeded} 笔流水`,
      result.undoToken ? () => runUndo(result.undoToken!, '已撤销删除') : undefined,
    )
    return result
  }

  const handleLinkRefund = async (
    id: string,
    originalId: string | null,
  ): Promise<LedgerMutationOutcome> => {
    const result = await linkRefund(id, originalId)
    if (!result.ok) {
      notify(`关联失败：${result.error ?? '请重试'}`)
      return result
    }
    notify(originalId ? '已关联原交易' : '已解除原交易关联')
    return result
  }

  const handleOpenRelated = (transaction: { id: string }) => {
    setDetailId(transaction.id)
  }

  const confirmBatchDelete = async (): Promise<LedgerMutationOutcome> => {
    const ids = [...selected]
    const result = await deleteTransactions(ids)
    if (!result.ok) {
      // 部分成功时把选中集合收敛到失败条目，重试只处理剩余流水。
      if (result.succeeded > 0) setSelected(new Set(result.failedIds))
      return result
    }
    setDialog(null)
    onBatchModeChange(false)
    notify(
      `已删除 ${result.succeeded} 笔流水`,
      result.undoToken ? () => runUndo(result.undoToken!, '已撤销批量删除') : undefined,
    )
    return result
  }

  const pickBatchCategory = async (categoryId: string): Promise<LedgerMutationOutcome> => {
    const category = getCategory(ledger, categoryId)
    const ids = [...selected]
    const result = await setTransactionCategory(ids, categoryId)
    if (!result.ok) return result
    setDialog(null)
    notify(
      `已将 ${result.succeeded} 笔改为「${category?.name ?? '新分类'}」`,
      result.undoToken ? () => runUndo(result.undoToken!, '已撤销分类修改') : undefined,
    )
    return result
  }

  if (dataState === 'loading' || (apiMode && serverList.status === 'loading')) {
    return (
      <>
        <PageHead device={device} dataState={dataState} count={0} periodLabel={periodLabel} />
        <LoadingSkeleton device={device} variant="transactions" />
      </>
    )
  }

  if (dataState === 'empty') {
    return (
      <>
        <PageHead device={device} dataState={dataState} count={0} periodLabel={periodLabel} />
        <ColdStartGuide variant="transactions" onPrimary={onCreateAccount} onImport={onImport} />
      </>
    )
  }

  if (dataState === 'error' || (apiMode && serverList.status === 'error')) {
    return (
      <>
        <PageHead device={device} dataState={dataState} count={0} periodLabel={periodLabel} />
        <ErrorPanel
          onRetry={() => {
            serverList.refetch()
            onRetry()
          }}
        />
      </>
    )
  }

  if (ledger.transactions.length === 0) {
    return (
      <>
        <PageHead device={device} dataState={dataState} count={0} periodLabel={periodLabel} />
        <ColdStartGuide variant="transactions" onPrimary={onCreateAccount} onImport={onImport} />
      </>
    )
  }

  const noResults = filtered.length === 0 && ledger.transactions.length > 0

  return (
    <>
      <PageHead device={device} dataState={dataState} count={monthTotals.count} periodLabel={periodLabel} />

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

      {restoreNotice.length > 0 && (
        <div className="mb-tx-restore-note" role="status">
          部分筛选条件未能还原：{restoreNotice.join('、')}。
        </div>
      )}
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
          today={today}
          batchMode={batchMode}
          display={display}
          selected={selected}
          onToggle={toggleSelected}
          onOpenDetail={setDetailId}
          onOpenRelated={handleOpenRelated}
        />
      )}

      {batchMode && (
        <BatchBar
          device={device}
          count={selected.size}
          excluded={excludedFromBatch}
          categoryDisabled={!canBatchCategory}
          categoryHint={batchCategoryHint}
          onCategory={() => setDialog('category')}
          onDelete={() => setDialog('delete')}
          onSelectExpenseOnly={selectExpenseOnly}
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
        apiMode={apiMode}
        onOpenTransaction={handleOpenRelated}
        onLinkRefund={handleLinkRefund}
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
        当前筛选 {monthTotals.count} 笔
        {futureTotals.count > 0 ? `，另有 ${futureTotals.count} 笔未来不计入本月` : ''}，共{' '}
        {apiMode ? serverList.total : ledger.transactions.length} 笔
      </span>
    </>
  )
}
