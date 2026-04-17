import { prisma } from '../index.js'
import { Decimal } from '@prisma/client/runtime/library.js'
import {
  calculateBalanceChangeDecimal,
  calculateTransferInAmountDecimal,
  type TransactionType
} from './balance.service.js'
import { toDecimal, ZERO } from '../utils/decimal.js'
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

  async getTransactionStats(params: TransactionListParams = {}): Promise<TransactionStats> {
    const where = await buildTransactionListWhere(params)
    where.isAdjustment = false

    const transactions = await prisma.transaction.findMany({ where })

    let income = ZERO
    let expense = ZERO
    let refund = ZERO

    transactions.forEach(t => {
      const amount = t.amount
      if (t.type === 'income') {
        income = income.plus(amount)
      } else if (t.type === 'expense') {
        expense = expense.plus(amount)
      } else if (t.type === 'refund') {
        const fee = toDecimal(t.fee)
        refund = refund.plus(amount.minus(fee))
      }
    })

    const transferCount = transactions.filter(t => t.type === 'transfer').length

    return {
      income: income.toNumber(),
      expense: expense.toNumber(),
      refund: refund.toNumber(),
      balance: income.minus(expense).plus(refund).toNumber(),
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

  async getEarliestTransactionDate(): Promise<Date | null> {
    const earliest = await prisma.transaction.findFirst({
      orderBy: { date: 'asc' },
      select: { date: true },
    })
    return earliest?.date || null
  }
}

export const transactionService = new TransactionService()
