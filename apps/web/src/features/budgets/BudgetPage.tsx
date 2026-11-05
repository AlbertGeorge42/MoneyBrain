import { useEffect, useMemo, useState } from 'react'
import { Drawer } from '@mantine/core'
import { ChevronLeft, ChevronRight, Plus, TriangleAlert } from 'lucide-react'
import { useLedger } from '@/features/overview/ledgerStore'
import { CURRENT_MONTH } from '@/features/overview/model'
import { amountText, percentText } from '@/features/overview/format'
import { BudgetProgress } from '@/features/shared/BudgetProgress'
import { ErrorPanel, LoadingSkeleton } from '@/features/shared/StateViews'
import type { DataState, DeviceMode } from '@/features/shared/types'
import {
  BUDGET_KIND_LABEL,
  BUDGET_PERIOD_LABEL,
  createBudgetId,
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
  notify: (message: string) => void
}

function moneyText(value: number): string {
  return amountText(Math.max(0, value))
}

function MonthBar({
  month,
  onChange,
  compact,
}: {
  month: string
  onChange: (next: string) => void
  compact?: boolean
}) {
  const current = month === CURRENT_MONTH
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
        disabled={current}
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight size={16} />
      </button>
      {!current && (
        <button type="button" className="mb-link-btn mb-bg-month-today" onClick={() => onChange(CURRENT_MONTH)}>
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
      ? 'var(--mb-color-expense)'
      : level === 'warning'
        ? 'var(--mb-color-warning)'
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
        <p className="mb-bg-hero-empty">还没有设置支出预算，新增第一条后会在这里显示可花金额。</p>
      </section>
    )
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
          <span className="mb-bg-hero-badge" data-level={expense.level}>
            {expense.level === 'over' ? '已超支' : expense.level === 'warning' ? '接近上限' : '按计划'}
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
      {data.groups.map((group) =>
        group.rows.length === 0 ? null : (
          <section key={group.type} className="mb-card mb-bg-group" data-type={group.type}>
            <div className="mb-sec-head">
              <div>
                <h2 className="mb-sec-title">{group.label}</h2>
                <p className="mb-sec-desc">{group.rows.length} 个条目</p>
              </div>
              <span className="mb-bg-group-total">
                {moneyText(group.rows.reduce((total, row) => total + row.limit, 0))}
              </span>
            </div>
            <div className="mb-bg-rows">
              {group.rows.map((row) => (
                <button key={row.id} type="button" className="mb-bg-row" onClick={() => onOpen(row)}>
                  <div className="mb-bg-row-top">
                    <span className="mb-bg-name">{row.name}</span>
                    <span className="mb-bg-status" data-level={row.level}>
                      {(row.level === 'warning' || row.level === 'over') && (
                        <TriangleAlert size={12} strokeWidth={2} aria-hidden="true" />
                      )}
                      {row.status}
                    </span>
                  </div>
                  <BudgetProgress
                    level={row.level}
                    percent={row.percent}
                    label={
                      row.level === 'neutral'
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
        ),
      )}
    </>
  )
}

function EmptyPage({ device, onAdd }: { device: DeviceMode; onAdd: () => void }) {
  return (
    <>
      {device === 'desktop' && (
        <div className="mb-page-head">
          <h1 className="mb-page-title">预算</h1>
          <p className="mb-page-sub">还没有预算</p>
        </div>
      )}
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
    </>
  )
}

interface EditorState {
  name: string
  type: BudgetKind
  period: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  amount: string
  categoryId: string
  accountId: string
}

const EMPTY_EDITOR: EditorState = {
  name: '',
  type: 'expense',
  period: 'monthly',
  amount: '',
  categoryId: '',
  accountId: '',
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
  const { ledger, replaceLedger } = useLedger()
  const [month, setMonth] = useState(CURRENT_MONTH)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailLimit, setDetailLimit] = useState('')
  const [detailNote, setDetailNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR)
  const [editorError, setEditorError] = useState('')

  const data = useMemo(() => deriveBudgetPage(ledger, month), [ledger, month])
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

  const portalTarget =
    typeof document === 'undefined'
      ? null
      : (document.querySelector(device === 'mobile' ? '.mb-hf-phone' : '.mb-hf-root') as HTMLElement | null)

  const updateBudgets = (next: typeof ledger.budgets, message: string) => {
    replaceLedger({ ...ledger, budgets: next })
    notify(message)
  }

  const saveLimit = () => {
    if (!detail) return
    const value = Math.round(Number(detailLimit) * 100)
    if (!Number.isFinite(value) || value <= 0) {
      setDetailNote('限额需大于 0')
      return
    }
    updateBudgets(
      ledger.budgets.map((budget) => (budget.id === detail.id ? { ...budget, limit: value } : budget)),
      `已把「${detail.name}」限额调整为 ${moneyText(value)}`,
    )
    setDetailNote('已保存')
  }

  const deleteBudget = () => {
    if (!detail) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      setDetailNote('再次点击确认删除该预算条目')
      return
    }
    updateBudgets(
      ledger.budgets.filter((budget) => budget.id !== detail.id),
      `已删除预算「${detail.name}」`,
    )
    setDetailId(null)
  }

  const adjustToActual = () => {
    if (!detail) return
    updateBudgets(
      ledger.budgets.map((budget) => (budget.id === detail.id ? { ...budget, limit: detail.used } : budget)),
      `已按实际把「${detail.name}」上限调整为 ${moneyText(detail.used)}`,
    )
    setDetailNote('已按实际调整')
  }

  const saveEditor = () => {
    const amount = Math.round(Number(editor.amount) * 100)
    if (!editor.name.trim()) {
      setEditorError('请填写预算名称')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setEditorError('请填写大于 0 的金额')
      return
    }
    const category = ledger.categories.find((item) => item.id === editor.categoryId)
    updateBudgets(
      [
        ...ledger.budgets,
        {
          id: createBudgetId(ledger.budgets),
          name: editor.name.trim(),
          type: editor.type,
          period: editor.period,
          limit: amount,
          categoryId: editor.categoryId || undefined,
          accountId: editor.accountId || undefined,
        },
      ],
      `已新增预算「${editor.name.trim()}」${category ? `，分类 ${category.name}` : ''}`,
    )
    onEditorOpenChange(false)
  }

  if (dataState === 'loading') {
    return (
      <>
        <BudgetPageHead device={device} data={data} month={month} onMonth={setMonth} onAdd={() => onEditorOpenChange(true)} />
        <LoadingSkeleton device={device} />
      </>
    )
  }

  if (dataState === 'error') {
    return (
      <>
        <BudgetPageHead device={device} data={data} month={month} onMonth={setMonth} onAdd={() => onEditorOpenChange(true)} />
        <ErrorPanel onRetry={onRetry} />
      </>
    )
  }

  if (ledger.budgets.length === 0 || dataState === 'empty') {
    return (
      <>
        <BudgetPageHead device={device} data={data} month={month} onMonth={setMonth} onAdd={() => onEditorOpenChange(true)} />
        <EmptyPage device={device} onAdd={() => onEditorOpenChange(true)} />
        <BudgetEditor
          opened={editorOpen}
          device={device}
          state={editor}
          ledger={ledger}
          error={editorError}
          portalTarget={portalTarget}
          onChange={setEditor}
          onClose={() => onEditorOpenChange(false)}
          onSave={saveEditor}
        />
      </>
    )
  }

  return (
    <div className="mb-bg-page" data-device={device}>
      <BudgetPageHead device={device} data={data} month={month} onMonth={setMonth} onAdd={() => onEditorOpenChange(true)} />

      {device === 'mobile' && (
        <div className="mb-bg-mobile-month">
          <MonthBar month={month} onChange={setMonth} compact />
        </div>
      )}

      <Hero data={data} device={device} />
      <WatchGroup data={data} onOpen={openDetail} />
      <GroupSection data={data} onOpen={openDetail} />

      <section className="mb-card mb-bg-note">
        <p>
          支出超过 80% 标黄、超过 100% 标红并显示超支金额；收入未达目标只提示差额，不叫超支；
          转账只记录流量，不计入预算告警（行内标「不计入预算」，不填充进度条），也不参与支出总计。
        </p>
      </section>

      <Drawer
        opened={Boolean(detail)}
        onClose={() => setDetailId(null)}
        position={device === 'mobile' ? 'bottom' : 'right'}
        size={device === 'mobile' ? '100%' : 460}
        withinPortal
        portalProps={portalTarget ? { target: portalTarget } : undefined}
        zIndex={300}
        overlayProps={{ className: 'mb-overlay' }}
        classNames={{ content: 'mb-sheet mb-bg-detail', header: 'mb-overlay-head', body: 'mb-overlay-body' }}
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
              label={detail.level === 'neutral' ? '不计入预算' : '预算使用进度'}
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

            {detail.type === 'expense' && detail.level === 'over' && (
              <div className="mb-bg-over-actions">
                <h3 className="mb-bg-over-title">这笔预算已超支，接下来怎么处理？</h3>
                <div className="mb-bg-over-buttons">
                  <button type="button" className="mb-secondary-btn" onClick={adjustToActual}>
                    按实际调整
                  </button>
                  <button
                    type="button"
                    className="mb-secondary-btn"
                    onClick={() => setDetailNote('已维持原限额，本期继续标记为超支，作为已知告警。')}
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
                <button type="button" className="mb-primary-btn" onClick={saveLimit}>
                  保存
                </button>
              </div>
            </div>

            {detailNote && <p className="mb-bg-detail-note">{detailNote}</p>}

            <button type="button" className="mb-bg-danger-link" onClick={deleteBudget}>
              {confirmDelete ? '再次点击确认删除' : '删除预算条目'}
            </button>
          </>
        )}
      </Drawer>

      <BudgetEditor
        opened={editorOpen}
        device={device}
        state={editor}
        ledger={ledger}
        error={editorError}
        portalTarget={portalTarget}
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
}: {
  device: DeviceMode
  data: BudgetPageData
  month: string
  onMonth: (next: string) => void
  onAdd: () => void
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
        <MonthBar month={month} onChange={onMonth} />
        <button type="button" className="mb-primary-btn mb-bg-add" onClick={onAdd}>
          <Plus size={16} /> 新增
        </button>
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
  portalTarget,
  onChange,
  onClose,
  onSave,
}: {
  opened: boolean
  device: DeviceMode
  state: EditorState
  ledger: ReturnType<typeof useLedger>['ledger']
  error: string
  portalTarget: HTMLElement | null
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
    <Drawer
      opened={opened}
      onClose={onClose}
      position={device === 'mobile' ? 'bottom' : 'right'}
      size={device === 'mobile' ? '100%' : 460}
      withinPortal
      portalProps={portalTarget ? { target: portalTarget } : undefined}
      zIndex={320}
      overlayProps={{ className: 'mb-overlay' }}
      classNames={{ content: 'mb-sheet mb-bg-editor', header: 'mb-overlay-head', body: 'mb-overlay-body' }}
      title={
        <div className="mb-overlay-title-copy">
          <span className="mb-overlay-title">新增预算条目</span>
          <span className="mb-overlay-sub">支出设上限、收入设目标、转账记录计划</span>
        </div>
      }
    >
      <div className="mb-bg-form">
        <div className="mb-entry-types" role="group" aria-label="预算类型">
          {kindOptions.map((kind) => (
            <button
              key={kind}
              type="button"
              className={`mb-entry-type${state.type === kind ? ' is-active' : ''}`}
              onClick={() => onChange({ ...state, type: kind, categoryId: '' })}
            >
              {BUDGET_KIND_LABEL[kind]}
            </button>
          ))}
        </div>

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
          <div className="mb-bg-seg" role="group" aria-label="预算周期">
            {periodOptions.map((period) => (
              <button
                key={period}
                type="button"
                className={`mb-bg-seg-btn${state.period === period ? ' is-active' : ''}`}
                onClick={() => onChange({ ...state, period })}
              >
                {BUDGET_PERIOD_LABEL[period]}
              </button>
            ))}
          </div>
        </div>

        <label className="mb-entry-field">
          <span className="mb-field-label">分类</span>
          <select
            className="mb-input mb-bg-input mb-bg-select"
            value={state.categoryId}
            onChange={(event) => onChange({ ...state, categoryId: event.target.value })}
          >
            <option value="">全部分类</option>
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
            <option value="">全部账户</option>
            {ledger.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="mb-entry-error">{error}</p>}

        <div className="mb-entry-actions">
          <button type="button" className="mb-secondary-btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="mb-primary-btn" onClick={onSave}>
            保存
          </button>
        </div>
      </div>
    </Drawer>
  )
}
