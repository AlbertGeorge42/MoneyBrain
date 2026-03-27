import { prisma } from '../index.js'
import { Decimal } from '@prisma/client/runtime/library.js'
import {
  calculateBalanceChange,
  calculateTransferInAmount,
  type TransactionType
} from './balance.service.js'
import type { Transaction, Account, TransactionCategory } from '@prisma/client'

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

export class TransactionService {
  async getTransactionList(params: TransactionListParams): Promise<TransactionListResult> {
    const {
      page = 1,
      pageSize = 20,
      accountId,
      categoryId,
      type,
      startDate,
      endDate,
    } = params

    const where: any = {}
    
    // 账户筛选支持多选，支持按账户分类筛选（以 category_ 开头）
    if (accountId) {
      const accountIds = Array.isArray(accountId) ? accountId : [accountId]
      const actualAccountIds: string[] = []
      
      for (const id of accountIds) {
        if (id.startsWith('category_')) {
          // 按账户分类筛选，查找该分类下的所有账户
          const categoryAccounts = await prisma.account.findMany({
            where: { categoryId: id.replace('category_', '') },
            select: { id: true },
          })
          actualAccountIds.push(...categoryAccounts.map(a => a.id))
        } else {
          actualAccountIds.push(id)
        }
      }
      
      if (actualAccountIds.length > 0) {
        where.OR = actualAccountIds.flatMap(id => [
          { accountId: id },
          { toAccountId: id },
        ])
      }
    }
    
    // 分类筛选支持多选，支持按父分类筛选（包含所有子分类）
    if (categoryId) {
      const categoryIds = Array.isArray(categoryId) ? categoryId : [categoryId]
      const actualCategoryIds: string[] = []
      
      // 递归获取所有子分类
      const getAllChildCategoryIds = async (parentId: string): Promise<string[]> => {
        const children = await prisma.transactionCategory.findMany({
          where: { parentId },
          select: { id: true },
        })
        const childIds = children.map(c => c.id)
        const grandChildIds = await Promise.all(childIds.map(getAllChildCategoryIds))
        return [...childIds, ...grandChildIds.flat()]
      }
      
      for (const id of categoryIds) {
        actualCategoryIds.push(id)
        // 获取所有子分类
        const childIds = await getAllChildCategoryIds(id)
        actualCategoryIds.push(...childIds)
      }
      
      where.categoryId = { in: actualCategoryIds }
    }
    
    // 类型筛选支持多选
    if (type) {
      const types = Array.isArray(type) ? type : [type]
      where.type = { in: types }
    }
    
    if (startDate || endDate) {
      where.date = {}
      if (startDate) where.date.gte = startDate
      if (endDate) where.date.lte = endDate
    }

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
      where: {
        type: { in: ['income', 'expense'] },
      },
      include: {
        account: true,
        category: true,
      },
      orderBy: { date: 'desc' },
      take: 100,
    })
    return transactions as TransactionWithRelations[]
  }

  async createIncomeExpense(data: CreateIncomeExpenseData): Promise<TransactionWithRelations> {
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

      const balanceChange = calculateBalanceChange(type, amount, fee, coupon)
      await tx.account.update({
        where: { id: accountId },
        data: { balance: { increment: new Decimal(balanceChange) } },
      })

      return transaction
    })

    return result as TransactionWithRelations
  }

  async createTransfer(data: CreateTransferData): Promise<TransactionWithRelations> {
    const { amount, fee = 0, coupon = 0, date, note, accountId, toAccountId, categoryId } = data

    const fromAccount = await prisma.account.findUnique({
      where: { id: accountId },
    })
    if (!fromAccount) {
      throw new Error('转出账户不存在')
    }

    const totalOut = amount + fee - coupon
    if (fromAccount.balance.toNumber() < totalOut) {
      throw new Error('转出账户余额不足')
    }

    const toAccount = await prisma.account.findUnique({
      where: { id: toAccountId },
    })
    if (!toAccount) {
      throw new Error('转入账户不存在')
    }

    const result = await prisma.$transaction(async (tx) => {
      const outAmount = calculateBalanceChange('transfer', amount, fee, coupon)
      await tx.account.update({
        where: { id: accountId },
        data: { balance: { increment: new Decimal(outAmount) } },
      })

      const inAmount = calculateTransferInAmount(amount, fee, coupon)
      await tx.account.update({
        where: { id: toAccountId },
        data: { balance: { increment: new Decimal(inAmount) } },
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
        include: {
          account: true,
          toAccount: true,
          category: true,
        },
      })

      return transaction
    })

    return result as TransactionWithRelations
  }

  async createRefund(data: CreateRefundData): Promise<TransactionWithRelations> {
    const { amount, fee = 0, coupon = 0, date, note, accountId, relatedTransactionId } = data

    const relatedTransaction = await prisma.transaction.findUnique({
      where: { id: relatedTransactionId },
    })
    if (!relatedTransaction) {
      throw new Error('原交易记录不存在')
    }

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
          relatedTransaction: {
            include: { account: true, category: true }
          },
        },
      })

      const balanceChange = calculateBalanceChange('refund', amount, fee, coupon)
      await tx.account.update({
        where: { id: accountId },
        data: { balance: { increment: new Decimal(balanceChange) } },
      })

      return transaction
    })

    return result as TransactionWithRelations
  }

  async updateIncomeExpense(id: string, data: UpdateIncomeExpenseData): Promise<TransactionWithRelations> {
    const oldTransaction = await prisma.transaction.findUnique({
      where: { id },
    })
    if (!oldTransaction) {
      throw new Error('交易记录不存在')
    }

    const oldFee = oldTransaction.fee?.toNumber() || 0
    const oldCoupon = oldTransaction.coupon?.toNumber() || 0

    const result = await prisma.$transaction(async (tx) => {
      const oldBalanceChange = calculateBalanceChange(
        oldTransaction.type as TransactionType,
        oldTransaction.amount.toNumber(),
        oldFee,
        oldCoupon
      )
      await tx.account.update({
        where: { id: oldTransaction.accountId },
        data: { balance: { decrement: new Decimal(Math.abs(oldBalanceChange)) } },
      })

      const newType = data.type || oldTransaction.type
      const newAmount = data.amount !== undefined ? data.amount : oldTransaction.amount.toNumber()
      const newFee = data.fee !== undefined ? data.fee : oldFee
      const newCoupon = data.coupon !== undefined ? data.coupon : oldCoupon
      const newAccountId = data.accountId || oldTransaction.accountId

      const transaction = await tx.transaction.update({
        where: { id },
        data: {
          type: newType,
          amount: new Decimal(newAmount),
          fee: new Decimal(newFee),
          coupon: new Decimal(newCoupon),
          date: data.date || oldTransaction.date,
          note: data.note !== undefined ? data.note : oldTransaction.note,
          accountId: newAccountId,
          categoryId: data.categoryId || oldTransaction.categoryId,
        },
        include: { account: true, category: true },
      })

      const newBalanceChange = calculateBalanceChange(newType as TransactionType, newAmount, newFee, newCoupon)
      await tx.account.update({
        where: { id: newAccountId },
        data: { balance: { increment: new Decimal(newBalanceChange) } },
      })

      return transaction
    })

    return result as TransactionWithRelations
  }

  async updateTransfer(id: string, data: UpdateTransferData): Promise<TransactionWithRelations> {
    const oldTransaction = await prisma.transaction.findUnique({
      where: { id },
    })
    if (!oldTransaction) {
      throw new Error('交易记录不存在')
    }

    const oldFee = oldTransaction.fee?.toNumber() || 0
    const oldCoupon = oldTransaction.coupon?.toNumber() || 0

    const result = await prisma.$transaction(async (tx) => {
      const oldOutAmount = calculateBalanceChange(
        'transfer',
        oldTransaction.amount.toNumber(),
        oldFee,
        oldCoupon
      )
      await tx.account.update({
        where: { id: oldTransaction.accountId },
        data: { balance: { decrement: new Decimal(Math.abs(oldOutAmount)) } },
      })
      const oldInAmount = calculateTransferInAmount(oldTransaction.amount.toNumber(), oldFee, oldCoupon)
      await tx.account.update({
        where: { id: oldTransaction.toAccountId! },
        data: { balance: { decrement: new Decimal(oldInAmount) } },
      })

      const newAmount = data.amount !== undefined ? data.amount : oldTransaction.amount.toNumber()
      const newFee = data.fee !== undefined ? data.fee : oldFee
      const newCoupon = data.coupon !== undefined ? data.coupon : oldCoupon
      const newAccountId = data.accountId || oldTransaction.accountId
      const newToAccountId = data.toAccountId || oldTransaction.toAccountId!

      const transaction = await tx.transaction.update({
        where: { id },
        data: {
          amount: new Decimal(newAmount),
          fee: new Decimal(newFee),
          coupon: new Decimal(newCoupon),
          date: data.date || oldTransaction.date,
          note: data.note !== undefined ? data.note : oldTransaction.note,
          accountId: newAccountId,
          toAccountId: newToAccountId,
          categoryId: data.categoryId !== undefined ? data.categoryId : oldTransaction.categoryId,
        },
        include: {
          account: true,
          toAccount: true,
          category: true,
        },
      })

      const newOutAmount = calculateBalanceChange('transfer', newAmount, newFee, newCoupon)
      await tx.account.update({
        where: { id: newAccountId },
        data: { balance: { increment: new Decimal(newOutAmount) } },
      })
      const newInAmount = calculateTransferInAmount(newAmount, newFee, newCoupon)
      await tx.account.update({
        where: { id: newToAccountId },
        data: { balance: { increment: new Decimal(newInAmount) } },
      })

      return transaction
    })

    return result as TransactionWithRelations
  }

  async updateRefund(id: string, data: UpdateRefundData): Promise<TransactionWithRelations> {
    const oldTransaction = await prisma.transaction.findUnique({
      where: { id },
    })
    if (!oldTransaction) {
      throw new Error('交易记录不存在')
    }

    const oldFee = oldTransaction.fee?.toNumber() || 0
    const oldCoupon = oldTransaction.coupon?.toNumber() || 0

    const result = await prisma.$transaction(async (tx) => {
      const oldBalanceChange = calculateBalanceChange(
        'refund',
        oldTransaction.amount.toNumber(),
        oldFee,
        oldCoupon
      )
      await tx.account.update({
        where: { id: oldTransaction.accountId },
        data: { balance: { decrement: new Decimal(Math.abs(oldBalanceChange)) } },
      })

      const newAmount = data.amount !== undefined ? data.amount : oldTransaction.amount.toNumber()
      const newFee = data.fee !== undefined ? data.fee : oldFee
      const newCoupon = data.coupon !== undefined ? data.coupon : oldCoupon
      const newAccountId = data.accountId || oldTransaction.accountId

      const transaction = await tx.transaction.update({
        where: { id },
        data: {
          amount: new Decimal(newAmount),
          fee: new Decimal(newFee),
          coupon: new Decimal(newCoupon),
          date: data.date || oldTransaction.date,
          note: data.note !== undefined ? data.note : oldTransaction.note,
          accountId: newAccountId,
          categoryId: data.categoryId !== undefined ? data.categoryId : oldTransaction.categoryId,
          relatedTransactionId: data.relatedTransactionId !== undefined ? data.relatedTransactionId : oldTransaction.relatedTransactionId,
        },
        include: {
          account: true,
          category: true,
          relatedTransaction: true,
        },
      })

      const newBalanceChange = calculateBalanceChange('refund', newAmount, newFee, newCoupon)
      await tx.account.update({
        where: { id: newAccountId },
        data: { balance: { increment: new Decimal(newBalanceChange) } },
      })

      return transaction
    })

    return result as TransactionWithRelations
  }

  async deleteTransaction(id: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({
        where: { id },
      })
      if (!transaction) {
        throw new Error('交易记录不存在')
      }

      const fee = transaction.fee?.toNumber() || 0
      const coupon = transaction.coupon?.toNumber() || 0

      const balanceChange = calculateBalanceChange(
        transaction.type as TransactionType,
        transaction.amount.toNumber(),
        fee,
        coupon
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
}

export const transactionService = new TransactionService()
