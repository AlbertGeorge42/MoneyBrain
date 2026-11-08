/**
 * 预算页数据模型（HF 预览）
 *
 * 用量一律来自后端（/budgets/statuses 或账本已带的 used），本模型只负责
 * 周期与限额展示、分组、排序与文案；不再在本地按流水重算。
 */

import { minor } from '@domain/index'
import type {
  BudgetPeriod,
  Ledger,
  LedgerBudget,
} from '@/features/overview/model'
import { CURRENT_MONTH, TODAY } from '@/features/overview/model'
import { formatCurrency } from '@/utils/format'

export type BudgetKind = 'expense' | 'income' | 'transfer'
export type BudgetRowLevel = 'normal' | 'warning' | 'over' | 'achieved' | 'neutral'

export interface BudgetPageRow {
  id: string
  name: string
  type: BudgetKind
  period: BudgetPeriod
  limit: number
  used: number
  percent: number
  level: BudgetRowLevel
  status: string
  categoryName: string
  accountName: string
  /** 周期内发生日（后端 transactionTime）；语义随 period 变化，仅用于展示。 */
  transactionTime?: number | null
  /** 后端 Budget.isActive；停用条目仍列出但灰显，不计入头部合计与告警。 */
  isActive: boolean
}

export interface BudgetTypeGroup {
  type: BudgetKind
  label: string
  rows: BudgetPageRow[]
}

export interface BudgetPageData {
  month: string
  monthLabel: string
  groups: BudgetTypeGroup[]
  expense: {
    used: number
    limit: number
    remaining: number
    percent: number
    level: BudgetRowLevel
  }
  over: BudgetPageRow[]
  near: BudgetPageRow[]
  primaryOver?: BudgetPageRow
  /** 已停用的支出预算条数；全部停用时头部需要给出与「未设置」不同的空态文案。 */
  disabledExpenseCount: number
}

export const BUDGET_KIND_LABEL: Record<BudgetKind, string> = {
  expense: '支出预算',
  income: '收入预算',
  transfer: '转账预算',
}

export const BUDGET_PERIOD_LABEL: Record<BudgetPeriod, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '每月',
  quarterly: '每季',
  yearly: '每年',
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function monthLabel(month: string): string {
  const [year, value] = month.split('-').map(Number)
  return `${year} 年 ${value} 月`
}

