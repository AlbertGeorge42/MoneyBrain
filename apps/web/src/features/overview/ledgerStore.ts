import { createContext, useContext } from 'react'
import type { TransactionPatch } from '@/features/transactions/ledgerOps'
import type { Ledger, NewTransactionInput } from './model'

export interface LedgerContextValue {
  ledger: Ledger
  /** API 只读接入阶段：写操作不落库，页面据此提示而不假装已保存。 */
  readOnly: boolean
  /** 返回新建交易的 id（金额无效时为 null），供保存后 6 秒撤销复用记录级删除。 */
  addTransaction: (input: NewTransactionInput) => string | null
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
