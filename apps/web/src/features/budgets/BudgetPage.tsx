import { useEffect, useMemo, useState } from 'react'
import { Plus, TriangleAlert } from 'lucide-react'
import { useLedger } from '@/features/overview/ledgerStore'
import type { LedgerBudgetInput } from '@/features/overview/ledgerStore'
import { ledgerAnchorDay } from '@/features/overview/model'
import type { BudgetPeriod, LedgerBudget } from '@/features/overview/model'
import { budgetApi } from '@/services/api'
import { unwrapApiData } from '@/services/apiResult'
import { amountText, percentText } from '@/features/overview/format'
import { BudgetProgress } from '@/features/shared/BudgetProgress'
import { Card } from '@/features/shared/Card'
import { HfButton } from '@/features/shared/HfButton'
import { HfSegmented } from '@/features/shared/HfSegmented'
import { HfSheet } from '@/features/shared/HfSheet'
import { HfSwitch } from '@/features/shared/HfSwitch'
import { PeriodBar } from '@/features/shared/PeriodBar'
import { accountDisplayName } from '@/features/shared/accountIdentity'
import { ControlRow } from '@/features/shared/skeleton/ControlRow'
import { ErrorPanel, LoadingSkeleton } from '@/features/shared/StateViews'
import type { Budget } from '@contracts/types'
import type { DataState, DeviceMode } from '@/features/shared/types'
import {
  BUDGET_KIND_LABEL,
  BUDGET_PERIOD_LABEL,
  deriveBudgetPage,
  monthAnchor,
  monthLabel,
  shiftMonth,
} from './budgetModel'
import type { BudgetKind, BudgetPageData, BudgetPageRow, BudgetUsageStatus } from './budgetModel'
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
  /** 纯文字入口：跳到报表页的未来区间（收支预算计划）。 */
  onViewFutureReports?: () => void
  /** 第二个参数为撤销动作；API 模式删除后 6 秒内可撤销。 */
  notify: (message: string, action?: () => void) => void
}

function moneyText(value: number): string {
  return amountText(Math.max(0, value))
}

function MonthBar({
  month,
  onChange,
  currentMonth,
  hasData,
}: {
  month: string
  onChange: (next: string) => void
  currentMonth: string
  hasData: (month: string) => boolean
}) {
  const isCurrent = month === currentMonth
  const nextMonth = shiftMonth(month, 1)
  const nextHasData = hasData(nextMonth)
  return (
    <PeriodBar
      groupLabel="预算月份"
      label={monthLabel(month)}
      prevLabel="上一个月"
      nextLabel="下一个月"
      onPrev={() => onChange(shiftMonth(month, -1))}
      onNext={() => onChange(nextMonth)}
      nextDisabled={!nextHasData}
      disabledReason={`${monthLabel(nextMonth)}没有流水，暂不可切换`}
      note={nextHasData ? undefined : `${monthLabel(nextMonth)}无流水`}
      resetLabel={isCurrent ? undefined : '回到本月'}
      onReset={isCurrent ? undefined : () => onChange(currentMonth)}
    />
  )
}

/**
 * 月份器控件行：页头下方的唯一控件槽位，与报表时间器同一垂直位置。
 * 桌面与移动同构——页头在移动端为空，本行即内容区的首行。
 */
