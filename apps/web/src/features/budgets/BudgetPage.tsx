import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, TriangleAlert } from 'lucide-react'
import { useLedger } from '@/features/overview/ledgerStore'
import type { LedgerBudgetInput } from '@/features/overview/ledgerStore'
import { ledgerAnchorDay } from '@/features/overview/model'
import type { LedgerBudget } from '@/features/overview/model'
import { budgetApi } from '@/services/api'
import { unwrapApiData } from '@/services/apiResult'
import { amountText, percentText } from '@/features/overview/format'
import { BudgetProgress } from '@/features/shared/BudgetProgress'
import { HfSegmented } from '@/features/shared/HfSegmented'
import { HfSheet } from '@/features/shared/HfSheet'
import { HfSwitch } from '@/features/shared/HfSwitch'
import { accountDisplayName } from '@/features/shared/accountIdentity'
import { ErrorPanel, LoadingSkeleton } from '@/features/shared/StateViews'
import type { Budget } from '@contracts/types'
import type { DataState, DeviceMode } from '@/features/shared/types'
import {
  BUDGET_KIND_LABEL,
  BUDGET_PERIOD_LABEL,
  deriveBudgetPage,
  monthLabel,
  shiftMonth,
} from './budgetModel'
import type { BudgetKind, BudgetPageData, BudgetPageRow } from './budgetModel'
import '../overview/overview.css'
import '../overview/overlays.css'
import './budgets.css'

interface BudgetPageProps {
  device: DeviceMode
  dataState: DataState
  editorOpen: boolean
  onEditorOpenChange: (open: boolean) => void
  onRetry: () => void
  onViewFlow: (categoryId?: string) => void
  /** 第二个参数为撤销动作；API 模式删除后 6 秒内可撤销。 */
  notify: (message: string, action?: () => void) => void
}

function moneyText(value: number): string {
  return amountText(Math.max(0, value))
}

function MonthBar({
  month,
  onChange,
  compact,
  currentMonth,
  hasData,
}: {
  month: string
  onChange: (next: string) => void
  compact?: boolean
  currentMonth: string
  hasData: (month: string) => boolean
}) {
  const isCurrent = month === currentMonth
  const nextMonth = shiftMonth(month, 1)
  const nextHasData = hasData(nextMonth)
  return (
    <div className={`mb-bg-month${compact ? ' is-compact' : ''}`} role="group" aria-label="预算月份">
      <button
        type="button"
        className="mb-bg-month-btn"
        aria-label="上一个月"
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <ChevronLeft size={16} />
      </button>
      <span className="mb-bg-month-label">{monthLabel(month)}</span>
      <button
        type="button"
        className="mb-bg-month-btn"
        aria-label="下一个月"
        disabled={!nextHasData}
        aria-disabled={!nextHasData}
        title={nextHasData ? undefined : `${monthLabel(nextMonth)}没有流水，暂不可切换`}
        onClick={() => onChange(nextMonth)}
      >
        <ChevronRight size={16} />
      </button>
      {!nextHasData && (
        <span className="mb-bg-month-reason">{monthLabel(nextMonth)}无流水</span>
      )}
      {!isCurrent && (
        <button type="button" className="mb-link-btn mb-bg-month-today" onClick={() => onChange(currentMonth)}>
          回到本月
        </button>
      )}
    </div>
  )
}

function Ring({ percent, level, size }: { percent: number; level: string; size: 'lg' | 'sm' }) {
  const value = Math.min(100, Math.max(0, percent))
  const ink =
    level === 'over'
      ? 'var(--mb-progress-over)'
      : level === 'warning'
        ? 'var(--mb-progress-warning)'
        : 'var(--mb-color-accent)'
  return (
    <div
      className={`mb-bg-ring is-${size}`}
      style={{
        background: `conic-gradient(${ink} ${value}%, var(--mb-color-surface-sunken) 0)`,
      }}
      aria-hidden
    >
      <div className="mb-bg-ring-inner">
        <span className="mb-bg-ring-label">已用</span>
        <strong className="mb-bg-ring-value">{percentText(percent, false)}</strong>
      </div>
    </div>
  )
}

