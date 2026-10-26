import {
  fromDate,
  minor,
  transferOutflow,
  type LedgerTransaction,
  type Minor,
  type TransactionKind,
} from '../../../../packages/domain/src/index.js'

/**
 * 旧 Prisma 交易 → 领域交易。
 *
 * 金额语义（与前端写入保持一致）：
 * - income / expense / refund：amount 是净现金流（手续费、优惠券已折算）
 * - transfer：amount 是本金，fee / coupon 单独存放
 * - adjustment：amount 是余额增量
 *
 * 金额单位：库里是 BigInt 分，领域层是 Minor 分，无需换算。
 */
export interface LedgerSource {
  id: string
  type: string
  amount: bigint
  fee?: bigint | null
  coupon?: bigint | null
  date: Date
  accountId: string
  toAccountId?: string | null
  categoryId?: string | null
  relatedTransactionId?: string | null
  relatedType?: string | null
  excludeFromIncomeExpense?: boolean | null
}

const KINDS: ReadonlySet<string> = new Set([
  'income',
  'expense',
  'transfer',
  'refund',
  'adjustment',
])

function kindOf(value: string): TransactionKind {
  if (!KINDS.has(value)) {
    throw new Error(`未知交易类型: ${value}`)
  }
  return value as TransactionKind
}

function relatedTypeOf(value?: string | null): 'income' | 'expense' | null {
  return value === 'income' || value === 'expense' ? value : null
}

export function toLedgerTransaction(source: LedgerSource): LedgerTransaction {
  return {
    id: source.id,
    kind: kindOf(source.type),
    date: fromDate(source.date),
    amount: minor(Number(source.amount)),
    fee: minor(Number(source.fee ?? 0)),
    coupon: minor(Number(source.coupon ?? 0)),
    accountId: source.accountId,
    toAccountId: source.toAccountId ?? null,
    categoryId: source.categoryId ?? null,
    relatedTransactionId: source.relatedTransactionId ?? null,
    relatedType: relatedTypeOf(source.relatedType),
    excludeFromIncomeExpense: source.excludeFromIncomeExpense ?? false,
  }
}

/** 转账从转出账户流出的现金（本金 + 有效手续费）。 */
export function transferOutflowMinor(amount: Minor, fee: Minor, coupon: Minor): Minor {
  return transferOutflow(amount, fee, coupon)
}


