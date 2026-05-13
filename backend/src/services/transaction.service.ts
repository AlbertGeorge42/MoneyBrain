import { prisma } from '../index.js'
import { Decimal } from '@prisma/client/runtime/library.js'
import {
  calculateBalanceChangeDecimal,
  calculateTransferInAmountDecimal,
  type TransactionType
} from './balance.service.js'
import { toDecimal, ZERO } from '../common/index.js'
import type { Transaction, Account, TransactionCategory } from '@prisma/client'
import { NotFoundError, InsufficientBalanceError, ValidationError } from '../common/index.js'
import { buildTransactionListWhere } from './transaction-list.service.js'

// ===== 接口定义 =====

export interface TransactionWithRelations {
  id: string
  type: string
  amount: Decimal
  fee: Decimal | null
  coupon: Decimal | null
  date: Date
  note: string | null
  accountId: string
  toAccountId: string | null
  categoryId: string | null
  relatedTransactionId: string | null
  relatedType: string | null
  isAdjustment: boolean
  createdAt: Date
  updatedAt: Date
  account: Account
  category: TransactionCategory | null
  toAccount: Account | null
  relatedTransaction: (Transaction & { account: Account; category: TransactionCategory | null }) | null
}

export interface CreateIncomeExpenseData {
  type: 'income' | 'expense'
  amount: number
  fee?: number
  coupon?: number
  date: Date
  note?: string
  accountId: string
  categoryId: string
}

export interface CreateTransferData {
  amount: number
  fee?: number
  coupon?: number
  date: Date
  note?: string
  accountId: string
  toAccountId: string
  categoryId?: string
}

export interface CreateRefundData {
  amount: number
  fee?: number
  coupon?: number
  date: Date
  note?: string
  accountId: string
  relatedTransactionId: string
}

export interface UpdateIncomeExpenseData {
  type?: 'income' | 'expense'
  amount?: number
  fee?: number
  coupon?: number
  date?: Date
  note?: string
  accountId?: string
  categoryId?: string
}

export interface UpdateTransferData {
  amount?: number
  fee?: number
  coupon?: number
  date?: Date
  note?: string
  accountId?: string
  toAccountId?: string
  categoryId?: string
}

export interface UpdateRefundData {
  amount?: number
  fee?: number
  coupon?: number
  date?: Date
  note?: string
  accountId?: string
  categoryId?: string
  relatedTransactionId?: string
}

export interface TransactionListParams {
  page?: number
  pageSize?: number
  accountId?: string | string[]
  categoryId?: string | string[]
  type?: string | string[]
  startDate?: Date
  endDate?: Date
}

export interface TransactionListResult {
  list: TransactionWithRelations[]
  total: number
  page: number
  pageSize: number
}

export interface TransactionStats {
  income: number
  expense: number
  refund: number
  balance: number
  transferCount: number
}

// ===== 创建交易 =====

export async function createIncomeExpense(data: CreateIncomeExpenseData): Promise<TransactionWithRelations> {
  const { type, amount, fee = 0, coupon = 0, date, note, accountId, categoryId } = data

  const result = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        type,
        amount: toDecimal(amount),
        fee: toDecimal(fee),
        coupon: toDecimal(coupon),
        date,
        note,
        accountId,
        categoryId,
      },
      include: { account: true, category: true },
    })

    const balanceChange = calculateBalanceChangeDecimal(type, toDecimal(amount), toDecimal(fee), toDecimal(coupon))
    await tx.account.update({
      where: { id: accountId },
      data: { balance: { increment: balanceChange } },
    })

    return transaction
  })

  return result as TransactionWithRelations
}