function Hero({ data, device }: { data: BudgetPageData; device: DeviceMode }) {
  const { expense, primaryOver } = data
  if (expense.limit === 0) {
    return (
      <section className="mb-card mb-bg-hero is-empty">
        <h2 className="mb-sec-title">本月支出预算</h2>
        <p className="mb-bg-hero-empty">
          {data.disabledExpenseCount > 0
            ? `支出预算已全部停用（${data.disabledExpenseCount} 条）；启用后才会显示可花金额与告警。`
            : '还没有设置支出预算，新增第一条后会在这里显示可花金额。'}
        </p>
      </section>
    )
  }
  // 单项超支优先于总比例：头部徽标与「需要关注」必须给同一结论。
  const badge =
    data.over.length > 0
      ? { level: 'over' as const, text: `${data.over.length} 项超支`, icon: true }
      : data.near.length > 0
        ? { level: 'warning' as const, text: `${data.near.length} 项接近上限`, icon: true }
        : {
            level: expense.level === 'warning' ? ('warning' as const) : ('normal' as const),
            text: '按计划',
            icon: false,
          }

  return (
    <section className="mb-card mb-bg-hero">
      <Ring percent={expense.percent} level={expense.level} size={device === 'mobile' ? 'sm' : 'lg'} />
      <div className="mb-bg-hero-copy">
        <div className="mb-sec-head">
          <div>
            <h2 className="mb-sec-title">本月支出预算</h2>
            <p className="mb-sec-desc">
              {data.groups[0].rows.length} 个分类 · 已用 {percentText(expense.percent, false)}
            </p>
          </div>
          <span className="mb-bg-hero-badge" data-level={badge.level}>
            {badge.icon && <TriangleAlert size={13} aria-hidden="true" />}
            {badge.text}
          </span>
        </div>
        <p className="mb-bg-hero-amount">
          {moneyText(Math.max(0, expense.remaining))}
          <span className="mb-bg-hero-unit"> 可花</span>
        </p>
        <div className="mb-bg-hero-meta">
          <span>已用 {moneyText(expense.used)}</span>
          <span>总预算 {moneyText(expense.limit)}</span>
        </div>
        {primaryOver && (
          <p className="mb-bg-overrun" data-level="over">
            {primaryOver.name} 已超支 {moneyText(primaryOver.used - primaryOver.limit)}（
            {moneyText(primaryOver.used)} / {moneyText(primaryOver.limit)}）
          </p>
        )}
      </div>
    </section>
  )
}

