import { minor } from '@domain/index'
import { formatCurrency, formatPercent } from '@/utils/format'
import type { LedgerTransaction } from './model'

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
