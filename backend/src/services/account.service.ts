import { prisma } from '../index.js'
import {
  calculateBalanceChange,
  calculateTransferInAmount,
  type TransactionType,
} from './balance.service.js'
import { Decimal } from '@prisma/client/runtime/library.js'

export interface AccountStats {
  transactionCount: number
  totalIncome: number
  totalExpense: number
}

export async function getAccountStats(accountId: string): Promise<AccountStats> {
  const transactions = await prisma.transaction.findMany({
    where: { accountId },
  })

  const transactionCount = transactions.length
  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount.toNumber(), 0)
  const totalExpense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount.toNumber(), 0)

  return { transactionCount, totalIncome, totalExpense }
}

export async function adjustAccountBalance(
  accountId: string,
  amount: number,
  date?: string,
  note?: string,
): Promise<{ transaction: any; newBalance: number }> {
  const account = await prisma.account.findUnique({ where: { id: accountId } })
  if (!account) throw new Error('账户不存在')

  const adjustDate = date ? new Date(`${date}T00:00:00`) : new Date()

  const transaction = await prisma.transaction.create({
    data: {
      type: 'adjustment',
      amount,
      date: adjustDate,
      note: note || '平账调整',
      accountId,
      isAdjustment: true,
    },
    include: { account: true },
  })

  const newBalance = account.balance.toNumber() + amount
  await prisma.account.update({
    where: { id: accountId },
    data: { balance: newBalance },
  })

  return { transaction, newBalance }
}

export async function batchAdjustAccountBalances(
  adjustments: Array<{ accountId: string; amount: number }>,
  date?: string,
  note?: string,
): Promise<{ date: Date; count: number; adjustments: any[] }> {
  const adjustDate = date ? new Date(`${date}T00:00:00`) : new Date()
  const results = []

  for (const adj of adjustments) {
    const { accountId, amount } = adj
    const account = await prisma.account.findUnique({ where: { id: accountId } })
    if (!account || amount === 0) continue

    const transaction = await prisma.transaction.create({
      data: {
        type: 'adjustment',
        amount,
        date: adjustDate,
        note: note || '批量平账调整',
        accountId,
        isAdjustment: true,
      },
    })

    const newBalance = account.balance.toNumber() + amount
    await prisma.account.update({
      where: { id: accountId },
      data: { balance: newBalance },
    })

    results.push({
      accountId,
      accountName: account.name,
      amount,
      transactionId: transaction.id,
      newBalance,
    })
  }

  return { date: adjustDate, count: results.length, adjustments: results }
}
