/**
 * 预算页数据模型（HF 预览）
 *
 * 与总览 BudgetCard 共用预算口径：金额为整数分、分类按子树汇总、账户过滤可选。
 * 预算页额外覆盖收入目标与转账计划，并把「超支 / 接近上限」单独分组。
 */

import type {
  BudgetPeriod,
  Ledger,
  LedgerBudget,
  LedgerCategory,
  LedgerTransaction,
} from '@/features/overview/model'
import { CURRENT_MONTH, TODAY } from '@/features/overview/model'

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

function parseDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date))
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

/** 本月按当前日期结算；历史月份按当月最后一天结算。 */
export function monthAnchor(month: string): string {
  if (month === CURRENT_MONTH) return TODAY
  const [year, value] = month.split('-').map(Number)
  return formatDay(new Date(Date.UTC(year, value, 0)))
}

function budgetRange(period: BudgetPeriod, anchorDay: string): { start: string; end: string } {
  const anchor = parseDay(anchorDay)
  const year = anchor.getUTCFullYear()
  const month = anchor.getUTCMonth()

  switch (period) {
    case 'daily':
      return { start: anchorDay, end: anchorDay }
    case 'weekly': {
      const start = new Date(anchor)
      start.setUTCDate(start.getUTCDate() - 6)
      return { start: formatDay(start), end: anchorDay }
    }
    case 'monthly':
      return {
        start: formatDay(new Date(Date.UTC(year, month, 1))),
        end: formatDay(new Date(Date.UTC(year, month + 1, 0))),
      }
    case 'quarterly': {
      const quarterStart = Math.floor(month / 3) * 3
      return {
        start: formatDay(new Date(Date.UTC(year, quarterStart, 1))),
        end: formatDay(new Date(Date.UTC(year, quarterStart + 3, 0))),
      }
    }
    case 'yearly':
      return {
        start: formatDay(new Date(Date.UTC(year, 0, 1))),
        end: formatDay(new Date(Date.UTC(year, 11, 31))),
      }
  }
}

function categorySubtree(categories: LedgerCategory[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const category of categories) {
      if (category.parentId && ids.has(category.parentId) && !ids.has(category.id)) {
        ids.add(category.id)
        changed = true
      }
    }
  }
  return ids
}

function matchesType(transaction: LedgerTransaction, type: BudgetKind): boolean {
  if (type === 'expense') return transaction.type === 'expense'
  if (type === 'income') return transaction.type === 'income'
  return transaction.type === 'transfer'
}

function yuan(cents: number): string {
  return `¥${(cents / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function rowStatus(row: Omit<BudgetPageRow, 'status'>): string {
  const gap = Math.abs(row.limit - row.used)
  if (row.type === 'expense') {
    if (row.level === 'over') return `超支 ${yuan(gap)}`
    if (row.level === 'warning' && row.used >= row.limit) return '已达上限'
    if (row.level === 'warning') return `接近上限 · 还差 ${yuan(gap)}`
    return `剩余 ${yuan(gap)}`
  }
  if (row.type === 'income') {
    if (row.level === 'achieved') return row.used > row.limit ? `已达成 · 超出 ${yuan(gap)}` : '已达成'
    return `还差 ${yuan(gap)}`
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
  // 收入目标：未达成只是「进行中」，不判 warning（琥珀只属于支出接近上限）
  if (type === 'income') return percent >= 100 ? 'achieved' : 'normal'
  // 转账只做流量记录：任何占用率都不触发预算告警
  return 'neutral'
}

export function deriveBudgetPage(ledger: Ledger, month = CURRENT_MONTH): BudgetPageData {
  const anchor = monthAnchor(month)
  const rows: BudgetPageRow[] = ledger.budgets
    .filter((budget) => budget.type === 'expense' || budget.type === 'income' || budget.type === 'transfer')
    .map((budget) => {
      const type = budget.type as BudgetKind
      const range = budgetRange(budget.period, anchor)
      const categoryIds = budget.categoryId
        ? categorySubtree(ledger.categories, budget.categoryId)
        : undefined
      const used = ledger.transactions
        .filter((transaction) => {
          if (!matchesType(transaction, type)) return false
          if (transaction.date < range.start || transaction.date > range.end) return false
          if (categoryIds && !categoryIds.has(transaction.categoryId)) return false
          if (budget.accountId && transaction.accountId !== budget.accountId) return false
          return true
        })
        .reduce((total, transaction) => total + transaction.amount, 0)
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
      }
      return { ...base, status: rowStatus(base) }
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
  const used = expenseRows.reduce((total, row) => total + row.used, 0)
  const limit = expenseRows.reduce((total, row) => total + row.limit, 0)
  const percent = limit === 0 ? 0 : (used / limit) * 100
  const over = expenseRows.filter((row) => row.level === 'over')
  const near = expenseRows.filter((row) => row.level === 'warning')

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