export async function createTransfer(data: CreateTransferData): Promise<TransactionWithRelations> {
  const { amount, fee = 0, coupon = 0, date, note, accountId, toAccountId, categoryId } = data

  const fromAccount = await prisma.account.findUnique({ where: { id: accountId } })
  if (!fromAccount) throw new NotFoundError('转出账户')

  const totalOut = toDecimal(amount).plus(fee).minus(coupon)
  if (fromAccount.balance.lessThan(totalOut)) throw new InsufficientBalanceError('转出账户')

  const toAccount = await prisma.account.findUnique({ where: { id: toAccountId } })
  if (!toAccount) throw new NotFoundError('转入账户')

  const result = await prisma.$transaction(async (tx) => {
    const outAmount = calculateBalanceChangeDecimal('transfer', toDecimal(amount), toDecimal(fee), toDecimal(coupon))
    await tx.account.update({
      where: { id: accountId },
      data: { balance: { increment: outAmount } },
    })

    const inAmount = calculateTransferInAmountDecimal(toDecimal(amount), toDecimal(fee), toDecimal(coupon))
    await tx.account.update({
      where: { id: toAccountId },
      data: { balance: { increment: inAmount } },
    })

    const transaction = await tx.transaction.create({
      data: {
        type: 'transfer',
        amount: toDecimal(amount),
        fee: toDecimal(fee),
        coupon: toDecimal(coupon),
        date,
        note,
        accountId,
        toAccountId,
        categoryId,
      },
      include: { account: true, toAccount: true, category: true },
    })

    return transaction
  })

  return result as TransactionWithRelations
}

export async function createRefund(data: CreateRefundData): Promise<TransactionWithRelations> {
  const { amount, fee = 0, coupon = 0, date, note, accountId, relatedTransactionId } = data

  const relatedTransaction = await prisma.transaction.findUnique({ where: { id: relatedTransactionId } })
  if (!relatedTransaction) throw new NotFoundError('原交易记录')

  // 检查是否已有退款记录
  const existingRefund = await prisma.transaction.findFirst({
    where: {
      type: 'refund',
      relatedTransactionId: relatedTransactionId,
    },
  })
  if (existingRefund) {
    throw new ValidationError('该交易已有退款记录，无法再次退款')
  }

  const result = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        type: 'refund',
        amount: toDecimal(amount),
        fee: toDecimal(fee),
        coupon: toDecimal(coupon),
        date,
        note,
        accountId,
        categoryId: relatedTransaction.categoryId,
        relatedTransactionId,
        relatedType: relatedTransaction.type,
      },
      include: {
        account: true,
        category: true,
        relatedTransaction: { include: { account: true, category: true } },
      },
    })

    const balanceChange = calculateBalanceChangeDecimal('refund', toDecimal(amount), toDecimal(fee), toDecimal(coupon))
    await tx.account.update({
      where: { id: accountId },
      data: { balance: { increment: balanceChange } },
    })

    return transaction
  })

  return result as TransactionWithRelations
}

// ===== 更新交易 =====

export async function updateIncomeExpense(id: string, data: UpdateIncomeExpenseData): Promise<TransactionWithRelations> {
  const oldTransaction = await prisma.transaction.findUnique({ where: { id } })
  if (!oldTransaction) throw new NotFoundError('交易记录')

  const oldFee = toDecimal(oldTransaction.fee)
  const oldCoupon = toDecimal(oldTransaction.coupon)

  const result = await prisma.$transaction(async (tx) => {
    const oldBalanceChange = calculateBalanceChangeDecimal(
      oldTransaction.type as TransactionType,
      oldTransaction.amount,
      oldFee,
      oldCoupon,
    )
    await tx.account.update({
      where: { id: oldTransaction.accountId },
      data: { balance: { decrement: oldBalanceChange.abs() } },
    })

    const newType = data.type || oldTransaction.type
    const newAmount = data.amount !== undefined ? toDecimal(data.amount) : oldTransaction.amount
    const newFee = data.fee !== undefined ? toDecimal(data.fee) : oldFee
    const newCoupon = data.coupon !== undefined ? toDecimal(data.coupon) : oldCoupon
    const newAccountId = data.accountId || oldTransaction.accountId

    const transaction = await tx.transaction.update({
      where: { id },
      data: {
        type: newType,
        amount: newAmount,
        fee: newFee,
        coupon: newCoupon,
        date: data.date || oldTransaction.date,
        note: data.note !== undefined ? data.note : oldTransaction.note,
        accountId: newAccountId,
        categoryId: data.categoryId || oldTransaction.categoryId,
      },
      include: { account: true, category: true },
    })

    const newBalanceChange = calculateBalanceChangeDecimal(newType as TransactionType, newAmount, newFee, newCoupon)
    await tx.account.update({
      where: { id: newAccountId },
      data: { balance: { increment: newBalanceChange } },
    })

    return transaction
  })

  return result as TransactionWithRelations
}

