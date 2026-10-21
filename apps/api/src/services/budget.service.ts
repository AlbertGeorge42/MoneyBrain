import { Decimal } from '@prisma/client/runtime/library.js'
import type { Budget } from '@prisma/client'
import { prisma } from '../prisma.js'
import { NotFoundError, ValidationError } from '../common/index.js'
import { toDecimal, ZERO } from '../common/index.js'
import { collectDescendantIds } from '../common/tree.js'
import { buildCategoryChildrenMap } from '../common/db.js'
import {
  fromDate,
  matchesBudgetScope,
  periodOf,
  scopeQuery,
  type BudgetScope,
  type LocalDate,
  type PeriodKind,
} from '../../../../packages/domain/src/index.js'

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

// 预算日期：先解析成 Date，再归一化到本地当天零点。
// 兼容 date-only 字符串（'2025-12-01'）与前端 toISOString() 完整时间戳
// （如 '2025-12-01T16:00:00.000Z'），避免 dayStart 拼接 'T00:00:00' 产生 Invalid Date。
const toDateValue = (value: string) => {
  const d = new Date(value)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

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
 * 校验预算类型/周期枚举、转账目标账户与分类类型匹配。
 * create/update 共用：undefined 字段跳过对应校验（兼容 update 部分更新）。
 */
async function validateBudgetFields(
  type?: string,
  period?: string,
  categoryId?: string,
  toAccountId?: string | null
): Promise<void> {
  if (type && !BUDGET_TYPES.includes(type as typeof BUDGET_TYPES[number])) {
    throw new ValidationError(`无效的预算类型: ${type}`)
  }
  if (period && !BUDGET_PERIODS.includes(period as typeof BUDGET_PERIODS[number])) {
    throw new ValidationError(`无效的预算周期: ${period}`)
  }
  // 转账预算需要目标账户
  if (type === 'transfer' && !toAccountId) {
    throw new ValidationError('转账预算必须指定目标账户')
  }
  // 校验分类类型匹配（需同时提供类型与分类ID）
  if (type && categoryId) {
    await validateBudgetCategory(type, categoryId)
  }
}

/**
 * 根据周期获取半开区间 [startDate, endDate)。
 * 使用领域层的 LocalDate 规则，避免月末 23:59:59.999 这类边界遗漏。
 */
function getPeriodRange(period: string, referenceDate: Date = new Date()): { startDate: Date; endDate: Date } {
  const kind = (BUDGET_PERIODS as readonly string[]).includes(period)
    ? (period as PeriodKind)
    : 'monthly'
  const range = periodOf(kind, fromDate(referenceDate))
  return { startDate: toLocalDate(range.start), endDate: toLocalDate(range.endExclusive) }
}

function toLocalDate(value: LocalDate): Date {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
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

  // 校验账户存在
  const account = await prisma.account.findUnique({ where: { id: data.accountId } })
  if (!account) {
    throw new NotFoundError('账户')
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

  // 校验预算类型/周期枚举、转账目标账户与分类类型匹配
  await validateBudgetFields(data.type, data.period, data.categoryId, data.toAccountId)

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

  const type = data.type ?? existing.type
  const toAccountId = data.toAccountId !== undefined ? data.toAccountId : existing.toAccountId
  const categoryId = data.categoryId ?? existing.categoryId

  // 校验预算类型/周期枚举、转账目标账户与分类类型匹配（部分更新：undefined 字段跳过校验）
  await validateBudgetFields(type, data.period, categoryId, toAccountId)

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

type BudgetPlan = {
  budget: Budget
  dateRange: { startDate: Date; endDate: Date }
  categoryIds: string[]
  /** 统计口径（账户 + 分类 + 冲减哪一侧），由领域层规则定义 */
  scope: BudgetScope
}

/** 预算状态（金额为 number，序列化时由统一出口转换） */
type BudgetStatusResult = {
  budget: Budget
  used: number
  remaining: number
  percentage: number
  isOverBudget: boolean
}

type UsageRow = {
  accountId: string
  toAccountId: string | null
  categoryId: string | null
  type: string
  relatedType: string | null
  amount: Decimal | null
}

/**
 * 一次性聚合出该期间内、相关账户与分类下的用量。
 * 按「账户 × 转入账户 × 分类 × 类型 × 退款原类型」分组，
 * 返回行数与分类数量相关，与交易笔数无关。
 *
 * 「统计哪些类型」由领域层规则给出（scopeQuery），这里只负责翻译成 SQL。
 */
async function aggregateUsageRows(group: BudgetPlan[]): Promise<UsageRow[]> {
  const first = group[0]
  const accountIds = [...new Set(group.map((plan) => plan.budget.accountId))]
  const categoryIds = [...new Set(group.flatMap((plan) => plan.categoryIds))]
  const countedTypes = [...new Set(group.map((plan) => scopeQuery(plan.scope).type))]

  const grouped = await prisma.transaction.groupBy({
    by: ['accountId', 'toAccountId', 'categoryId', 'type', 'relatedType'],
    where: {
      date: { gte: first.dateRange.startDate, lt: first.dateRange.endDate },
      accountId: { in: accountIds },
      categoryId: { in: categoryIds },
      excludeFromIncomeExpense: false,
      type: { in: [...countedTypes, 'refund'] },
    },
    _sum: { amount: true },
  })

  return grouped.map((row) => ({
    accountId: row.accountId,
    toAccountId: row.toAccountId,
    categoryId: row.categoryId,
    type: row.type,
    relatedType: row.relatedType,
    amount: row._sum.amount,
  }))
}

/** 按预算口径从聚合行里算出已用、剩余与百分比。 */
function computeBudgetStatus(plan: BudgetPlan, rows: UsageRow[]): BudgetStatusResult {
  const { budget, scope } = plan
  const query = scopeQuery(scope)

  let used = ZERO

  for (const row of rows) {
    // 账户与分类口径由领域层规则判定（与 SQL 侧同一份规则）
    const inScope = matchesBudgetScope(
      {
        kind: row.type,
        accountId: row.accountId,
        toAccountId: row.toAccountId,
        categoryId: row.categoryId,
        excludeFromIncomeExpense: false,
      },
      scope,
    )
    if (!inScope) continue

    const amount = row.amount ?? ZERO

    if (row.type === query.type) {
      used = used.plus(amount)
    } else if (query.countsRefunds && row.type === 'refund' && row.relatedType === query.refundRelatedType) {
      // 退款冲减按退款自身的账户与分类
      used = used.minus(amount)
    }
  }

  // 跨期退款会让本期已用为负；下限夹到 0，剩余不得超过额度
  const clamped = Decimal.max(used, ZERO)
  const amount = budget.amount
  const percentage = amount.isZero()
    ? 0
    : Decimal.min(clamped.dividedBy(amount).times(100).toDecimalPlaces(0), 100).toNumber()

  return {
    budget,
    used: clamped.toNumber(),
    remaining: Decimal.max(amount.minus(clamped), ZERO).toNumber(),
    percentage,
    isOverBudget: clamped.greaterThan(amount),
  }
}

export async function getBudgetStatusesByIds(budgetIds: string[]) {
  if (budgetIds.length === 0) return []

  const budgets = await prisma.budget.findMany({
    where: { id: { in: budgetIds } },
    include: { account: true, toAccount: true, category: true },
  })

  const childrenMap = await buildCategoryChildrenMap()
  const now = new Date()

  // 每个预算的期间与分类子树
  const plans: BudgetPlan[] = await Promise.all(
    budgets.map(async (budget) => {
      const categoryIds = await getCategoryWithDescendants(budget.categoryId, childrenMap)
      return {
        budget,
        dateRange: getPeriodRange(budget.period, now),
        categoryIds,
        scope: {
          kind: budget.type as BudgetScope['kind'],
          accountId: budget.accountId,
          toAccountId: budget.toAccountId,
          categoryIds: new Set(categoryIds),
        },
      }
    })
  )

  // 同一期间的预算共用一次聚合查询，避免每个预算各查两次
  const plansByRange = new Map<string, BudgetPlan[]>()
  for (const plan of plans) {
    const key = `${plan.dateRange.startDate.getTime()}-${plan.dateRange.endDate.getTime()}`
    const group = plansByRange.get(key)
    if (group) {
      group.push(plan)
    } else {
      plansByRange.set(key, [plan])
    }
  }

  const statusByBudgetId = new Map<string, BudgetStatusResult>()
  for (const group of plansByRange.values()) {
    const rows = await aggregateUsageRows(group)
    for (const plan of group) {
      statusByBudgetId.set(plan.budget.id, computeBudgetStatus(plan, rows))
    }
  }

  // 保持与 budgets 一致的顺序
  return budgets
    .map((budget) => statusByBudgetId.get(budget.id))
    .filter((status): status is BudgetStatusResult => Boolean(status))
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