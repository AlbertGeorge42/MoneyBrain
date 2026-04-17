import { prisma } from '../index.js'
import { Decimal } from '@prisma/client/runtime/library.js'
import {
  calculateBalanceChangeDecimal,
  calculateTransferInAmountDecimal,
  type TransactionType,
} from './balance.service.js'
import { toDecimal, ZERO } from '../utils/decimal.js'
import {
  InsufficientBalanceError,
  NotFoundError,
} from '../common/index.js'
import type {
  TransactionWithRelations,
  CreateIncomeExpenseData,
  CreateTransferData,
  CreateRefundData,
  UpdateIncomeExpenseData,
  UpdateTransferData,
  UpdateRefundData,
} from './transaction.service.js'

export async function createIncomeExpense(data: CreateIncomeExpenseData): Promise<TransactionWithRelations> {
  const { type, amount, fee = 0, coupon = 0, date, note, accountId, categoryId } = data

  const result = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        type,
        amount: new Decimal(amount),
        fee: new Decimal(fee),
        coupon: new Decimal(coupon),
        date,
        note,
        accountId,
        categoryId,
      },
      include: { account: true, category: true },
    })

    const balanceChange = calculateBalanceChangeDecimal(type, new Decimal(amount), new Decimal(fee), new Decimal(coupon))
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

  const totalOut = new Decimal(amount).plus(fee).minus(coupon)
  if (fromAccount.balance.lessThan(totalOut)) throw new InsufficientBalanceError('转出账户')

  const toAccount = await prisma.account.findUnique({ where: { id: toAccountId } })
  if (!toAccount) throw new NotFoundError('转入账户')

  const result = await prisma.$transaction(async (tx) => {
    const outAmount = calculateBalanceChangeDecimal('transfer', new Decimal(amount), new Decimal(fee), new Decimal(coupon))
    await tx.account.update({
      where: { id: accountId },
      data: { balance: { increment: outAmount } },
    })

    const inAmount = calculateTransferInAmountDecimal(new Decimal(amount), new Decimal(fee), new Decimal(coupon))
    await tx.account.update({
      where: { id: toAccountId },
      data: { balance: { increment: inAmount } },
    })

    const transaction = await tx.transaction.create({
      data: {
        type: 'transfer',
        amount: new Decimal(amount),
        fee: new Decimal(fee),
        coupon: new Decimal(coupon),
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

  const result = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        type: 'refund',
        amount: new Decimal(amount),
        fee: new Decimal(fee),
        coupon: new Decimal(coupon),
        date,
        note,
        accountId,
        categoryId: relatedTransaction.categoryId,
        relatedTransactionId,
      },
      include: {
        account: true,
        category: true,
        relatedTransaction: { include: { account: true, category: true } },
      },
    })

    const balanceChange = calculateBalanceChangeDecimal('refund', new Decimal(amount), new Decimal(fee), new Decimal(coupon))
    await tx.account.update({
      where: { id: accountId },
      data: { balance: { increment: balanceChange } },
    })

    return transaction
  })

  return result as TransactionWithRelations
}

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
    const newAmount = data.amount !== undefined ? new Decimal(data.amount) : oldTransaction.amount
    const newFee = data.fee !== undefined ? new Decimal(data.fee) : oldFee
    const newCoupon = data.coupon !== undefined ? new Decimal(data.coupon) : oldCoupon
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

    const newAmount = data.amount !== undefined ? new Decimal(data.amount) : oldTransaction.amount
    const newFee = data.fee !== undefined ? new Decimal(data.fee) : oldFee
    const newCoupon = data.coupon !== undefined ? new Decimal(data.coupon) : oldCoupon
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

    const newAmount = data.amount !== undefined ? new Decimal(data.amount) : oldTransaction.amount
    const newFee = data.fee !== undefined ? new Decimal(data.fee) : oldFee
    const newCoupon = data.coupon !== undefined ? new Decimal(data.coupon) : oldCoupon
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
