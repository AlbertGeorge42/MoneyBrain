import { Decimal } from '@prisma/client/runtime/library.js'
import {
  fromDate,
  fromMajor,
  toMajor,
  transferOutflow,
  type LedgerTransaction,
  type TransactionKind,
} from '../../../../packages/domain/src/index.js'

/**
 * 旧 Prisma 交易 → 领域交易。
 *
 * 金额语义（与前端写入保持一致）：
 * - income / expense / refund：amount 是净现金流（手续费、优惠券已折算）
 * - transfer：amount 是本金，fee / coupon 单独存放
 * - adjustment：amount 是余额增量
 */
export interface LedgerSource {
  id: string
  type: string
  amount: Decimal
  fee?: Decimal | null
  coupon?: Decimal | null
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
    amount: fromMajor(source.amount.toNumber()),
    fee: fromMajor(source.fee?.toNumber() ?? 0),
    coupon: fromMajor(source.coupon?.toNumber() ?? 0),
    accountId: source.accountId,
    toAccountId: source.toAccountId ?? null,
    categoryId: source.categoryId ?? null,
    relatedTransactionId: source.relatedTransactionId ?? null,
    relatedType: relatedTypeOf(source.relatedType),
    excludeFromIncomeExpense: source.excludeFromIncomeExpense ?? false,
  }
}

/** 转账从转出账户流出的现金（本金 + 有效手续费）。 */
export function transferOutflowDecimal(amount: Decimal, fee: Decimal, coupon: Decimal): Decimal {
  return new Decimal(
    toMajor(
      transferOutflow(
        fromMajor(amount.toNumber()),
        fromMajor(fee.toNumber()),
        fromMajor(coupon.toNumber()),
      ),
    ),
  )
}