export async function updateTransfer(id: string, data: UpdateTransferData): Promise<TransactionWithRelations> {
  const oldTransaction = await prisma.transaction.findUnique({ where: { id } })
  if (!oldTransaction) throw new NotFoundError('交易记录')

  const oldFee = toDecimal(oldTransaction.fee)
  const oldCoupon = toDecimal(oldTransaction.coupon)

  const result = await prisma.$transaction(async (tx) => {
    const oldOutAmount = calculateBalanceChangeDecimal('transfer', oldTransaction.amount, oldFee, oldCoupon)
    await tx.account.update({
      where: { id: oldTransaction.accountId },
      data: { balance: { decrement: oldOutAmount.abs() } },
    })
    const oldInAmount = calculateTransferInAmountDecimal(oldTransaction.amount, oldFee, oldCoupon)
    await tx.account.update({
      where: { id: oldTransaction.toAccountId! },
      data: { balance: { decrement: oldInAmount } },
    })

    const newAmount = data.amount !== undefined ? toDecimal(data.amount) : oldTransaction.amount
    const newFee = data.fee !== undefined ? toDecimal(data.fee) : oldFee
    const newCoupon = data.coupon !== undefined ? toDecimal(data.coupon) : oldCoupon
    const newAccountId = data.accountId || oldTransaction.accountId
    const newToAccountId = data.toAccountId || oldTransaction.toAccountId!

    const transaction = await tx.transaction.update({
      where: { id },
      data: {
        amount: newAmount,
        fee: newFee,
        coupon: newCoupon,
        date: data.date || oldTransaction.date,
        note: data.note !== undefined ? data.note : oldTransaction.note,
        accountId: newAccountId,
        toAccountId: newToAccountId,
        categoryId: data.categoryId !== undefined ? data.categoryId : oldTransaction.categoryId,
      },
      include: { account: true, toAccount: true, category: true },
    })

    const newOutAmount = calculateBalanceChangeDecimal('transfer', newAmount, newFee, newCoupon)
    await tx.account.update({
      where: { id: newAccountId },
      data: { balance: { increment: newOutAmount } },
    })
    const newInAmount = calculateTransferInAmountDecimal(newAmount, newFee, newCoupon)
    await tx.account.update({
      where: { id: newToAccountId },
      data: { balance: { increment: newInAmount } },
    })

    return transaction
  })

  return result as TransactionWithRelations
}

export async function updateRefund(id: string, data: UpdateRefundData): Promise<TransactionWithRelations> {
  const oldTransaction = await prisma.transaction.findUnique({ where: { id } })
  if (!oldTransaction) throw new NotFoundError('交易记录')

  const oldFee = toDecimal(oldTransaction.fee)
  const oldCoupon = toDecimal(oldTransaction.coupon)

  const result = await prisma.$transaction(async (tx) => {
    const oldBalanceChange = calculateBalanceChangeDecimal('refund', oldTransaction.amount, oldFee, oldCoupon)
    await tx.account.update({
      where: { id: oldTransaction.accountId },
      data: { balance: { decrement: oldBalanceChange.abs() } },
    })

    const newAmount = data.amount !== undefined ? toDecimal(data.amount) : oldTransaction.amount
    const newFee = data.fee !== undefined ? toDecimal(data.fee) : oldFee
    const newCoupon = data.coupon !== undefined ? toDecimal(data.coupon) : oldCoupon
    const newAccountId = data.accountId || oldTransaction.accountId

    const transaction = await tx.transaction.update({
      where: { id },
      data: {
        amount: newAmount,
        fee: newFee,
        coupon: newCoupon,
        date: data.date || oldTransaction.date,
        note: data.note !== undefined ? data.note : oldTransaction.note,
        accountId: newAccountId,
        categoryId: data.categoryId !== undefined ? data.categoryId : oldTransaction.categoryId,
        relatedTransactionId: data.relatedTransactionId !== undefined ? data.relatedTransactionId : oldTransaction.relatedTransactionId,
      },
      include: { account: true, category: true, relatedTransaction: true },
    })

    const newBalanceChange = calculateBalanceChangeDecimal('refund', newAmount, newFee, newCoupon)
    await tx.account.update({
      where: { id: newAccountId },
      data: { balance: { increment: newBalanceChange } },
    })

    return transaction
  })

  return result as TransactionWithRelations
}

