import { Decimal } from '@prisma/client/runtime/library.js'
import { prisma } from '../index.js'
import { NotFoundError, ValidationError } from '../common/index.js'
import { toDecimal, ZERO } from '../common/index.js'
import { buildChildrenMap, collectDescendantIds } from '../common/tree.js'

// 预算类型
const BUDGET_TYPES = ['income', 'expense', 'transfer'] as const
// 预算周期
const BUDGET_PERIODS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const

type BudgetPayload = {
  name: string
  type: string
  amount: number
  period: string
  startDate?: string
  endDate?: string | null
  transactionTime?: number | null
  note?: string | null
  isActive?: boolean
  accountId: string
  toAccountId?: string | null
  categoryId: string
}

const toDateValue = (value: string) => new Date(String(value))

/**
 * 校验预算类型与分类类型匹配
 */
async function validateBudgetCategory(type: string, categoryId: string) {
  if (!categoryId) {
    throw new ValidationError('分类ID不能为空')
  }

  const category = await prisma.transactionCategory.findUnique({
    where: { id: categoryId },
  })
  if (!category) {
    throw new NotFoundError('交易分类')
  }
  if (category.type !== type) {
    throw new ValidationError(`预算类型"${type}"只能关联"${category.type}"类型分类`)
  }
}

/**
 * 根据周期获取时间范围
 */
function getPeriodRange(period: string, referenceDate: Date = new Date()): { startDate: Date; endDate: Date } {
  const y = referenceDate.getFullYear()
  const m = referenceDate.getMonth()
  const d = referenceDate.getDate()

  switch (period) {
    case 'daily':
      return {
        startDate: new Date(y, m, d),
        endDate: new Date(y, m, d, 23, 59, 59, 999),
      }
    case 'weekly': {
      // 周一 = 本周开始，周日 = 本周结束
      const dayOfWeek = referenceDate.getDay() // 0=Sun
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      const weekStart = new Date(y, m, d + mondayOffset)
      weekStart.setHours(0, 0, 0, 0)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)
      return { startDate: weekStart, endDate: weekEnd }
    }
    case 'monthly':
      return {
        startDate: new Date(y, m, 1),
        endDate: new Date(y, m + 1, 0),
      }
    case 'quarterly': {
      const quarter = Math.floor(m / 3)
      return {
        startDate: new Date(y, quarter * 3, 1),
        endDate: new Date(y, (quarter + 1) * 3, 0),
      }
    }
    case 'yearly':
      return {
        startDate: new Date(y, 0, 1),
        endDate: new Date(y, 11, 31),
      }
    default:
      return {
        startDate: new Date(y, m, 1),
        endDate: new Date(y, m + 1, 0),
      }
  }
}