function WatchGroup({ data, onOpen }: { data: BudgetPageData; onOpen: (row: BudgetPageRow) => void }) {
  if (data.over.length === 0 && data.near.length === 0) return null
  return (
    <section className="mb-card mb-bg-watch">
      <div className="mb-sec-head">
        <div>
          <h2 className="mb-sec-title">需要关注</h2>
          <p className="mb-sec-desc">超支 {data.over.length} 条 · 接近上限 {data.near.length} 条</p>
        </div>
      </div>
      <div className="mb-bg-watch-grid">
        <div className="mb-bg-watch-col" data-level="over">
          <h3 className="mb-bg-watch-title">已超支</h3>
          {data.over.length === 0 ? (
            <p className="mb-bg-watch-empty">没有超支条目</p>
          ) : (
            data.over.map((row) => (
              <button key={row.id} type="button" className="mb-bg-watch-row" onClick={() => onOpen(row)}>
                <span className="mb-bg-watch-name">{row.name}</span>
                <span className="mb-bg-watch-status">{row.status}</span>
              </button>
            ))
          )}
        </div>
        <div className="mb-bg-watch-col" data-level="warning">
          <h3 className="mb-bg-watch-title">接近上限</h3>
          {data.near.length === 0 ? (
            <p className="mb-bg-watch-empty">没有接近上限条目</p>
          ) : (
            data.near.map((row) => (
              <button key={row.id} type="button" className="mb-bg-watch-row" onClick={() => onOpen(row)}>
                <span className="mb-bg-watch-name">{row.name}</span>
                <span className="mb-bg-watch-status">{row.status}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </section>
  )
}

function GroupSection({ data, onOpen }: { data: BudgetPageData; onOpen: (row: BudgetPageRow) => void }) {
  return (
    <>
      {data.groups.map((group) => {
        if (group.rows.length === 0) return null
        const activeRows = group.rows.filter((row) => row.isActive)
        const disabled = group.rows.length - activeRows.length
        return (
          <section key={group.type} className="mb-card mb-bg-group" data-type={group.type}>
            <div className="mb-sec-head">
              <div>
                <h2 className="mb-sec-title">{group.label}</h2>
                <p className="mb-sec-desc">
                  {group.rows.length} 个条目{disabled > 0 ? ` · 已停用 ${disabled}` : ''}
                </p>
              </div>
              <span className="mb-bg-group-total">
                {moneyText(activeRows.reduce((total, row) => total + row.limit, 0))}
              </span>
            </div>
            <div className="mb-bg-rows">
              {group.rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="mb-bg-row"
                  data-active={row.isActive ? undefined : 'false'}
                  onClick={() => onOpen(row)}
                >
                  <div className="mb-bg-row-top">
                    <span className="mb-bg-name">
                      {row.name}
                      {!row.isActive && <span className="mb-bg-inactive-tag">已停用</span>}
                    </span>
                    <span className="mb-bg-status" data-level={row.level}>
                      {(row.level === 'warning' || row.level === 'over') && row.isActive && (
                        <TriangleAlert size={12} strokeWidth={2} aria-hidden="true" />
                      )}
                      {row.isActive ? row.status : '不计入预算'}
                    </span>
                  </div>
                  <BudgetProgress
                    level={row.level}
                    percent={row.percent}
                    neutralFill={row.type === 'income'}
                    label={
                      row.type === 'transfer'
                        ? `${row.name} 不计入预算`
                        : `${row.name} 预算使用 ${Math.round(row.percent)}%`
                    }
                  />
                  <div className="mb-bg-row-meta">
                    <span className="mb-bg-row-tags">
                      {row.categoryName} · {BUDGET_PERIOD_LABEL[row.period]} · {row.accountName}
                    </span>
                    <span className="mb-bg-row-money">
                      {moneyText(row.used)} / {moneyText(row.limit)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </>
  )
}

function EmptyPage({ onAdd }: { onAdd: () => void }) {
  return (
    <section className="mb-card mb-bg-empty">
      <div className="mb-bg-empty-mark" aria-hidden>
        <Plus size={22} />
      </div>
      <h2 className="mb-sec-title">还没有预算</h2>
      <p className="mb-bg-empty-copy">
        为支出设置上限、为收入设置目标、为转账记录计划。第一条预算建好后，这一页会显示「可花多少」、
        接近上限与超支提醒。
      </p>
      <button type="button" className="mb-primary-btn" onClick={onAdd}>
        新增预算条目
      </button>
    </section>
  )
}

interface EditorState {
  name: string
  type: BudgetKind
  period: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  amount: string
  categoryId: string
  accountId: string
  /** 仅转账预算：转入账户。 */
  toAccountId: string
}

const EMPTY_EDITOR: EditorState = {
  name: '',
  type: 'expense',
  period: 'monthly',
  amount: '',
  categoryId: '',
  accountId: '',
  toAccountId: '',
}

export function BudgetPage({
  device,
  dataState,
  editorOpen,
  onEditorOpenChange,
  onRetry,
  onViewFlow,
  notify,
}: BudgetPageProps) {
  const { ledger, dataMode, createBudget, updateBudget, deleteBudget: removeBudget, undo } = useLedger()
  // 锚点跟真实数据走：API 模式用真实今天 / 最新流水，不再停在种子的 2026-10。
  const anchorDay = ledgerAnchorDay(ledger)
  const currentMonth = anchorDay.slice(0, 7)
  const [monthOverride, setMonthOverride] = useState<string | null>(null)
  const month = monthOverride ?? currentMonth
  const setMonth = setMonthOverride
  const hasMonthData = useMemo(() => {
    const present = new Set(ledger.transactions.map((transaction) => transaction.date.slice(0, 7)))
    return (target: string) => present.has(target)
  }, [ledger.transactions])
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailLimit, setDetailLimit] = useState('')
  const [detailNote, setDetailNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR)
  const [editorError, setEditorError] = useState('')
  // 写请求进行中禁掉再次提交，避免一次点击落两条预算。
  const [saving, setSaving] = useState(false)
  // 预算启停属于后端 Budget 字段，账本实体不携带 isActive；单独按 id 取真实值。
  const [activeById, setActiveById] = useState<Map<string, boolean>>()

  const data = useMemo(
    () => deriveBudgetPage(ledger, month, { today: anchorDay, currentMonth, activeById }),
    [ledger, month, anchorDay, currentMonth, activeById],
  )
  const detail = detailId ? data.groups.flatMap((group) => group.rows).find((row) => row.id === detailId) : undefined

  useEffect(() => {
    if (editorOpen) {
      setEditor(EMPTY_EDITOR)
      setEditorError('')
    }
  }, [editorOpen])

  const openDetail = (row: BudgetPageRow) => {
    setDetailId(row.id)
    setDetailLimit((row.limit / 100).toFixed(2).replace(/\.00$/, ''))
    setDetailNote('')
    setConfirmDelete(false)
  }

  const apiMode = dataMode === 'api'

  // 真实模式下读一次后端 isActive；种子数据没有该字段，保持 undefined（按启用处理）。
  useEffect(() => {
    if (!apiMode) {
      setActiveById(undefined)
      return
    }
    let cancelled = false
    void Promise.resolve(budgetApi.getAll())
      .then((response) => (response ? unwrapApiData(response) : []))
      .then((budgets) => {
        if (!cancelled) {
          setActiveById(new Map(budgets.map((budget) => [budget.id, budget.isActive])))
        }
      })
      .catch(() => {
        // 读取失败不阻断预算页：按启用展示，写操作仍会给出各自错误。
      })
    return () => {
      cancelled = true
    }
  }, [apiMode, ledger.budgets])

  /** 现有预算 + 新限额 → 写接口入参（真实后端 PUT 要求完整字段）。 */
  const toBudgetInput = (budget: LedgerBudget, limit: number): LedgerBudgetInput => ({
    name: budget.name,
    type: budget.type as LedgerBudgetInput['type'],
    period: budget.period,
    limit,
    categoryId: budget.categoryId,
    accountId: budget.accountId,
  })

  /** 真实后端 PUT 的原始字段：金额字段名是 amount（整数分），分类 id 要还原成后端真实 id。 */
  const toBudgetBody = (budget: LedgerBudget, amount: number): Partial<Budget> => ({
    name: budget.name,
    type: budget.type as Budget['type'],
    period: budget.period as Budget['period'],
    amount: amount as Budget['amount'],
    categoryId: budget.categoryId
      ? (ledger.ids?.categoryReal?.[budget.categoryId] ?? budget.categoryId)
      : undefined,
    accountId: budget.accountId,
  })

  const toggleActive = async () => {
    if (!detail || saving || !apiMode) return
    const budget = ledger.budgets.find((item) => item.id === detail.id)
    if (!budget) {
      setDetailNote('预算条目已不存在，请关闭后重试')
      return
    }
    const next = !detail.isActive
    setSaving(true)
    try {
      unwrapApiData(
        await budgetApi.update(detail.id, { ...toBudgetBody(budget, budget.limit), isActive: next }),
      )
      // 头部合计 / 需要关注 / 启停标签都依赖同一份后端 isActive：先就地更新，避免等待重读。
      setActiveById((current) => new Map<string, boolean>(current ?? []).set(detail.id, next))
      setDetailNote(next ? '已启用，该预算恢复计入预算与告警' : '已停用，该预算不再计入预算与告警')
      notify(`已${next ? '启用' : '停用'}预算「${detail.name}」`)
    } catch (error) {
      setDetailNote(`保存失败：${error instanceof Error ? error.message : '请重试'}`)
    } finally {
      setSaving(false)
    }
  }

  const saveLimit = async () => {
    if (!detail || saving) return
    const value = Math.round(Number(detailLimit) * 100)
    if (!Number.isFinite(value) || value <= 0) {
      setDetailNote('限额需大于 0')
      return
    }
    const budget = ledger.budgets.find((item) => item.id === detail.id)
    if (!budget) {
      setDetailNote('预算条目已不存在，请关闭后重试')
      return
    }
    setSaving(true)
    const result = await updateBudget(detail.id, toBudgetInput(budget, value))
    setSaving(false)
    if (!result.ok) {
      setDetailNote(`保存失败：${result.error ?? '请重试'}`)
      return
    }
    setDetailNote('已保存')
    notify(`已把「${detail.name}」限额调整为 ${moneyText(value)}`)
  }

  const deleteBudget = async () => {
    if (!detail || saving) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      setDetailNote('再次点击确认删除该预算条目')
      return
    }
    setSaving(true)
    const result = await removeBudget(detail.id)
    setSaving(false)
    if (!result.ok) {
      setDetailNote(`删除失败：${result.error ?? '请重试'}`)
      return
    }
    const name = detail.name
    setDetailId(null)
    notify(
      `已删除预算「${name}」`,
      result.undoToken
        ? () => {
            void undo(result.undoToken!).then((outcome) =>
              notify(outcome.ok ? '已撤销删除' : `撤销失败：${outcome.error ?? '请重试'}`),
            )
          }
        : undefined,
    )
  }

  const adjustToActual = async () => {
    if (!detail || saving) return
    const budget = ledger.budgets.find((item) => item.id === detail.id)
    if (!budget) {
      setDetailNote('预算条目已不存在，请关闭后重试')
      return
    }
    setSaving(true)
    const result = await updateBudget(detail.id, toBudgetInput(budget, detail.used))
    setSaving(false)
    if (!result.ok) {
      setDetailNote(`调整失败：${result.error ?? '请重试'}`)
      return
    }
    setDetailNote('已按实际调整')
    notify(`已按实际把「${detail.name}」上限调整为 ${moneyText(detail.used)}`)
  }

  const saveEditor = async () => {
    if (saving) return
    const amount = Math.round(Number(editor.amount) * 100)
    if (!editor.name.trim()) {
      setEditorError('请填写预算名称')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setEditorError('请填写大于 0 的金额')
      return
    }
    // 真实后端要求预算必须绑定账户与分类；在这里先讲清楚，避免提交后静默失败。
    if (apiMode && !editor.categoryId) {
      setEditorError('真实账本要求预算绑定分类，请选择分类')
      return
    }
    if (apiMode && !editor.accountId) {
      setEditorError('真实账本要求预算绑定账户，请选择账户')
      return
    }
    if (apiMode && editor.type === 'transfer' && !editor.toAccountId) {
      setEditorError('转账预算需要选择转入账户')
      return
    }
    const category = ledger.categories.find((item) => item.id === editor.categoryId)
    setSaving(true)
    const result = await createBudget({
      name: editor.name.trim(),
      type: editor.type,
      period: editor.period,
      limit: amount,
      categoryId: editor.categoryId || undefined,
      accountId: editor.accountId || undefined,
      toAccountId: editor.type === 'transfer' ? editor.toAccountId || undefined : undefined,
    })
    setSaving(false)
    if (!result.ok) {
      setEditorError(`保存失败：${result.error ?? '请重试'}`)
      return
    }
    onEditorOpenChange(false)
    notify(`已新增预算「${editor.name.trim()}」${category ? `，分类 ${category.name}` : ''}`)
  }

  if (dataState === 'loading') {
    return (
      <>
        <BudgetPageHead
          device={device}
          data={data}
          month={month}
          onMonth={setMonth}
          onAdd={() => onEditorOpenChange(true)}
          currentMonth={currentMonth}
          hasData={hasMonthData}
        />
        <LoadingSkeleton device={device} />
      </>
    )
  }

  if (dataState === 'error') {
    return (
      <>
        <BudgetPageHead
          device={device}
          data={data}
          month={month}
          onMonth={setMonth}
          onAdd={() => onEditorOpenChange(true)}
          currentMonth={currentMonth}
          hasData={hasMonthData}
        />
        <ErrorPanel onRetry={onRetry} />
      </>
    )
  }

  if (ledger.budgets.length === 0 || dataState === 'empty') {
    return (
      <>
        <BudgetPageHead
          device={device}
          data={data}
          month={month}
          onMonth={setMonth}
          onAdd={() => onEditorOpenChange(true)}
          currentMonth={currentMonth}
          hasData={hasMonthData}
          empty
        />
        <EmptyPage onAdd={() => onEditorOpenChange(true)} />
        <BudgetEditor
          opened={editorOpen}
          device={device}
          state={editor}
          ledger={ledger}
          error={editorError}
          saving={saving}
          apiMode={apiMode}
          onChange={setEditor}
          onClose={() => onEditorOpenChange(false)}
          onSave={saveEditor}
        />
      </>
    )
  }

  return (
    <div className="mb-bg-page" data-device={device}>
      <BudgetPageHead
        device={device}
        data={data}
        month={month}
        onMonth={setMonth}
        onAdd={() => onEditorOpenChange(true)}
        currentMonth={currentMonth}
        hasData={hasMonthData}
      />

      {device === 'mobile' && (
        <div className="mb-bg-mobile-month">
          <MonthBar
            month={month}
            onChange={setMonth}
            compact
            currentMonth={currentMonth}
            hasData={hasMonthData}
          />
        </div>
      )}

      <Hero data={data} device={device} />
      <WatchGroup data={data} onOpen={openDetail} />
      <GroupSection data={data} onOpen={openDetail} />

      <HfSheet
        variant="budget"
        device={device}
        opened={Boolean(detail)}
        onClose={() => setDetailId(null)}
        zIndex={300}
        contentClassName="mb-bg-detail"
        mobileSize="100%"
        title={
          <div className="mb-overlay-title-copy">
            <span className="mb-overlay-title">{detail?.name ?? '预算详情'}</span>
            <span className="mb-overlay-sub">
              {detail ? `${BUDGET_KIND_LABEL[detail.type]} · ${BUDGET_PERIOD_LABEL[detail.period]}` : ''}
            </span>
          </div>
        }
      >
        {detail && (
          <>
            <div className="mb-bg-detail-amounts">
              <span className="mb-bg-detail-used">{moneyText(detail.used)}</span>
              <span className="mb-bg-detail-divider">/</span>
              <span className="mb-bg-detail-limit">{moneyText(detail.limit)}</span>
              <span className="mb-bg-status" data-level={detail.level}>
                {(detail.level === 'warning' || detail.level === 'over') && (
                  <TriangleAlert size={12} strokeWidth={2} aria-hidden="true" />
                )}
                {detail.status}
              </span>
            </div>
            <BudgetProgress
              level={detail.level}
              percent={detail.percent}
              neutralFill={detail.type === 'income'}
              label={detail.type === 'transfer' ? '不计入预算' : '预算使用进度'}
            />
            <dl className="mb-bg-detail-meta">
              <div>
                <dt>分类</dt>
                <dd>{detail.categoryName}</dd>
              </div>
              <div>
                <dt>账户</dt>
                <dd>{detail.accountName}</dd>
              </div>
              <div>
                <dt>周期</dt>
                <dd>{BUDGET_PERIOD_LABEL[detail.period]}</dd>
              </div>
              <div>
                <dt>结算月份</dt>
                <dd>{data.monthLabel}</dd>
              </div>
            </dl>

            {apiMode && (
              <div className="mb-bg-active-row">
                <div className="mb-bg-active-copy">
                  <span className="mb-bg-active-title">启用预算</span>
                  <span className="mb-bg-active-desc">
                    {detail.isActive
                      ? '停用后不再计入本月预算合计与超支告警，历史进度仍可查看'
                      : '当前已停用：不计入预算合计与告警，启用后恢复'}
                  </span>
                </div>
                <HfSwitch
                  variant="budget"
                  checked={detail.isActive}
                  onChange={toggleActive}
                  disabled={saving}
                  ariaLabel={detail.isActive ? '停用预算' : '启用预算'}
                  text={detail.isActive ? '已启用' : '已停用'}
                />
              </div>
            )}

            {detail.type === 'expense' && detail.level === 'over' && (
              <div className="mb-bg-over-actions">
                <div className="mb-bg-over-buttons">
                  <button type="button" className="mb-secondary-btn" onClick={adjustToActual} disabled={saving}>
                    按实际调整
                  </button>
                  <button
                    type="button"
                    className="mb-secondary-btn"
                    onClick={() => setDetailNote('已维持原限额')}
                  >
                    维持限额
                  </button>
                  <button
                    type="button"
                    className="mb-secondary-btn"
                    onClick={() => {
                      onViewFlow()
                      setDetailId(null)
                    }}
                  >
                    查看流水
                  </button>
                </div>
              </div>
            )}

            <div className="mb-bg-detail-edit">
              <label className="mb-field-label" htmlFor="mb-bg-limit">
                调整限额（元）
              </label>
              <div className="mb-bg-detail-edit-row">
                <input
                  id="mb-bg-limit"
                  className="mb-input mb-bg-input"
                  inputMode="decimal"
                  value={detailLimit}
                  onChange={(event) => setDetailLimit(event.target.value)}
                />
                <button type="button" className="mb-primary-btn" onClick={saveLimit} disabled={saving}>
                  保存
                </button>
              </div>
            </div>

            {detailNote && <p className="mb-bg-detail-note">{detailNote}</p>}

            <button type="button" className="mb-bg-danger-link" onClick={deleteBudget} disabled={saving}>
              {confirmDelete ? '再次点击确认删除' : '删除预算条目'}
            </button>
          </>
        )}
      </HfSheet>

      <BudgetEditor
        opened={editorOpen}
        device={device}
        state={editor}
        ledger={ledger}
        error={editorError}
        saving={saving}
        apiMode={apiMode}
        onChange={setEditor}
        onClose={() => onEditorOpenChange(false)}
        onSave={saveEditor}
      />
    </div>
  )
}

function BudgetPageHead({
  device,
  data,
  month,
  onMonth,
  onAdd,
  currentMonth,
  hasData,
  empty,
}: {
  device: DeviceMode
  data: BudgetPageData
  month: string
  onMonth: (next: string) => void
  onAdd: () => void
  currentMonth: string
  hasData: (month: string) => boolean
  empty?: boolean
}) {
  if (device === 'mobile') return null
  const count = data.groups.reduce((total, group) => total + group.rows.length, 0)
  return (
    <div className="mb-page-head mb-bg-page-head">
      <div className="mb-bg-page-copy">
        <h1 className="mb-page-title">预算</h1>
        <p className="mb-page-sub">
          {data.monthLabel} · {count} 个条目
        </p>
      </div>
      <div className="mb-bg-head-actions">
        <MonthBar
          month={month}
          onChange={onMonth}
          currentMonth={currentMonth}
          hasData={hasData}
        />
        {!empty && (
          <button type="button" className="mb-primary-btn mb-bg-add" onClick={onAdd}>
            <Plus size={16} /> 新增
          </button>
        )}
      </div>
    </div>
  )
}

function BudgetEditor({
  opened,
  device,
  state,
  ledger,
  error,
  saving,
  apiMode,
  onChange,
  onClose,
  onSave,
}: {
  opened: boolean
  device: DeviceMode
  state: EditorState
  ledger: ReturnType<typeof useLedger>['ledger']
  error: string
  saving: boolean
  /** 真实账本要求预算绑定分类与账户，占位文案随之变化。 */
  apiMode: boolean
  onChange: (next: EditorState) => void
  onClose: () => void
  onSave: () => void
}) {
  const options = ledger.categories.filter(
    (category) => !category.parentId && category.type === state.type,
  )
  const kindOptions: BudgetKind[] = ['expense', 'income', 'transfer']
  const periodOptions: EditorState['period'][] = ['weekly', 'monthly', 'quarterly', 'yearly']

  return (
    <HfSheet
      variant="budget"
      device={device}
      opened={opened}
      onClose={onClose}
      zIndex={320}
      contentClassName="mb-bg-editor"
      mobileSize="100%"
      title={
        <div className="mb-overlay-title-copy">
          <span className="mb-overlay-title">新增预算条目</span>
        </div>
      }
    >
      <div className="mb-bg-form">
        <HfSegmented
          variant="entry"
          label="预算类型"
          ariaPressed={false}
          value={state.type}
          options={kindOptions.map((kind) => ({ id: kind, label: BUDGET_KIND_LABEL[kind] }))}
          onChange={(type) => onChange({ ...state, type, categoryId: '', toAccountId: '' })}
        />

        <label className="mb-entry-field">
          <span className="mb-field-label">名称</span>
          <input
            className="mb-input mb-bg-input"
            value={state.name}
            placeholder="例如 餐饮、工资入账、账户互转"
            onChange={(event) => onChange({ ...state, name: event.target.value })}
          />
        </label>

        <label className="mb-entry-field">
          <span className="mb-field-label">金额（元）</span>
          <input
            className="mb-input mb-bg-input"
            inputMode="decimal"
            placeholder="0.00"
            value={state.amount}
            onChange={(event) => onChange({ ...state, amount: event.target.value })}
          />
        </label>

        <div className="mb-entry-field">
          <span className="mb-field-label">周期</span>
          <HfSegmented
            variant="budget"
            label="预算周期"
            ariaPressed={false}
            value={state.period}
            options={periodOptions.map((period) => ({ id: period, label: BUDGET_PERIOD_LABEL[period] }))}
            onChange={(period) => onChange({ ...state, period })}
          />
        </div>

        <label className="mb-entry-field">
          <span className="mb-field-label">分类</span>
          <select
            className="mb-input mb-bg-input mb-bg-select"
            value={state.categoryId}
            onChange={(event) => onChange({ ...state, categoryId: event.target.value })}
          >
            <option value="">{apiMode ? '请选择分类（必选）' : '全部分类'}</option>
            {options.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-entry-field">
          <span className="mb-field-label">账户</span>
          <select
            className="mb-input mb-bg-input mb-bg-select"
            value={state.accountId}
            onChange={(event) => onChange({ ...state, accountId: event.target.value })}
          >
            <option value="">{apiMode ? '请选择账户（必选）' : '全部账户'}</option>
            {ledger.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountDisplayName(account, ledger.accounts)}
              </option>
            ))}
          </select>
        </label>

        {state.type === 'transfer' && (
          <label className="mb-entry-field">
            <span className="mb-field-label">转入账户</span>
            <select
              className="mb-input mb-bg-input mb-bg-select"
              value={state.toAccountId}
              onChange={(event) => onChange({ ...state, toAccountId: event.target.value })}
            >
              <option value="">请选择转入账户</option>
              {ledger.accounts
                .filter((account) => account.id !== state.accountId)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {accountDisplayName(account, ledger.accounts)}
                  </option>
                ))}
            </select>
          </label>
        )}

        {error && <p className="mb-entry-error">{error}</p>}

        <div className="mb-entry-actions">
          <button type="button" className="mb-secondary-btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="mb-primary-btn" onClick={onSave} disabled={saving}>
            保存
          </button>
        </div>
      </div>
    </HfSheet>
  )
}
