import { useCallback, useState, type ReactNode } from 'react'
import {
  addTransaction as applyTransaction,
  createSeedLedger,
  type Ledger,
  type NewTransactionInput,
} from './model'
import { LedgerContext } from './ledgerStore'
import {
  deleteTransactionsFromLedger,
  setTransactionsCategory,
  updateTransactionInLedger,
  type TransactionPatch,
} from '@/features/transactions/ledgerOps'

export function LedgerProvider({
  children,
  initialLedger,
}: {
  children: ReactNode
  initialLedger?: Ledger
}) {
  const [ledger, setLedger] = useState<Ledger>(() => initialLedger ?? createSeedLedger())

  const addTransaction = useCallback((input: NewTransactionInput) => {
    setLedger((current) => applyTransaction(current, input))
  }, [])

  const updateTransaction = useCallback((id: string, patch: TransactionPatch) => {
    setLedger((current) => updateTransactionInLedger(current, id, patch))
  }, [])

  const deleteTransactions = useCallback((ids: readonly string[]) => {
    setLedger((current) => deleteTransactionsFromLedger(current, ids))
  }, [])

  const setTransactionCategory = useCallback((ids: readonly string[], categoryId: string) => {
    setLedger((current) => setTransactionsCategory(current, ids, categoryId))
  }, [])

  const replaceLedger = useCallback((next: Ledger) => setLedger(next), [])

  return (
    <LedgerContext.Provider
      value={{
        ledger,
        addTransaction,
        updateTransaction,
        deleteTransactions,
        setTransactionCategory,
        replaceLedger,
      }}
    >
      {children}
    </LedgerContext.Provider>
  )
}