export function shiftMonth(month: string, delta: number): string {
  const [year, value] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, value - 1 + delta, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/** 当前月按锚定日结算；历史月份按当月最后一天结算。 */
export function monthAnchor(month: string, currentMonth = CURRENT_MONTH, today = TODAY): string {
  if (month === currentMonth) return today
  const [year, value] = month.split('-').map(Number)
  return formatDay(new Date(Date.UTC(year, value, 0)))
}

function rowStatus(row: Omit<BudgetPageRow, 'status'>): string {
  const gap = Math.abs(row.limit - row.used)
  const gapText = formatCurrency(minor(gap))
  if (row.type === 'expense') {
    if (row.level === 'over') return `超支 ${gapText}`
    if (row.level === 'warning' && row.used >= row.limit) return '已达上限'
    if (row.level === 'warning') return `接近上限 · 还差 ${gapText}`
    return `剩余 ${gapText}`
  }
  if (row.type === 'income') {
    if (row.level === 'achieved') {
      return row.used > row.limit ? `已达成 · 超出 ${gapText}` : '已达成'
    }
    return `还差 ${gapText}`
  }
  // 转账是账户互转，不参与预算告警，也不计入任何超支口径
  return '不计入预算'
}

function rowLevel(type: BudgetKind, percent: number): BudgetRowLevel {
  if (type === 'expense') {
    if (percent > 100) return 'over'
    if (percent >= 80) return 'warning'
    return 'normal'
  }
  // 收入目标：未达成是「进行中」，用 neutral 钢色，不能显示成绿（绿 = 良好 / 已达成）
  if (type === 'income') return percent >= 100 ? 'achieved' : 'neutral'
  // 转账只做流量记录：任何占用率都不触发预算告警
  return 'neutral'
}

/** 后端 /budgets/statuses 的预算用量（真实数据唯一口径）。 */
export interface BudgetUsageStatus {
  used: number
  isActive: boolean
}

export function deriveBudgetPage(
  ledger: Ledger,
  month = CURRENT_MONTH,
  options?: {
    activeById?: Map<string, boolean>
    /** 该月后端预算用量（/budgets/statuses）；不传时只有预算自带 used 才显示用量。 */
    statusById?: ReadonlyMap<string, BudgetUsageStatus>
  },
): BudgetPageData {
  const activeById = options?.activeById
  const statusById = options?.statusById
  const rows: BudgetPageRow[] = ledger.budgets
    .filter((budget) => budget.type === 'expense' || budget.type === 'income' || budget.type === 'transfer')
    .map((budget) => {
      const type = budget.type as BudgetKind
      const status = statusById?.get(budget.id)
      // 用量只有后端一个来源：statuses 优先，其次账本里已带的后端 used；都没有则未知。
      const usedFromSource = statusById ? status?.used : budget.used
      const used = usedFromSource ?? 0
      const percent = budget.limit === 0 ? 0 : (used / budget.limit) * 100
      const level = rowLevel(type, percent)
      const category = ledger.categories.find((item) => item.id === budget.categoryId)
      const account = ledger.accounts.find((item) => item.id === budget.accountId)
      const base = {
        id: budget.id,
        name: budget.name,
        type,
        period: budget.period,
        limit: budget.limit,
        used,
        percent,
        level,
        categoryName: category?.name ?? '全部分类',
        accountName: account?.name ?? '全部账户',
        transactionTime: budget.transactionTime,
        // 1) 页面乐观更新覆盖；2) 后端 statuses；3) 种子预算默认启用。
        isActive: activeById?.get(budget.id) ?? status?.isActive ?? budget.isActive ?? true,
      }
      // 没有后端用量时不能编造「剩余」：明确标为未知，页面据此只展示额度。
      return {
        ...base,
        status: usedFromSource === undefined ? '用量未知' : rowStatus(base),
      }
    })

  const levelOrder: Record<BudgetRowLevel, number> = {
    over: 0,
    warning: 1,
    achieved: 2,
    neutral: 3,
    normal: 4,
  }
  const groups: BudgetTypeGroup[] = (['expense', 'income', 'transfer'] as BudgetKind[]).map((type) => {
    const typeRows = rows.filter((row) => row.type === type)
    // 支出组把超支行置顶，避免头部已提示超支、列表却埋在末尾。
    if (type === 'expense') {
      typeRows.sort((left, right) => levelOrder[left.level] - levelOrder[right.level])
    }
    return { type, label: BUDGET_KIND_LABEL[type], rows: typeRows }
  })

  const expenseRows = groups[0].rows
  // 头部是「本月可花」：只算月度且启用的支出预算；周/年预算保留在明细里展示各自周期与用量。
  // 停用预算同样保留在列表里供恢复，不参与合计与告警。
  const monthlyActiveExpenseRows = expenseRows.filter((row) => row.isActive && row.period === 'monthly')
  const used = monthlyActiveExpenseRows.reduce((total, row) => total + row.used, 0)
  const limit = monthlyActiveExpenseRows.reduce((total, row) => total + row.limit, 0)
  const percent = limit === 0 ? 0 : (used / limit) * 100
  const over = monthlyActiveExpenseRows.filter((row) => row.level === 'over')
  const near = monthlyActiveExpenseRows.filter((row) => row.level === 'warning')

  return {
    month,
    monthLabel: monthLabel(month),
    groups,
    expense: {
      used,
      limit,
      remaining: limit - used,
      percent,
      level: rowLevel('expense', percent),
    },
    over,
    near,
    primaryOver: over[0],
    disabledExpenseCount: expenseRows.filter((row) => !row.isActive).length,
  }
}

export function createBudgetId(budgets: LedgerBudget[]): string {
  let max = 0
  for (const budget of budgets) {
    const match = /^b_([0-9]+)$/.exec(budget.id)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `b_${max + 1}`
}
