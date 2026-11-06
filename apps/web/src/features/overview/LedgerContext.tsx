import { useCallback, useEffect, useState, type ReactNode } from 'react'
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
  readOnly = false,
}: {
  children: ReactNode
  initialLedger?: Ledger
  readOnly?: boolean
}) {
  const [ledger, setLedger] = useState<Ledger>(() => initialLedger ?? createSeedLedger())

  // API 数据异步到达或重试后，把外部 Ledger 同步进来。
  // 种子模式没有 initialLedger，不受影响。
  useEffect(() => {
    if (initialLedger) setLedger(initialLedger)
  }, [initialLedger])

  const addTransaction = useCallback(
    (input: NewTransactionInput): string | null => {
      if (readOnly) return null
      if (Math.round(Math.abs(input.amount)) <= 0) return null
      const nextNumber = ledger.transactions.reduce((max, transaction) => {
        const numeric = Number(transaction.id.replace(/\D/g, ''))
        return Number.isFinite(numeric) ? Math.max(max, numeric) : max
      }, 0)
      const id = `t${nextNumber + 1}`
      setLedger((current) => applyTransaction(current, input))
      return id
    },
    [ledger.transactions, readOnly],
  )

  const updateTransaction = useCallback(
    (id: string, patch: TransactionPatch) => {
      if (readOnly) return
      setLedger((current) => updateTransactionInLedger(current, id, patch))
    },
    [readOnly],
  )

  const deleteTransactions = useCallback(
    (ids: readonly string[]) => {
      if (readOnly) return
      setLedger((current) => deleteTransactionsFromLedger(current, ids))
    },
    [readOnly],
  )

  const setTransactionCategory = useCallback(
    (ids: readonly string[], categoryId: string) => {
      if (readOnly) return
      setLedger((current) => setTransactionsCategory(current, ids, categoryId))
    },
    [readOnly],
  )

  const replaceLedger = useCallback(
    (next: Ledger) => {
      if (readOnly) return
      setLedger(next)
    },
    [readOnly],
  )

  return (
    <LedgerContext.Provider
      value={{
        ledger,
        readOnly,
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