function MonthControls({
  month,
  onChange,
  currentMonth,
  hasData,
}: {
  month: string
  onChange: (next: string) => void
  currentMonth: string
  hasData: (month: string) => boolean
}) {
  return (
    <ControlRow>
      <div className="mb-bg-controls">
        <MonthBar
          month={month}
          onChange={onChange}
          currentMonth={currentMonth}
          hasData={hasData}
        />
      </div>
    </ControlRow>
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
  const expenseRows = data.groups[0].rows
  // 头部是「本月可花」：只统计月度且启用的支出预算。
  const monthlyRows = expenseRows.filter((row) => row.isActive && row.period === 'monthly')
  if (monthlyRows.length === 0) {
    // 周/年预算仍在下方明细展示；这里不能把它们误报成「还没有设置支出预算」。
    const message =
      expenseRows.length === 0
        ? '还没有设置支出预算，新增第一条后会在这里显示可花金额。'
        : expenseRows.every((row) => !row.isActive)
          ? `支出预算已全部停用（${data.disabledExpenseCount} 条）；启用后才会显示可花金额与告警。`
          : '当前没有启用的月度支出预算；周/年预算在下方明细中按各自周期展示。'
    return (
      <Card className="mb-bg-hero is-empty">
        <h2 className="mb-sec-title">本月支出预算</h2>
        <p className="mb-bg-hero-empty">{message}</p>
      </Card>
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
    <Card className="mb-bg-hero">
      <Ring percent={expense.percent} level={expense.level} size={device === 'mobile' ? 'sm' : 'lg'} />
      <div className="mb-bg-hero-copy">
        <div className="mb-sec-head">
          <div>
            <h2 className="mb-sec-title">本月支出预算</h2>
            <p className="mb-sec-desc">
              {monthlyRows.length} 个月度预算 · 已用 {percentText(expense.percent, false)}
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
    </Card>
  )
}

function WatchGroup({ data, onOpen }: { data: BudgetPageData; onOpen: (row: BudgetPageRow) => void }) {
  if (data.over.length === 0 && data.near.length === 0) return null
  return (
    <Card className="mb-bg-watch">
      <div className="mb-sec-head">
        <div>
          <h2 className="mb-sec-title">需要关注</h2>
          <p className="mb-sec-desc">本月超支 {data.over.length} 条 · 接近上限 {data.near.length} 条</p>
        </div>
      </div>
      <div className="mb-bg-watch-grid">
        <div className="mb-bg-watch-col" data-level="over">
          <h3 className="mb-bg-watch-title">已超支</h3>
          {data.over.length === 0 ? (
            <p className="mb-bg-watch-empty">没有超支条目</p>
          ) : (
            data.over.map((row) => (
              <HfButton key={row.id} className="mb-bg-watch-row" onClick={() => onOpen(row)}>
                <span className="mb-bg-watch-name">{row.name}</span>
                <span className="mb-bg-watch-status">{row.status}</span>
              </HfButton>
            ))
          )}
        </div>
        <div className="mb-bg-watch-col" data-level="warning">
          <h3 className="mb-bg-watch-title">接近上限</h3>
          {data.near.length === 0 ? (
            <p className="mb-bg-watch-empty">没有接近上限条目</p>
          ) : (
            data.near.map((row) => (
              <HfButton key={row.id} className="mb-bg-watch-row" onClick={() => onOpen(row)}>
                <span className="mb-bg-watch-name">{row.name}</span>
                <span className="mb-bg-watch-status">{row.status}</span>
              </HfButton>
            ))
          )}
        </div>
      </div>
    </Card>
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
          <Card key={group.type} className="mb-bg-group" data-type={group.type}>
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
                <HfButton
                  key={row.id}
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
                </HfButton>
              ))}
            </div>
          </Card>
        )
      })}
    </>
  )
}

function EmptyPage({ onAdd }: { onAdd: () => void }) {
  return (
    <Card className="mb-bg-empty">
      <div className="mb-bg-empty-mark" aria-hidden>
        <Plus size={22} />
      </div>
      <h2 className="mb-sec-title">还没有预算</h2>
      <p className="mb-bg-empty-copy">
        为支出设置上限、为收入设置目标、为转账记录计划。第一条预算建好后，这一页会显示「可花多少」、
        接近上限与超支提醒。
      </p>
      <HfButton variant="primary" onClick={onAdd}>
        新增预算条目
      </HfButton>
    </Card>
  )
}

interface EditorState {
  name: string
  type: BudgetKind
  period: BudgetPeriod
  amount: string
  categoryId: string
  accountId: string
  /** 仅转账预算：转入账户。 */
  toAccountId: string
  /** 周期内发生日（后端 transactionTime），语义随周期变化，见 transactionTimeLabel。 */
  transactionTime: string
}

const EMPTY_EDITOR: EditorState = {
  name: '',
  type: 'expense',
  period: 'monthly',
  amount: '',
  categoryId: '',
  accountId: '',
  toAccountId: '',
  transactionTime: '',
}

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const

