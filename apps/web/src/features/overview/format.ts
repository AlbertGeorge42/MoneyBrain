import { minor } from '@domain/index'
import { formatCurrency, formatPercent } from '@/utils/format'
import type { LedgerTransaction, TrendPoint } from './model'

export function amountText(value: number, options?: { showSign?: boolean }): string {
  return formatCurrency(minor(value), options)
}

export function signedAmountText(transaction: LedgerTransaction): string {
  const abs = Math.abs(transaction.amount)
  const sign =
    transaction.type === 'income' || transaction.type === 'refund'
      ? '+'
      : transaction.type === 'expense'
        ? '−'
        : transaction.amount < 0
          ? '−'
          : ''
  return `${sign}${formatCurrency(minor(abs))}`
}

export function percentText(value: number, showSign = true): string {
  return formatPercent(value, 1, showSign)
}

/** 走势图横轴与悬浮提示的月份：`2026-11` → `26.11`。 */
export function trendMonthLabel(month: string): string {
  const [year, value] = month.split('-')
  return `${year.slice(2)}.${value}`
}

/**
 * 走势涨幅：基期（倒数第二个点）为 0 或缺失时无法计算，返回 null 由展示层给可读文案。
 * 返回 null 也保证不会向下游输出 Infinity / NaN。
 */
export function trendChangePct(points: TrendPoint[]): number | null {
  if (points.length < 2) return null
  const previous = points[points.length - 2].value
  const current = points[points.length - 1].value
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous === 0) return null
  const change = ((current - previous) / previous) * 100
  return Number.isFinite(change) ? change : null
}