// ===== 查询与删除 =====

export async function getTransactionList(params: TransactionListParams): Promise<TransactionListResult> {
  const {
    page = 1,
    pageSize = 20,
  } = params

  const where = await buildTransactionListWhere(params)

  const total = await prisma.transaction.count({ where })
  const transactions = await prisma.transaction.findMany({
    where,
    include: {
      account: true,
      category: true,
      toAccount: true,
      relatedTransaction: {
        include: { account: true, category: true }
      },
    },
    orderBy: { date: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  })

  return {
    list: transactions as TransactionWithRelations[],
    total,
    page,
    pageSize,
  }
}

export async function getTransactionStats(params: TransactionListParams = {}): Promise<TransactionStats> {
  const where = await buildTransactionListWhere(params)
  where.isAdjustment = false

  // 分别统计收入退款和支出退款
  const [incomeResult, expenseResult, incomeRefundResult, expenseRefundResult, transferCount] = await Promise.all([
    prisma.transaction.aggregate({
      where: { ...where, type: 'income' },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { ...where, type: 'expense' },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { ...where, type: 'refund', relatedType: 'income' },
      _sum: { amount: true, fee: true },
    }),
    prisma.transaction.aggregate({
      where: { ...where, type: 'refund', relatedType: 'expense' },
      _sum: { amount: true, fee: true },
    }),
    prisma.transaction.count({ where: { ...where, type: 'transfer' } }),
  ])

  const income = toDecimal(incomeResult._sum.amount || 0)
  const expense = toDecimal(expenseResult._sum.amount || 0)
  const incomeRefund = toDecimal(incomeRefundResult._sum.amount || 0).minus(toDecimal(incomeRefundResult._sum.fee || 0))
  const expenseRefund = toDecimal(expenseRefundResult._sum.amount || 0).minus(toDecimal(expenseRefundResult._sum.fee || 0))
  const totalRefund = incomeRefund.plus(expenseRefund)

  return {
    income: income.minus(incomeRefund).toNumber(),
    expense: expense.minus(expenseRefund).toNumber(),
    refund: totalRefund.toNumber(),
    balance: income.minus(incomeRefund).minus(expense).plus(expenseRefund).toNumber(),
    transferCount,
  }
}

export async function getTransactionById(id: string): Promise<TransactionWithRelations | null> {
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: {
      account: true,
      category: true,
      toAccount: true,
      relatedTransaction: {
        include: { account: true, category: true }
      },
    },
  })
  return transaction as TransactionWithRelations | null
}

export async function getRefundableTransactions(): Promise<TransactionWithRelations[]> {
  const transactions = await prisma.transaction.findMany({
    where: { type: { in: ['income', 'expense'] } },
    include: { account: true, category: true },
    orderBy: { date: 'desc' },
    take: 100,
  })
  return transactions as TransactionWithRelations[]
}

export async function deleteTransaction(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.findUnique({ where: { id } })
    if (!transaction) throw new NotFoundError('交易记录')

    const amount = transaction.amount
    const fee = toDecimal(transaction.fee)
    const coupon = toDecimal(transaction.coupon)

    const balanceChange = calculateBalanceChangeDecimal(
      transaction.type as TransactionType,
      amount,
      fee,
      coupon,
    )

    if (transaction.type === 'transfer') {
      await tx.account.update({
        where: { id: transaction.accountId },
        data: { balance: { decrement: balanceChange.abs() } },
      })
      const inAmount = calculateTransferInAmountDecimal(amount, fee, coupon)
      await tx.account.update({
        where: { id: transaction.toAccountId! },
        data: { balance: { decrement: inAmount } },
      })
    } else {
      await tx.account.update({
        where: { id: transaction.accountId },
        data: { balance: { decrement: balanceChange.abs() } },
      })
    }

    await tx.transaction.delete({ where: { id } })
  })
}

export async function getEarliestTransactionDate(): Promise<Date | null> {
  const earliest = await prisma.transaction.findFirst({
    orderBy: { date: 'asc' },
    select: { date: true },
  })
  return earliest?.date || null
}