/** 各周期 transactionTime 的合法区间：weekly 0=周一…6=周日；monthly 几号；季/年为周期内天偏移。 */
const TRANSACTION_TIME_RANGE: Record<Exclude<BudgetPeriod, 'daily'>, { min: number; max: number }> = {
  weekly: { min: 0, max: 6 },
  monthly: { min: 1, max: 31 },
  quarterly: { min: 0, max: 92 },
  yearly: { min: 0, max: 365 },
}

/** 详情展示：把后端 transactionTime 按周期语义翻译成可读文案（不做日期换算）。 */
function transactionTimeLabel(period: BudgetPeriod, value?: number | null): string {
  if (period === 'daily') return '每日'
  if (value == null) return period === 'weekly' ? '跟随起始日' : '周期末（默认）'
  if (period === 'weekly') return WEEKDAY_LABELS[value] ?? '跟随起始日'
  if (period === 'monthly') return `每月 ${value} 号`
  if (period === 'quarterly') return `季度第 ${value} 天`
  return `年度第 ${value} 天`
}

/** 表单输入 → 后端 transactionTime；invalid 表示超出该周期语义的合法区间。 */
function parseTransactionTime(
  period: BudgetPeriod,
  raw: string,
): { value: number | null } | { invalid: string } {
  const text = raw.trim()
  if (period === 'daily' || text === '') return { value: null }
  const value = Number(text)
  const range = TRANSACTION_TIME_RANGE[period]
  if (!Number.isInteger(value) || value < range.min || value > range.max) {
    const hint =
      period === 'weekly'
        ? '发生日需选择周一至周日'
        : period === 'monthly'
          ? '发生日需为 1–31 的整数'
          : period === 'quarterly'
            ? '季度内天数需为 0–92 的整数'
            : '年度内天数需为 0–365 的整数'
    return { invalid: hint }
  }
  return { value }
}

/** API 模式等待 statuses 时传空表：页面在外层显示骨架，不让前端规则临时兜底。 */
const EMPTY_BUDGET_STATUS: ReadonlyMap<string, BudgetUsageStatus> = new Map()

