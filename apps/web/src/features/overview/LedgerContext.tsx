import { useCallback, useState, type ReactNode } from 'react'
import {
  addTransaction as applyTransaction,
  createSeedLedger,
  type Ledger,
  type NewTransactionInput,
} from './model'
import { LedgerContext } from './ledgerStore'

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

  return (
    <LedgerContext.Provider value={{ ledger, addTransaction }}>
      {children}
    </LedgerContext.Provider>
  )
}
