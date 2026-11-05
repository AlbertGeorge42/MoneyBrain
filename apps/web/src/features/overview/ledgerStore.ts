import { createContext, useContext } from 'react'
import type { TransactionPatch } from '@/features/transactions/ledgerOps'
import type { Ledger, NewTransactionInput } from './model'

export interface LedgerContextValue {
  ledger: Ledger
  addTransaction: (input: NewTransactionInput) => void
  updateTransaction: (id: string, patch: TransactionPatch) => void
  deleteTransactions: (ids: readonly string[]) => void
  setTransactionCategory: (ids: readonly string[], categoryId: string) => void
  replaceLedger: (next: Ledger) => void
}

export const LedgerContext = createContext<LedgerContextValue | null>(null)

export function useLedger(): LedgerContextValue {
  const value = useContext(LedgerContext)
  if (!value) throw new Error('useLedger 必须在 LedgerProvider 内使用')
  return value
}
