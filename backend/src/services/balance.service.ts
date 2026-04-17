import { prisma } from '../index.js'
import { Decimal } from '@prisma/client/runtime/library.js'
import { toDecimal, ZERO } from '../utils/decimal.js'

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
    const fromTransactions = await prisma.transaction.findMany({
      where: {
        accountId,
        date: { lt: targetDate },
      },
    })
    const toTransactions = await prisma.transaction.findMany({
      where: {
        toAccountId: accountId,
        date: { lt: targetDate },
      },
    })
    
    fromTransactions.forEach(t => {
      const amount = t.amount
      const fee = toDecimal(t.fee)
      const coupon = toDecimal(t.coupon)
      balance = balance.plus(calculateBalanceChangeDecimal(t.type as TransactionType, amount, fee, coupon))
    })
    toTransactions.forEach(t => {
      const amount = t.amount
      const fee = toDecimal(t.fee)
      const coupon = toDecimal(t.coupon)
      if (t.type === 'transfer') {
        balance = balance.plus(calculateTransferInAmountDecimal(amount, fee, coupon))
      }
    })
    return balance.toNumber()
  }

  const initialDate = account.initialBalanceDate
  const isForwardCalculation = targetDate >= initialDate

  if (isForwardCalculation) {
    const fromTransactions = await prisma.transaction.findMany({
      where: {
        accountId,
        date: { gte: initialDate, lt: targetDate },
      },
    })
    const toTransactions = await prisma.transaction.findMany({
      where: {
        toAccountId: accountId,
        date: { gte: initialDate, lt: targetDate },
      },
    })

    fromTransactions.forEach(t => {
      const amount = t.amount
      const fee = toDecimal(t.fee)
      const coupon = toDecimal(t.coupon)
      balance = balance.plus(calculateBalanceChangeDecimal(t.type as TransactionType, amount, fee, coupon))
    })
    toTransactions.forEach(t => {
      const amount = t.amount
      const fee = toDecimal(t.fee)
      const coupon = toDecimal(t.coupon)
      if (t.type === 'transfer') {
        balance = balance.plus(calculateTransferInAmountDecimal(amount, fee, coupon))
      }
    })
  } else {
    const fromTransactions = await prisma.transaction.findMany({
      where: {
        accountId,
        date: { gte: targetDate, lt: initialDate },
      },
    })
    const toTransactions = await prisma.transaction.findMany({
      where: {
        toAccountId: accountId,
        date: { gte: targetDate, lt: initialDate },
      },
    })

    fromTransactions.forEach(t => {
      const amount = t.amount
      const fee = toDecimal(t.fee)
      const coupon = toDecimal(t.coupon)
      balance = balance.minus(calculateBalanceChangeDecimal(t.type as TransactionType, amount, fee, coupon))
    })
    toTransactions.forEach(t => {
      const amount = t.amount
      const fee = toDecimal(t.fee)
      const coupon = toDecimal(t.coupon)
      if (t.type === 'transfer') {
        balance = balance.minus(calculateTransferInAmountDecimal(amount, fee, coupon))
      }
    })
  }

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
