import { prisma } from '../index.js'
import { Decimal } from '@prisma/client/runtime/library.js'
import {
  calculateBalanceChange,
  calculateTransferInAmount,
  type TransactionType
} from './balance.service.js'
import type { Transaction, Account, TransactionCategory } from '@prisma/client'
import { NotFoundError } from '../common/index.js'
import { buildTransactionListWhere } from './transaction-list.helpers.js'

// Re-export command functions for backward compatibility
export {
  createIncomeExpense,
  createTransfer,
  createRefund,
  updateIncomeExpense,
  updateTransfer,
  updateRefund,
} from './transaction-command.service.js'

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

// ===== 查询与删除 =====

export class TransactionService {
  async getTransactionList(params: TransactionListParams): Promise<TransactionListResult> {
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

  async getTransactionStats(startDate?: Date, endDate?: Date): Promise<TransactionStats> {
    const where: any = { isAdjustment: false }
    if (startDate || endDate) {
      where.date = {}
      if (startDate) where.date.gte = startDate
      if (endDate) where.date.lte = endDate
    }

    const transactions = await prisma.transaction.findMany({ where })

    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount.toNumber(), 0)
    const expense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount.toNumber(), 0)
    const refund = transactions
      .filter(t => t.type === 'refund')
      .reduce((sum, t) => sum + t.amount.toNumber(), 0)
    const transferCount = transactions.filter(t => t.type === 'transfer').length

    return {
      income,
      expense,
      refund,
      balance: income - expense + refund,
      transferCount,
    }
  }

  async getTransactionById(id: string): Promise<TransactionWithRelations | null> {
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

  async getRefundableTransactions(): Promise<TransactionWithRelations[]> {
    const transactions = await prisma.transaction.findMany({
      where: { type: { in: ['income', 'expense'] } },
      include: { account: true, category: true },
      orderBy: { date: 'desc' },
      take: 100,
    })
    return transactions as TransactionWithRelations[]
  }

  async deleteTransaction(id: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({ where: { id } })
      if (!transaction) throw new NotFoundError('交易记录')

      const fee = transaction.fee?.toNumber() || 0
      const coupon = transaction.coupon?.toNumber() || 0

      const balanceChange = calculateBalanceChange(
        transaction.type as TransactionType,
        transaction.amount.toNumber(),
        fee,
        coupon,
      )

      if (transaction.type === 'transfer') {
        await tx.account.update({
          where: { id: transaction.accountId },
          data: { balance: { decrement: new Decimal(Math.abs(balanceChange)) } },
        })
        const inAmount = calculateTransferInAmount(transaction.amount.toNumber(), fee, coupon)
        await tx.account.update({
          where: { id: transaction.toAccountId! },
          data: { balance: { decrement: new Decimal(inAmount) } },
        })
      } else {
        await tx.account.update({
          where: { id: transaction.accountId },
          data: { balance: { decrement: new Decimal(Math.abs(balanceChange)) } },
        })
      }

      await tx.transaction.delete({ where: { id } })
    })
  }

  async getEarliestTransactionDate(): Promise<Date | null> {
    const earliest = await prisma.transaction.findFirst({
      orderBy: { date: 'asc' },
      select: { date: true },
    })
    return earliest?.date || null
  }
}

export const transactionService = new TransactionService()