export async function getBudgets(params?: { type?: string; period?: string; accountId?: string; categoryId?: string; isActive?: boolean }) {
  const where: Record<string, unknown> = {}
  if (params?.type) where.type = params.type
  if (params?.period) where.period = params.period
  if (params?.accountId) where.accountId = params.accountId
  if (params?.categoryId) where.categoryId = params.categoryId
  if (params?.isActive !== undefined) where.isActive = params.isActive

  return prisma.budget.findMany({
    where,
    include: { account: true, toAccount: true, category: true },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createBudget(data: BudgetPayload) {
  // 校验必要字段
  if (!data.name || data.amount == null || !data.type || !data.period || !data.accountId || !data.categoryId) {
    throw new ValidationError('缺少必要参数')
  }
  if (!BUDGET_TYPES.includes(data.type as typeof BUDGET_TYPES[number])) {
    throw new ValidationError(`无效的预算类型: ${data.type}`)
  }
  if (!BUDGET_PERIODS.includes(data.period as typeof BUDGET_PERIODS[number])) {
    throw new ValidationError(`无效的预算周期: ${data.period}`)
  }

  // 校验账户存在
  const account = await prisma.account.findUnique({ where: { id: data.accountId } })
  if (!account) {
    throw new NotFoundError('账户')
  }
  // 转账预算需要目标账户
  if (data.type === 'transfer' && !data.toAccountId) {
    throw new ValidationError('转账预算必须指定目标账户')
  }
  if (data.toAccountId) {
    const toAccount = await prisma.account.findUnique({ where: { id: data.toAccountId } })
    if (!toAccount) {
      throw new NotFoundError('目标账户')
    }
    if (data.toAccountId === data.accountId) {
      throw new ValidationError('来源账户和目标账户不能相同')
    }
  }

  // 校验分类类型匹配
  await validateBudgetCategory(data.type, data.categoryId)

  return prisma.budget.create({
    data: {
      name: data.name,
      type: data.type,
      amount: toDecimal(data.amount),
      period: data.period,
      startDate: data.startDate ? toDateValue(data.startDate) : new Date(),
      endDate: data.endDate ? toDateValue(data.endDate) : null,
      transactionTime: data.transactionTime ?? null,
      note: data.note ?? null,
      isActive: data.isActive ?? true,
      accountId: data.accountId,
      toAccountId: data.toAccountId ?? null,
      categoryId: data.categoryId,
    },
    include: { account: true, toAccount: true, category: true },
  })
}

export async function updateBudget(budgetId: string, data: BudgetPayload) {
  const existing = await prisma.budget.findUnique({ where: { id: budgetId } })
  if (!existing) {
    throw new NotFoundError('预算')
  }

  if (data.type && !BUDGET_TYPES.includes(data.type as typeof BUDGET_TYPES[number])) {
    throw new ValidationError(`无效的预算类型: ${data.type}`)
  }
  if (data.period && !BUDGET_PERIODS.includes(data.period as typeof BUDGET_PERIODS[number])) {
    throw new ValidationError(`无效的预算周期: ${data.period}`)
  }

  const type = data.type ?? existing.type
  const toAccountId = data.toAccountId !== undefined ? data.toAccountId : existing.toAccountId
  const categoryId = data.categoryId ?? existing.categoryId

  // 转账预算需要目标账户
  if (type === 'transfer' && !toAccountId) {
    throw new ValidationError('转账预算必须指定目标账户')
  }

  // 校验分类类型匹配
  await validateBudgetCategory(type, categoryId)

  if (data.toAccountId) {
    const toAccount = await prisma.account.findUnique({ where: { id: data.toAccountId } })
    if (!toAccount) {
      throw new NotFoundError('目标账户')
    }
  }

  return prisma.budget.update({
    where: { id: budgetId },
    data: {
      name: data.name,
      type: data.type,
      amount: data.amount != null ? toDecimal(data.amount) : undefined,
      period: data.period,
      startDate: data.startDate ? toDateValue(data.startDate) : undefined,
      endDate: data.endDate !== undefined ? (data.endDate ? toDateValue(data.endDate) : null) : undefined,
      transactionTime: data.transactionTime !== undefined ? data.transactionTime : undefined,
      note: data.note !== undefined ? data.note : undefined,
      isActive: data.isActive,
      accountId: data.accountId,
      toAccountId: data.toAccountId !== undefined ? data.toAccountId : undefined,
      categoryId: data.categoryId,
    },
    include: { account: true, toAccount: true, category: true },
  })
}

/**
 * 获取分类及其所有子孙分类的 ID 列表
 * 可传入预构建的 childrenMap 避免重复查询
 */
async function getCategoryWithDescendants(
  categoryId: string,
  prebuiltChildrenMap?: Map<string | null, { id: string; parentId: string | null }[]>
): Promise<string[]> {
  const childrenMap = prebuiltChildrenMap ?? await buildCategoryChildrenMap()
  return collectDescendantIds(categoryId, childrenMap)
}

async function buildCategoryChildrenMap(): Promise<Map<string | null, { id: string; parentId: string | null }[]>> {
  const allCategories = await prisma.transactionCategory.findMany({
    select: { id: true, parentId: true },
  })
  return buildChildrenMap(allCategories)
}

export async function getBudgetStatusesByIds(budgetIds: string[]) {
  if (budgetIds.length === 0) return []

  const budgets = await prisma.budget.findMany({
    where: { id: { in: budgetIds } },
    include: { account: true, toAccount: true, category: true },
  })

  const childrenMap = await buildCategoryChildrenMap()

  const results = await Promise.all(
    budgets.map(async (budget) => {
      const now = new Date()
      const dateRange = getPeriodRange(budget.period, now)
      const categoryIds = await getCategoryWithDescendants(budget.categoryId, childrenMap)

      const usedResult = await prisma.transaction.aggregate({
        where: {
          type: budget.type as string,
          date: { gte: dateRange.startDate, lte: dateRange.endDate },
          categoryId: { in: categoryIds },
        },
        _sum: { amount: true },
      })

      const used = usedResult._sum.amount || ZERO
      const amount = budget.amount
      const percentage = amount.isZero() ? 0 : Math.min(used.dividedBy(amount).times(100).toDecimalPlaces(0).toNumber(), 100)

      return {
        budget,
        used: used.toNumber(),
        remaining: Decimal.max(amount.minus(used), ZERO).toNumber(),
        percentage,
        isOverBudget: used.greaterThan(amount),
      }
    })
  )

  return results
}

export async function getBudgetStatus(budgetId: string) {
  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    include: { account: true, toAccount: true, category: true },
  })
  if (!budget) {
    throw new NotFoundError('预算')
  }

  const now = new Date()
  const dateRange = getPeriodRange(budget.period, now)

  // 获取分类及其所有子孙分类的 ID
  const categoryIds = await getCategoryWithDescendants(budget.categoryId)

  // 使用聚合查询替代全量加载
  const usedResult = await prisma.transaction.aggregate({
    where: {
      type: budget.type as string,
      date: { gte: dateRange.startDate, lte: dateRange.endDate },
      categoryId: { in: categoryIds },
    },
    _sum: { amount: true },
  })

  const used = usedResult._sum.amount || ZERO

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

/**
 * 生成预测交易流
 * 将活跃预算展开为指定时间范围内的预测交易序列
 */
export async function generatePredictions(startDate: string, endDate: string) {
  const rangeStart = toDateValue(startDate)
  const rangeEnd = toDateValue(endDate)

  const budgets = await prisma.budget.findMany({
    where: { isActive: true },
    include: { account: true, toAccount: true, category: true },
  })

  const predictions: Array<{
    date: Date
    type: string
    amount: number
    note: string | null
    accountId: string
    toAccountId: string | null
    categoryId: string | null
    budgetId: string
    budgetName: string
  }> = []

  for (const budget of budgets) {
    // 确定该预算的有效时间范围
    const effectiveStart = budget.startDate > rangeStart ? budget.startDate : rangeStart
    const effectiveEnd = budget.endDate && budget.endDate < rangeEnd ? budget.endDate : rangeEnd

    if (effectiveStart > effectiveEnd) continue

    // 根据周期和交易时间生成时间点
    const timePoints = generateTimePoints(effectiveStart, effectiveEnd, budget.period, budget.transactionTime)

    for (const tp of timePoints) {
      predictions.push({
        date: tp,
        type: budget.type,
        amount: budget.amount.toNumber(),
        note: budget.note,
        accountId: budget.accountId,
        toAccountId: budget.toAccountId,
        categoryId: budget.categoryId,
        budgetId: budget.id,
        budgetName: budget.name,
      })
    }
  }

  // 按日期排序
  predictions.sort((a, b) => a.date.getTime() - b.date.getTime())

  return predictions
}

/**
 * 根据周期和交易时间生成时间点序列
 */
function generateTimePoints(start: Date, end: Date, period: string, transactionTime: number | null): Date[] {
  const points: Date[] = []

  switch (period) {
    case 'daily': {
      const current = new Date(start)
      current.setHours(0, 0, 0, 0)
      while (current <= end) {
        points.push(new Date(current))
        current.setDate(current.getDate() + 1)
      }
      break
    }
    case 'weekly': {
      const current = new Date(start)
      current.setHours(0, 0, 0, 0)
      if (transactionTime !== null && transactionTime >= 0 && transactionTime <= 6) {
        // 跳到指定的周几（0=Mon, 6=Sun → JS: 1=Mon, 0=Sun）
        const targetDay = transactionTime === 6 ? 0 : transactionTime + 1
        while (current.getDay() !== targetDay) {
          current.setDate(current.getDate() + 1)
        }
      }
      while (current <= end) {
        points.push(new Date(current))
        current.setDate(current.getDate() + 7)
      }
      break
    }
    case 'monthly': {
      const current = new Date(start)
      current.setDate(1)
      current.setHours(0, 0, 0, 0)

      while (current <= end) {
        if (transactionTime !== null) {
          const pointDate = new Date(current)
          pointDate.setDate(transactionTime)
          if (pointDate.getMonth() === current.getMonth() && pointDate <= end) {
            points.push(pointDate)
          }
        } else {
          const lastDay = new Date(current.getFullYear(), current.getMonth() + 1, 0)
          if (lastDay <= end) {
            points.push(lastDay)
          }
        }
        current.setMonth(current.getMonth() + 1)
      }
      break
    }
    case 'quarterly': {
      const current = new Date(start)
      const q = Math.floor(current.getMonth() / 3)
      current.setMonth(q * 3, 1)
      current.setHours(0, 0, 0, 0)

      while (current <= end) {
        if (transactionTime !== null) {
          const pointDate = new Date(current)
          pointDate.setDate(pointDate.getDate() + transactionTime)
          if (pointDate <= end) {
            points.push(pointDate)
          }
        } else {
          // 默认：季度最后一天
          const currentQ = Math.floor(current.getMonth() / 3)
          const lastDay = new Date(current.getFullYear(), (currentQ + 1) * 3, 0)
          if (lastDay <= end) {
            points.push(lastDay)
          }
        }
        current.setMonth(current.getMonth() + 3)
      }
      break
    }
    case 'yearly': {
      const current = new Date(start)
      current.setMonth(0, 1)
      current.setHours(0, 0, 0, 0)

      while (current <= end) {
        if (transactionTime !== null) {
          const pointDate = new Date(current)
          pointDate.setDate(pointDate.getDate() + transactionTime)
          if (pointDate <= end) {
            points.push(pointDate)
          }
        } else {
          // 默认：12月31日
          const lastDay = new Date(current.getFullYear(), 11, 31)
          if (lastDay <= end) {
            points.push(lastDay)
          }
        }
        current.setFullYear(current.getFullYear() + 1)
      }
      break
    }
  }

  return points
}

export async function deleteBudget(budgetId: string) {
  const existing = await prisma.budget.findUnique({ where: { id: budgetId } })
  if (!existing) {
    throw new NotFoundError('预算')
  }

  await prisma.budget.delete({ where: { id: budgetId } })

  return { message: '删除成功' }
}