export function BudgetPage({
  device,
  dataState,
  editorOpen,
  onEditorOpenChange,
  onRetry,
  onViewFlow,
  onViewFutureReports,
  notify,
}: BudgetPageProps) {
  const { ledger, dataMode, createBudget, updateBudget, deleteBudget: removeBudget, undo } = useLedger()
  // 锚点跟真实数据走：API 模式用真实今天 / 最新流水，不再停在种子的 2026-10。
  const anchorDay = ledgerAnchorDay(ledger)
  const currentMonth = anchorDay.slice(0, 7)
  const [monthOverride, setMonthOverride] = useState<string | null>(null)
  const month = monthOverride ?? currentMonth
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
  // 启停写接口成功后先覆盖 statuses 的 isActive，避免等待账本重读。
  const [activeById, setActiveById] = useState<Map<string, boolean>>()

  const apiMode = dataMode === 'api'

  // 预算口径只有一处：API 模式一律消费 /budgets/statuses。
  // 当前期的 statuses 随账本一起加载；浏览历史月份时按该月结算日再查一次。
  const anchor = monthAnchor(month, currentMonth, anchorDay)
  const statusKey = `${month}|${anchor}`
  const ledgerStatusKey = ledger.snapshot
    ? `${ledger.snapshot.today.slice(0, 7)}|${ledger.snapshot.today}`
    : undefined
  const ledgerStatusById = useMemo(() => {
    if (!ledger.snapshot) return undefined
    const statuses = new Map<string, BudgetUsageStatus>()
    for (const budget of ledger.budgets) {
      statuses.set(budget.id, { used: budget.used ?? 0, isActive: budget.isActive ?? true })
    }
    return statuses
  }, [ledger])
  const [monthStatus, setMonthStatus] = useState<{
    key: string
    byId: Map<string, BudgetUsageStatus>
  }>()
  const [statusError, setStatusError] = useState(false)
  const [statusRetry, setStatusRetry] = useState(0)

  const setMonth = (next: string) => {
    setMonthOverride(next)
    setStatusError(false)
  }
  const retryStatuses = () => {
    setStatusError(false)
    setStatusRetry((count) => count + 1)
  }

  const statusById = apiMode
    ? statusKey === ledgerStatusKey
      ? ledgerStatusById
      : monthStatus?.key === statusKey
        ? monthStatus.byId
        : undefined
    : undefined
  // 没有预算时无需等 statuses，直接走页面的空状态。
  const statusesReady = !apiMode || ledger.budgets.length === 0 || statusById !== undefined

  useEffect(() => {
    if (!apiMode || statusKey === ledgerStatusKey) return
    const ids = ledger.budgets.map((budget) => budget.id)
    if (ids.length === 0) return
    let cancelled = false
    setStatusError(false)
    void budgetApi
      .getStatuses(ids, anchor)
      .then(unwrapApiData)
      .then((statuses) => {
        if (cancelled) return
        setMonthStatus({
          key: statusKey,
          byId: new Map(
            statuses.map((status) => [
              status.budget.id,
              { used: status.used, isActive: status.budget.isActive },
            ]),
          ),
        })
      })
      .catch(() => {
        if (!cancelled) setStatusError(true)
      })
    return () => {
      cancelled = true
    }
  }, [apiMode, statusKey, ledgerStatusKey, anchor, ledger.budgets, statusRetry])

  const data = useMemo(
    () =>
      deriveBudgetPage(ledger, month, {
        today: anchorDay,
        currentMonth,
        activeById,
        // API 模式未就绪时传空表，避免在等待后端时用种子规则算出另一种口径。
        statusById: apiMode ? statusById ?? EMPTY_BUDGET_STATUS : undefined,
      }),
    [ledger, month, anchorDay, currentMonth, activeById, apiMode, statusById],
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

  /** 现有预算 + 新限额 → 写接口入参（真实后端 PUT 要求完整字段）。 */
  const toBudgetInput = (budget: LedgerBudget, limit: number): LedgerBudgetInput => ({
    name: budget.name,
    type: budget.type as LedgerBudgetInput['type'],
    period: budget.period,
    limit,
    categoryId: budget.categoryId,
    accountId: budget.accountId,
    toAccountId: budget.toAccountId,
    transactionTime: budget.transactionTime ?? null,
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
    toAccountId: budget.toAccountId,
    // 0 是合法天偏移；只有 null 才省略，避免改限额/启停时把已有发生日清零。
    transactionTime: budget.transactionTime ?? undefined,
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
    // 发生日的合法区间随周期变化；非法值在提交前拦下，避免后端展开出空点位。
    const transactionTime = parseTransactionTime(editor.period, editor.transactionTime)
    if ('invalid' in transactionTime) {
      setEditorError(transactionTime.invalid)
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
      transactionTime: transactionTime.value,
    })
    setSaving(false)
    if (!result.ok) {
      setEditorError(`保存失败：${result.error ?? '请重试'}`)
      return
    }
    onEditorOpenChange(false)
    notify(`已新增预算「${editor.name.trim()}」${category ? `，分类 ${category.name}` : ''}`)
  }

  // 历史月 statuses 查询失败时，页面不能退回前端本地重算（会变成第二套口径）。
  if (dataState === 'error' || statusError) {
    return (
      <>
        <BudgetPageHead
          device={device}
          data={data}
          onAdd={() => onEditorOpenChange(true)}
        />
        <MonthControls
          month={month}
          onChange={setMonth}
          currentMonth={currentMonth}
          hasData={hasMonthData}
        />
        <ErrorPanel onRetry={dataState === 'error' ? onRetry : retryStatuses} />
      </>
    )
  }

  if (dataState === 'loading' || !statusesReady) {
    return (
      <>
        <BudgetPageHead
          device={device}
          data={data}
          onAdd={() => onEditorOpenChange(true)}
        />
        <MonthControls
          month={month}
          onChange={setMonth}
          currentMonth={currentMonth}
          hasData={hasMonthData}
        />
        <LoadingSkeleton device={device} />
      </>
    )
  }

  if (ledger.budgets.length === 0 || dataState === 'empty') {
    return (
      <>
        <BudgetPageHead
          device={device}
          data={data}
          onAdd={() => onEditorOpenChange(true)}
          empty
        />
        <MonthControls
          month={month}
          onChange={setMonth}
          currentMonth={currentMonth}
          hasData={hasMonthData}
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
        onAdd={() => onEditorOpenChange(true)}
      />

      <MonthControls
        month={month}
        onChange={setMonth}
        currentMonth={currentMonth}
        hasData={hasMonthData}
      />

      <div className="mb-bg-future-entry">
        <button type="button" className="mb-bg-future-link" onClick={onViewFutureReports}>
          查看未来报表 →
        </button>
      </div>

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
                <dt>发生日</dt>
                <dd>{transactionTimeLabel(detail.period, detail.transactionTime)}</dd>
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
                  <HfButton variant="secondary" onClick={adjustToActual} disabled={saving}>
                    按实际调整
                  </HfButton>
                  <HfButton
                    variant="secondary"
                    onClick={() => setDetailNote('已维持原限额')}
                  >
                    维持限额
                  </HfButton>
                  <HfButton
                    variant="secondary"
                    onClick={() => {
                      onViewFlow()
                      setDetailId(null)
                    }}
                  >
                    查看流水
                  </HfButton>
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
                <HfButton variant="primary" onClick={saveLimit} disabled={saving}>
                  保存
                </HfButton>
              </div>
            </div>

            {detailNote && <p className="mb-bg-detail-note">{detailNote}</p>}

            <HfButton className="mb-bg-danger-link" onClick={deleteBudget} disabled={saving}>
              {confirmDelete ? '再次点击确认删除' : '删除预算条目'}
            </HfButton>
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
  onAdd,
  empty,
}: {
  device: DeviceMode
  data: BudgetPageData
  onAdd: () => void
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
      {!empty && (
        <HfButton variant="primary" className="mb-bg-add" onClick={onAdd}>
          <Plus size={16} /> 新增
        </HfButton>
      )}
    </div>
  )
}

function TransactionTimeField({
  state,
  onChange,
}: {
  state: EditorState
  onChange: (next: EditorState) => void
}) {
  if (state.period === 'daily') {
    return <p className="mb-bg-hint">每日预算按日历日展开，无需设置发生日。</p>
  }
  if (state.period === 'weekly' || state.period === 'monthly') {
    const weekly = state.period === 'weekly'
    return (
      <div className="mb-entry-field">
        <label className="mb-field-label" htmlFor="budget-transaction-time">
          {weekly ? '发生日（周几）' : '发生日（每月几号）'}
        </label>
        <select
          id="budget-transaction-time"
          className="mb-input mb-bg-input mb-bg-select"
          value={state.transactionTime}
          onChange={(event) => onChange({ ...state, transactionTime: event.target.value })}
        >
          <option value="">{weekly ? '不指定（跟随起始日）' : '月末（默认）'}</option>
          {weekly
            ? WEEKDAY_LABELS.map((label, value) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))
            : Array.from({ length: 31 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {index + 1} 号
                </option>
              ))}
        </select>
        {!weekly && <span className="mb-bg-hint">当月没有该日期时，该月不生成预算点位。</span>}
      </div>
    )
  }
  const quarterly = state.period === 'quarterly'
  return (
    <div className="mb-entry-field">
      <label className="mb-field-label" htmlFor="budget-transaction-time">
        {quarterly ? '发生日（季度内第几天）' : '发生日（年度内第几天）'}
      </label>
      <input
        id="budget-transaction-time"
        className="mb-input mb-bg-input"
        inputMode="numeric"
        placeholder="留空 = 周期末"
        value={state.transactionTime}
        onChange={(event) => onChange({ ...state, transactionTime: event.target.value })}
      />
      <span className="mb-bg-hint">
        0 = 周期首日，取值 0–{quarterly ? 92 : 365}；留空按周期末结算。
      </span>
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
  const periodOptions: BudgetPeriod[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']

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
            onChange={(period) => onChange({ ...state, period, transactionTime: '' })}
          />
        </div>

        <TransactionTimeField state={state} onChange={onChange} />

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
          <HfButton variant="secondary" onClick={onClose}>
            取消
          </HfButton>
          <HfButton variant="primary" onClick={onSave} disabled={saving}>
            保存
          </HfButton>
        </div>
      </div>
    </HfSheet>
  )
}
