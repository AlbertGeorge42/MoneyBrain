import { createContext, useContext } from 'react'
import type { TransactionPatch } from '@/features/transactions/ledgerOps'
import type { AccountKind, Ledger, NewTransactionInput, TxType } from './model'

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

/** 设置页账户表单：余额与期初余额均为「分」（与 LedgerAccount 同口径）。 */
export interface LedgerAccountInput {
  name: string
  kind: AccountKind
  balance: number
  /** 期初余额（分）；新建必填，编辑时省略表示保持原值。 */
  initialBalance?: number
  /** 期初余额日期（YYYY-MM-DD）；新建必填，编辑时省略表示保持原值。 */
  initialBalanceDate?: string
}

/** 设置页分类表单：parentId 为展示 id（种子 key 或真实 id）。 */
export interface LedgerCategoryInput {
  name: string
  type: TxType
  parentId?: string | null
}

export interface LedgerContextValue {
  ledger: Ledger
  /** 数据来源：种子内存账本 / 真实 API。写操作在 API 模式下真写。 */
  dataMode: LedgerDataMode
  addTransaction: (input: NewTransactionInput) => Promise<LedgerCreateOutcome>
  updateTransaction: (id: string, patch: TransactionPatch) => Promise<LedgerMutationOutcome>
  /** 退款关联/解除关联原交易；originalId 为 null 时解除。API 模式由后端重算可退上限。 */
  linkRefund: (id: string, originalId: string | null) => Promise<LedgerMutationOutcome>
  deleteTransactions: (ids: readonly string[]) => Promise<LedgerDeleteOutcome>
  setTransactionCategory: (ids: readonly string[], categoryId: string) => Promise<LedgerBatchCategoryOutcome>
  /* 设置页：账户与分类的真实读写（API 模式落库，种子模式改内存）。 */
  createAccount: (input: LedgerAccountInput) => Promise<LedgerCreateOutcome>
  updateAccount: (id: string, input: LedgerAccountInput) => Promise<LedgerMutationOutcome>
  deleteAccount: (id: string) => Promise<LedgerMutationOutcome>
  /** 上下移动同组账户顺序；返回撤销令牌（排序也可撤销）。 */
  reorderAccount: (id: string, direction: 'up' | 'down') => Promise<LedgerMutationOutcome>
  createCategory: (input: LedgerCategoryInput) => Promise<LedgerCreateOutcome>
  updateCategory: (id: string, name: string) => Promise<LedgerMutationOutcome>
  moveCategory: (id: string, parentId: string | null) => Promise<LedgerMutationOutcome>
  /** 删除分类；有交易引用时传 transferToId 先转移再删除（撤销会一并回填）。 */
  deleteCategory: (id: string, transferToId?: string) => Promise<LedgerMutationOutcome>
  reorderCategory: (id: string, direction: 'up' | 'down') => Promise<LedgerMutationOutcome>
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
