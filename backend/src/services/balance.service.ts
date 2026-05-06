import { prisma } from '../index.js'
import { Decimal } from '@prisma/client/runtime/library.js'
import { ZERO } from '../common/index.js'

export type TransactionType = 'income' | 'expense' | 'transfer' | 'refund' | 'adjustment'

export function calculateBalanceChangeDecimal(
  type: TransactionType,
  amount: Decimal,
  fee: Decimal = ZERO,
  coupon: Decimal = ZERO
): Decimal {
  switch (type) {
    case 'income':
      return amount
    case 'expense':
      return amount.negated()
    case 'transfer':
      if (coupon.greaterThan(ZERO)) {
        return amount.negated()
      } else if (fee.greaterThan(ZERO)) {
        return amount.plus(fee).negated()
      }
      return amount.negated()
    case 'refund':
      return amount.minus(fee)
    case 'adjustment':
      return amount
    default:
      return ZERO
  }
}

export function calculateTransferInAmountDecimal(
  amount: Decimal,
  fee: Decimal = ZERO,
  coupon: Decimal = ZERO
): Decimal {
  if (coupon.greaterThan(ZERO)) {
    return amount.plus(coupon)
  }
  return amount
}

/**
 * 根据交易列表计算余额变动
 * @param transactions 从账户转出的交易列表
 * @param toTransactions 转入账户的交易列表
 * @param multiplier 1 为前向计算，-1 为后向计算
 */
function applyTransactionsToBalance(
  balance: Decimal,
  transactions: { type: string; amount: Decimal; fee: Decimal; coupon: Decimal }[],
  toTransactions: { type: string; amount: Decimal; fee: Decimal; coupon: Decimal }[],
  multiplier: 1 | -1 = 1
): Decimal {
  transactions.forEach(t => {
    const change = calculateBalanceChangeDecimal(t.type as TransactionType, t.amount, t.fee, t.coupon)
    balance = balance.plus(change.times(multiplier))
  })
  toTransactions.forEach(t => {
    if (t.type === 'transfer') {
      const inAmount = calculateTransferInAmountDecimal(t.amount, t.fee, t.coupon)
      balance = balance.plus(inAmount.times(multiplier))
    }
  })
  return balance
}

export async function calculateBalanceAtDate(
  accountId: string,
  targetDate: Date
): Promise<number> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  })
  
  if (!account) return 0

  let balance = account.initialBalance
  
  if (!account.initialBalanceDate) {
    // 无初始余额日期，从最早交易开始计算
    const fromTransactions = await prisma.transaction.findMany({
      where: { accountId, date: { lt: targetDate } },
    })
    const toTransactions = await prisma.transaction.findMany({
      where: { toAccountId: accountId, date: { lt: targetDate } },
    })
    balance = applyTransactionsToBalance(balance, fromTransactions, toTransactions)
    return balance.toNumber()
  }

  const initialDate = account.initialBalanceDate
  const isForwardCalculation = targetDate >= initialDate

  const dateRange = isForwardCalculation
    ? { gte: initialDate, lt: targetDate }
    : { gte: targetDate, lt: initialDate }
  const multiplier: 1 | -1 = isForwardCalculation ? 1 : -1

  const [fromTransactions, toTransactions] = await Promise.all([
    prisma.transaction.findMany({
      where: { accountId, date: dateRange },
    }),
    prisma.transaction.findMany({
      where: { toAccountId: accountId, date: dateRange },
    }),
  ])

  balance = applyTransactionsToBalance(balance, fromTransactions, toTransactions, multiplier)
  return balance.toNumber()
}

export async function getOrCreateAdjustmentCategory(type: 'income' | 'expense'): Promise<string> {
  const existing = await prisma.transactionCategory.findFirst({
    where: { name: '平账调整', type }
  })

  if (!existing) {
    const category = await prisma.transactionCategory.create({
      data: {
        name: '平账调整',
        type,
        icon: '⚙️',
      },
    })
    return category.id
  }

  return existing.id
}
