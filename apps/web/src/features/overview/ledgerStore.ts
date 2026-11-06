import { createContext, useContext } from 'react'
import type { TransactionPatch } from '@/features/transactions/ledgerOps'
import type { Ledger, NewTransactionInput } from './model'

export type LedgerDataMode = 'seed' | 'api'

export interface LedgerMutationOutcome {
  ok: boolean
  error?: string
  /** 6 秒撤销令牌；API 模式指向审计事件，种子模式指向本地快照。 */
  undoToken?: string
}

export interface LedgerCreateOutcome extends LedgerMutationOutcome {
  id?: string
}

export interface LedgerDeleteOutcome extends LedgerMutationOutcome {
  succeeded: number
  auditEventIds: string[]
  /** 部分失败时剩下的条目，便于页面收敛选中集合后重试。 */
  failedIds: string[]
}

export interface LedgerBatchCategoryOutcome extends LedgerMutationOutcome {
  succeeded: number
}

export interface LedgerContextValue {
  ledger: Ledger
  /** 数据来源：种子内存账本 / 真实 API。写操作在 API 模式下真写。 */
  dataMode: LedgerDataMode
  addTransaction: (input: NewTransactionInput) => Promise<LedgerCreateOutcome>
  updateTransaction: (id: string, patch: TransactionPatch) => Promise<LedgerMutationOutcome>
  deleteTransactions: (ids: readonly string[]) => Promise<LedgerDeleteOutcome>
  setTransactionCategory: (ids: readonly string[], categoryId: string) => Promise<LedgerBatchCategoryOutcome>
  /** 撤销删除 / 保存 / 批量改分类；令牌过期时返回失败而不是静默成功。 */
  undo: (token: string) => Promise<LedgerMutationOutcome>
  replaceLedger: (next: Ledger) => void
}

export const LedgerContext = createContext<LedgerContextValue | null>(null)

export function useLedger(): LedgerContextValue {
  const value = useContext(LedgerContext)
  if (!value) throw new Error('useLedger 必须在 LedgerProvider 内使用')
  return value
}
