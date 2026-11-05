import { createContext, useContext } from 'react'
import type { Ledger, NewTransactionInput } from './model'

export interface LedgerContextValue {
  ledger: Ledger
  addTransaction: (input: NewTransactionInput) => void
}

export const LedgerContext = createContext<LedgerContextValue | null>(null)

export function useLedger(): LedgerContextValue {
  const value = useContext(LedgerContext)
  if (!value) throw new Error('useLedger 必须在 LedgerProvider 内使用')
  return value
}
