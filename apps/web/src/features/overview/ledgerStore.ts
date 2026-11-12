import { createContext, useContext } from 'react'
import type { TransactionPatch } from '@/features/transactions/ledgerOps'
import type {
  AccountKind,
  BudgetPeriod,
  CashFlowActivity,
  Ledger,
  NewTransactionInput,
  TxType,
} from './model'

export interface LedgerMutationOutcome {
  ok: boolean
  error?: string
  /** 6 秒撤销令牌；指向审计事件，撤销时回放。 */
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
  /** 所属账户分组（后端真实 id）；null = 未分组，省略 = 按 kind 回退默认分类。 */
  categoryId?: string | null
  /** 期初余额（分）；新建必填，编辑时省略表示保持原值。 */
  initialBalance?: number
  /** 期初余额日期（YYYY-MM-DD）；新建必填，编辑时省略表示保持原值。 */
  initialBalanceDate?: string
}

/** 设置页账户分组表单：只含名称、归属与可选图标，不碰计算标记。 */
export interface LedgerAccountGroupInput {
  name: string
  type: 'asset' | 'liability'
  /** 受控图标 key；null = 前端默认图标。 */
  iconKey?: string | null
}

/** 设置页分类表单：parentId 为展示 id（种子 key 或真实 id）。 */
export interface LedgerCategoryInput {
  name: string
  type: TxType
  parentId?: string | null
  /** 受控图标 key；null = 回退到按名称映射。 */
  iconKey?: string | null
}

/** 设置页分类 / 账户分组的改名与图标更新。 */
export interface LedgerLabelUpdateInput {
  name: string
  iconKey?: string | null
}

/** 预算表单：金额为分；分类 id 为展示 id（API 模式由 context 翻成真实 id）。 */
export interface LedgerBudgetInput {
  name: string
  type: 'expense' | 'income' | 'transfer'
  period: BudgetPeriod
  limit: number
  categoryId?: string
  accountId?: string
  /** 仅转账预算使用：转入账户（真实账户 id）。 */
  toAccountId?: string
  /**
   * 周期内发生日（后端 transactionTime）。语义随周期变化：
   * weekly 0=周一…6=周日；monthly 几号；quarterly/yearly 周期内天偏移；daily 忽略。
   * null / 缺省：monthly/quarterly/yearly 按周期末；weekly 跟随预算起始日同周几。
   */
  transactionTime?: number | null
}

export interface LedgerContextValue {
  ledger: Ledger
  addTransaction: (input: NewTransactionInput) => Promise<LedgerCreateOutcome>
  updateTransaction: (id: string, patch: TransactionPatch) => Promise<LedgerMutationOutcome>
  /** 退款关联/解除关联原交易；originalId 为 null 时解除，由后端重算可退上限。 */
  linkRefund: (id: string, originalId: string | null) => Promise<LedgerMutationOutcome>
  deleteTransactions: (ids: readonly string[]) => Promise<LedgerDeleteOutcome>
  setTransactionCategory: (ids: readonly string[], categoryId: string) => Promise<LedgerBatchCategoryOutcome>
  /* 设置页：账户与分类的真实读写（落库）。 */
  createAccount: (input: LedgerAccountInput) => Promise<LedgerCreateOutcome>
  updateAccount: (id: string, input: LedgerAccountInput) => Promise<LedgerMutationOutcome>
  deleteAccount: (id: string) => Promise<LedgerMutationOutcome>
  /** 按绝对位置重排同组账户顺序（拖拽排序用）。 */
  reorderAccountTo: (id: string, targetIndex: number) => Promise<LedgerMutationOutcome>
  /* 设置页：账户分组（后端 AccountCategory，只用于组织与浏览）。 */
  createAccountGroup: (input: LedgerAccountGroupInput) => Promise<LedgerCreateOutcome>
  updateAccountGroup: (id: string, input: LedgerLabelUpdateInput) => Promise<LedgerMutationOutcome>
  deleteAccountGroup: (id: string) => Promise<LedgerMutationOutcome>
  /** 按绝对位置重排同归属分组顺序（拖拽排序用）。 */
  reorderAccountGroupTo: (id: string, targetIndex: number) => Promise<LedgerMutationOutcome>
  createCategory: (input: LedgerCategoryInput) => Promise<LedgerCreateOutcome>
  updateCategory: (id: string, input: LedgerLabelUpdateInput) => Promise<LedgerMutationOutcome>
  /** 改一级分类的现金流活动归属；子分类随父一起写，报表按同一口径分组。 */
  setCategoryCashFlow: (id: string, activity: CashFlowActivity | null) => Promise<LedgerMutationOutcome>
  moveCategory: (id: string, parentId: string | null) => Promise<LedgerMutationOutcome>
  /** 删除分类；有交易引用时传 transferToId 先转移再删除（撤销会一并回填）。 */
  deleteCategory: (id: string, transferToId?: string) => Promise<LedgerMutationOutcome>
  /** 按绝对位置重排同级分类顺序（拖拽排序用）。 */
  reorderCategoryTo: (id: string, targetIndex: number) => Promise<LedgerMutationOutcome>
  /* 预算页：新增 / 修改 / 删除（落 /budgets）。 */
  createBudget: (input: LedgerBudgetInput) => Promise<LedgerCreateOutcome>
  updateBudget: (id: string, input: LedgerBudgetInput) => Promise<LedgerMutationOutcome>
  deleteBudget: (id: string) => Promise<LedgerMutationOutcome>
  /** 撤销删除 / 保存 / 批量改分类；令牌过期时返回失败而不是静默成功。 */
  undo: (token: string) => Promise<LedgerMutationOutcome>
}

export const LedgerContext = createContext<LedgerContextValue | null>(null)

export function useLedger(): LedgerContextValue {
  const value = useContext(LedgerContext)
  if (!value) throw new Error('useLedger 必须在 LedgerProvider 内使用')
  return value
}
