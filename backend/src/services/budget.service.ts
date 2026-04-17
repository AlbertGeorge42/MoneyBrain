import { Decimal } from '@prisma/client/runtime/library.js'
import { prisma } from '../index.js'
import { NotFoundError } from '../common/index.js'
import { ZERO } from '../utils/decimal.js'

type BudgetPayload = {
  name: string
  amount: number
  period: string
  startDate?: string
  endDate?: string | null
  categoryId?: string | null
}

const toDateValue = (value: string) => new Date(String(value))

export async function getBudgets(period?: string) {
  const where = period ? { period } : undefined

  return prisma.budget.findMany({
    where,
    include: { category: true, alerts: true },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getBudgetDetail(budgetId: string) {
  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    include: { category: true, alerts: true },
  })
  if (!budget) {
    throw new NotFoundError('预算')
  }

  return budget
}

export async function createBudget(data: BudgetPayload) {
  return prisma.budget.create({
    data: {
      name: data.name,
      amount: new Decimal(data.amount),
      period: data.period,
      startDate: data.startDate ? toDateValue(data.startDate) : new Date(),
      endDate: data.endDate ? toDateValue(data.endDate) : null,
      categoryId: data.categoryId,
    },
    include: { category: true },
  })
}

export async function updateBudget(budgetId: string, data: BudgetPayload) {
  return prisma.budget.update({
    where: { id: budgetId },
    data: {
      name: data.name,
      amount: new Decimal(data.amount),
      period: data.period,
      startDate: data.startDate ? toDateValue(data.startDate) : undefined,
      endDate: data.endDate ? toDateValue(data.endDate) : data.endDate === null ? null : undefined,
      categoryId: data.categoryId,
    },
    include: { category: true },
  })
}

export async function getBudgetStatus(budgetId: string) {
  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    include: { category: true },
  })
  if (!budget) {
    throw new NotFoundError('预算')
  }

  const now = new Date()
  const dateRange = budget.period === 'monthly'
    ? {
        startDate: new Date(now.getFullYear(), now.getMonth(), 1),
        endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      }
    : {
        startDate: new Date(now.getFullYear(), 0, 1),
        endDate: new Date(now.getFullYear(), 11, 31),
      }

  const where: {
    type: 'expense'
    date: { gte: Date; lte: Date }
    categoryId?: string
  } = {
    type: 'expense',
    date: { gte: dateRange.startDate, lte: dateRange.endDate },
  }
  if (budget.categoryId) {
    where.categoryId = budget.categoryId
  }

  const transactions = await prisma.transaction.findMany({ where })
  let used = ZERO
  transactions.forEach(t => {
    used = used.plus(t.amount)
  })

  const amount = budget.amount
  const percentage = amount.isZero() ? 0 : Math.min(used.dividedBy(amount).times(100).toDecimalPlaces(0).toNumber(), 100)

  return {
    budget,
    used: used.toNumber(),
    remaining: Decimal.max(amount.minus(used), ZERO).toNumber(),
    percentage,
    isOverBudget: used.greaterThan(amount),
  }
}

export async function deleteBudget(budgetId: string) {
  await prisma.$transaction([
    prisma.budgetAlert.deleteMany({ where: { budgetId } }),
    prisma.budget.delete({ where: { id: budgetId } }),
  ])

  return { message: '删除成功' }
}
