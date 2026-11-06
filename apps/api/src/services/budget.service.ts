import type { Budget } from '@prisma/client'
import type {
  BudgetPeriodPlanPoint,
  BudgetPeriodPlanResult,
} from '../../../../packages/contracts/types/index.js'
import { NotFoundError, ValidationError, formatDateLocal, parseDateLocal } from '../common/index.js'
import { collectDescendantIds } from '../common/tree.js'
import { buildCategoryChildrenMap } from '../common/db.js'
import * as accountRepo from '../db/repositories/account.repository.js'
import * as auditEventRepo from '../db/repositories/audit-event.repository.js'
import * as budgetRepo from '../db/repositories/budget.repository.js'
import * as transactionCategoryRepo from '../db/repositories/transaction-category.repository.js'
import * as transactionRepo from '../db/repositories/transaction.repository.js'
import {
  fromDate,
  minor,
  periodOf,
  rulesFor,
  type BudgetKind,
  type BudgetScope,
  type LocalDate,
  type Minor,
  type PeriodKind,
} from '../../../../packages/domain/src/index.js'

// 预算类型
const BUDGET_TYPES = ['income', 'expense', 'transfer'] as const
// 预算周期
const BUDGET_PERIODS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const

type BudgetPayload = {
  id?: string
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

// 预算日期：先按本地日历日解析，再归一化到本地当天零点。
// date-only 字符串（'2025-12-01'）按本地零点；前端完整时间戳
// （如 '2025-12-01T16:00:00.000Z'）按本地分量归一化。
const toDateValue = (value: string) => {
  const d = parseDateLocal(value)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * 校验预算类型与分类类型匹配
 */
async function validateBudgetCategory(type: string, categoryId: string) {
  if (!categoryId) {
    throw new ValidationError('分类ID不能为空')
  }

  const category = await transactionCategoryRepo.findById(categoryId)
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

  return budgetRepo.findManyWithRelations(where, { createdAt: 'desc' })
}

export async function createBudget(data: BudgetPayload) {
  // 校验必要字段
  if (!data.name || data.amount == null || !data.type || !data.period || !data.accountId || !data.categoryId) {
    throw new ValidationError('缺少必要参数')
  }

  // 校验账户存在
  const account = await accountRepo.findById(data.accountId)
  if (!account) {
    throw new NotFoundError('账户')
  }
  if (data.toAccountId) {
    const toAccount = await accountRepo.findById(data.toAccountId)
    if (!toAccount) {
      throw new NotFoundError('目标账户')
    }
    if (data.toAccountId === data.accountId) {
      throw new ValidationError('来源账户和目标账户不能相同')
    }
  }

  // 校验预算类型/周期枚举、转账目标账户与分类类型匹配
  await validateBudgetFields(data.type, data.period, data.categoryId, data.toAccountId)

  return budgetRepo.createWithRelations({
    id: data.id,
    name: data.name,
    type: data.type,
    amount: BigInt(data.amount),
    period: data.period,
    startDate: data.startDate ? toDateValue(data.startDate) : new Date(),
    endDate: data.endDate ? toDateValue(data.endDate) : null,
    transactionTime: data.transactionTime ?? null,
    note: data.note ?? null,
    isActive: data.isActive ?? true,
    accountId: data.accountId,
    toAccountId: data.toAccountId ?? null,
    categoryId: data.categoryId,
  })
}

export async function updateBudget(budgetId: string, data: BudgetPayload) {
  const existing = await budgetRepo.findById(budgetId)
  if (!existing) {
    throw new NotFoundError('预算')
  }

  const type = data.type ?? existing.type
  const toAccountId = data.toAccountId !== undefined ? data.toAccountId : existing.toAccountId
  const categoryId = data.categoryId ?? existing.categoryId

  // 校验预算类型/周期枚举、转账目标账户与分类类型匹配（部分更新：undefined 字段跳过校验）
  await validateBudgetFields(type, data.period, categoryId, toAccountId)

  if (data.toAccountId) {
    const toAccount = await accountRepo.findById(data.toAccountId)
    if (!toAccount) {
      throw new NotFoundError('目标账户')
    }
  }

  return budgetRepo.updateWithRelations(budgetId, {
    name: data.name,
    type: data.type,
    amount: data.amount != null ? BigInt(data.amount) : undefined,
    period: data.period,
    startDate: data.startDate ? toDateValue(data.startDate) : undefined,
    endDate: data.endDate !== undefined ? (data.endDate ? toDateValue(data.endDate) : null) : undefined,
    transactionTime: data.transactionTime !== undefined ? data.transactionTime : undefined,
    note: data.note !== undefined ? data.note : undefined,
    isActive: data.isActive,
    accountId: data.accountId,
    toAccountId: data.toAccountId !== undefined ? data.toAccountId : undefined,
    categoryId: data.categoryId,
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

/** 预算状态（金额为整数分） */
type BudgetStatusResult = {
  budget: Budget
  used: Minor
  remaining: Minor
  percentage: number
  isOverBudget: boolean
}

type UsageRow = {
  accountId: string
  toAccountId: string | null
  categoryId: string | null
  type: string
  relatedType: string | null
  excludeFromIncomeExpense: boolean
  /** 写入时的口径版本：每条聚合行按自己的版本解释。 */
  ruleVersion: number
  amount: Minor
}

/**
 * 一次性聚合出该期间内、相关账户与分类下的用量。
 * 按「账户 × 转入账户 × 分类 × 类型 × 退款原类型 × 口径版本 × 不计收支」分组，
 * 返回行数与分类数量相关，与交易笔数无关。
 *
 * 统计哪些类型、账户与分类如何匹配，全部由各交易自己版本的口径规则判定；
 * 这里不在 SQL 里预筛，避免用当前规则误伤旧交易。
 */
async function aggregateUsageRows(group: BudgetPlan[]): Promise<UsageRow[]> {
  const first = group[0]
  const accountIds = [...new Set(group.map((plan) => plan.budget.accountId))]
  const categoryIds = [...new Set(group.flatMap((plan) => plan.categoryIds))]

  const grouped = await transactionRepo.sumActiveAmountByBudgetScope({
    date: { gte: first.dateRange.startDate, lt: first.dateRange.endDate },
    accountId: { in: accountIds },
    categoryId: { in: categoryIds },
  })

  return grouped.map((row) => ({
    accountId: row.accountId,
    toAccountId: row.toAccountId,
    categoryId: row.categoryId,
    type: row.type,
    relatedType: row.relatedType,
    excludeFromIncomeExpense: row.excludeFromIncomeExpense,
    ruleVersion: row.ruleVersion,
    amount: minor(Number(row._sum.amount ?? 0)),
  }))
}

/** 预算口径行的公共字段：聚合行与下钻明细交易都能映射到这。 */
type ScopedRow = {
  type: string
  accountId: string
  toAccountId: string | null
  categoryId: string | null
  excludeFromIncomeExpense: boolean
  relatedType: string | null
  ruleVersion: number
}

/**
 * 预算口径的计入符号：+1 主类型、−1 冲减退款、0 不计入。
 * 用量（computeBudgetStatus）与下钻明细（getBudgetUsageDetails）共用这一处判定（C2），
 * 「下钻列表条数与合计 == 预算用量」因此恒成立，下钻不得另写过滤条件。
 */
function budgetContributionSign(row: ScopedRow, scope: BudgetScope): 1 | -1 | 0 {
  const rules = rulesFor(row.ruleVersion)

  // 账户、分类与「不计收支」口径由领域层规则判定（与 SQL 侧同一份规则）
  const inScope = rules.matchesBudgetScope(
    {
      kind: row.type,
      accountId: row.accountId,
      toAccountId: row.toAccountId,
      categoryId: row.categoryId,
      excludeFromIncomeExpense: row.excludeFromIncomeExpense,
    },
    scope,
  )
  if (!inScope) return 0

  const query = rules.scopeQuery(scope)
  if (row.type === query.type) return 1
  // 退款冲减按退款自身的账户与分类
  if (query.countsRefunds && row.type === 'refund' && row.relatedType === query.refundRelatedType) return -1
  return 0
}

/**
 * 预算统计 plan：期间、分类子树与领域层 scope——用量与下钻共用的唯一构建处（C2）。
 */
async function buildBudgetPlan(
  budget: Budget,
  childrenMap: Map<string | null, { id: string; parentId: string | null }[]>,
  now: Date,
): Promise<BudgetPlan> {
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
}

/** 按预算口径从聚合行里算出已用、剩余与百分比。 */
function computeBudgetStatus(plan: BudgetPlan, rows: UsageRow[]): BudgetStatusResult {
  const { budget, scope } = plan

  let used = minor(0)

  for (const row of rows) {
    const sign = budgetContributionSign(row, scope)
    if (sign === 0) continue
    used = minor(used + sign * row.amount)
  }

  // 跨期退款会让本期已用为负；下限夹到 0，剩余不得超过额度
  const clamped = minor(Math.max(used, 0))
  const amount = minor(Number(budget.amount))
  // 使用率返回真实百分比，超支时 >100 不截断（C3）；
  // 前端进度条条宽自行封顶，文本必须显示真实值
  const percentage = amount === 0
    ? 0
    : Math.round((clamped / amount) * 100)

  return {
    budget,
    used: clamped,
    remaining: minor(Math.max(amount - clamped, 0)),
    percentage,
    isOverBudget: clamped > amount,
  }
}

export async function getBudgetStatusesByIds(budgetIds: string[]) {
  if (budgetIds.length === 0) return []

  const budgets = await budgetRepo.findManyWithRelations({ id: { in: budgetIds } })

  const childrenMap = await buildCategoryChildrenMap()
  const now = new Date()

  // 每个预算的期间与分类子树（与下钻共用同一 plan 构建，C2）
  const plans: BudgetPlan[] = await Promise.all(
    budgets.map((budget) => buildBudgetPlan(budget, childrenMap, now)),
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
 * 预算下钻明细（C2）：与用量同一套 plan 与计入判定，返回计入「已使用」口径的交易明细。
 * 条数与合计跟预算用量恒等——「查看交易」看到的每一笔都计入「已使用」。
 */
export async function getBudgetUsageDetails(budgetId: string) {
  const budget = await budgetRepo.findUniqueWithRelations(budgetId)
  if (!budget) throw new NotFoundError('预算')

  const childrenMap = await buildCategoryChildrenMap()
  const plan = await buildBudgetPlan(budget, childrenMap, new Date())

  // 与用量同一结构性预筛（期间 × 账户 × 分类子树）；
  // 类型、冲减与「不计收支」逐笔按交易自己的口径版本判定，不在 SQL 里预筛
  const transactions = await transactionRepo.findActive(
    {
      date: { gte: plan.dateRange.startDate, lt: plan.dateRange.endDate },
      accountId: plan.budget.accountId,
      categoryId: { in: plan.categoryIds },
    },
    { include: transactionRepo.TRANSACTION_RELATIONS, orderBy: { date: 'desc' } },
  )

  const list: Array<{ transaction: transactionRepo.TransactionWithRelations; signedAmount: Minor }> = []
  let total = minor(0)

  for (const transaction of transactions) {
    const sign = budgetContributionSign(
      {
        type: transaction.type,
        accountId: transaction.accountId,
        toAccountId: transaction.toAccountId,
        categoryId: transaction.categoryId,
        excludeFromIncomeExpense: transaction.excludeFromIncomeExpense,
        relatedType: transaction.relatedType,
        ruleVersion: transaction.ruleVersion,
      },
      plan.scope,
    )
    if (sign === 0) continue

    const signedAmount = minor(sign * Number(transaction.amount))
    list.push({ transaction, signedAmount })
    total = minor(total + signedAmount)
  }

  // 已用与预算状态同款下限：跨期退款让本期明细合计为负时夹到 0
  return {
    list,
    count: list.length,
    total,
    used: minor(Math.max(total, 0)),
  }
}

/**
 * 生成预测交易流
 * 将活跃预算展开为指定时间范围内的预测交易序列
 */
export async function generatePredictions(startDate: string, endDate: string) {
  const occurrences = await generatePredictedOccurrences(startDate, endDate)
  return occurrences.map((occurrence) => ({
    date: occurrence.date,
    type: occurrence.type,
    amount: occurrence.amount,
    note: occurrence.note,
    accountId: occurrence.accountId,
    toAccountId: occurrence.toAccountId,
    categoryId: occurrence.categoryId,
    budgetId: occurrence.budgetId,
    budgetName: occurrence.budgetName,
  }))
}

/** 预算展开点位：日期 + 所属周期范围（用于和真实交易做 occurrence 匹配）。 */
export interface PredictedOccurrence {
  date: Date
  /** 该点位所属预算周期的第一天（含）。 */
  periodStart: Date
  /** 该点位所属预算周期的最后一天（含）。 */
  periodEnd: Date
  type: string
  amount: number
  note: string | null
  accountId: string
  toAccountId: string | null
  categoryId: string | null
  budgetId: string
  budgetName: string
}

/**
 * 展开活跃预算并保留每个点位的周期范围。
 * 与 `generatePredictions` 共用同一份展开逻辑，后者只是去掉周期字段后的旧返回结构。
 */
export async function generatePredictedOccurrences(startDate: string, endDate: string): Promise<PredictedOccurrence[]> {
  const rangeStart = toDateValue(startDate)
  const rangeEnd = toDateValue(endDate)

  const budgets = await budgetRepo.findManyWithRelations({ isActive: true })

  const occurrences: PredictedOccurrence[] = []

  for (const budget of budgets) {
    // 确定该预算的有效时间范围
    const effectiveStart = budget.startDate > rangeStart ? budget.startDate : rangeStart
    const effectiveEnd = budget.endDate && budget.endDate < rangeEnd ? budget.endDate : rangeEnd

    if (effectiveStart > effectiveEnd) continue

    // 根据周期和交易时间生成点位（每个点位带自己的周期范围）
    const points = generateBudgetOccurrences(effectiveStart, effectiveEnd, budget.period, budget.transactionTime)

    for (const point of points) {
      occurrences.push({
        date: point.date,
        periodStart: point.periodStart,
        periodEnd: point.periodEnd,
        type: budget.type,
        amount: Number(budget.amount),
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
  occurrences.sort((a, b) => a.date.getTime() - b.date.getTime())

  return occurrences
}

/** 预算展开点位（含所属周期范围）。 */
export interface BudgetOccurrencePoint {
  date: Date
  periodStart: Date
  periodEnd: Date
}

/**
 * 根据周期和交易时间生成点位序列。
 *
 * 只返回落在 [start, end] 内的点：起点之前的本期点位（如月度预算的 5 号、
 * 季度/年度天偏移落点）不会因为「本周期开始」而被带进窗口——
 * 否则推演会把已经过去的点位算成未来预测。
 *
 * transactionTime 语义：
 * - daily：忽略
 * - weekly：0=周一 … 6=周日（缺省周日）
 * - monthly：几号（缺省月末）
 * - quarterly / yearly：从周期起点起的天偏移（缺省周期末）
 *
 * 每个点位同时给出它所属的预算周期 [periodStart, periodEnd]，供 occurrence 匹配使用。
 */
export function generateBudgetOccurrences(
  start: Date,
  end: Date,
  period: string,
  transactionTime: number | null,
): BudgetOccurrencePoint[] {
  const points: BudgetOccurrencePoint[] = []
  const inRange = (date: Date) => date >= start && date <= end
  const weekRange = (date: Date) => {
    const weekStart = new Date(date)
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    return { periodStart: weekStart, periodEnd: weekEnd }
  }

  switch (period) {
    case 'daily': {
      const current = new Date(start)
      current.setHours(0, 0, 0, 0)
      while (current <= end) {
        const day = new Date(current)
        points.push({ date: day, periodStart: day, periodEnd: day })
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
        const { periodStart, periodEnd } = weekRange(current)
        points.push({ date: new Date(current), periodStart, periodEnd })
        current.setDate(current.getDate() + 7)
      }
      break
    }
    case 'monthly': {
      const current = new Date(start)
      current.setDate(1)
      current.setHours(0, 0, 0, 0)

      while (current <= end) {
        const periodStart = new Date(current)
        const periodEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0)
        if (transactionTime !== null) {
          const pointDate = new Date(current)
          pointDate.setDate(transactionTime)
          if (pointDate.getMonth() === current.getMonth() && inRange(pointDate)) {
            points.push({ date: pointDate, periodStart, periodEnd })
          }
        } else if (inRange(periodEnd)) {
          points.push({ date: periodEnd, periodStart, periodEnd })
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
        const currentQ = Math.floor(current.getMonth() / 3)
        const periodStart = new Date(current)
        const periodEnd = new Date(current.getFullYear(), (currentQ + 1) * 3, 0)
        if (transactionTime !== null) {
          // 天偏移从**季度起点**算起（不是窗口起点），并裁掉窗口起点之前的落点
          const pointDate = new Date(current)
          pointDate.setDate(pointDate.getDate() + transactionTime)
          if (inRange(pointDate)) {
            points.push({ date: pointDate, periodStart, periodEnd })
          }
        } else if (inRange(periodEnd)) {
          // 默认：季度最后一天
          points.push({ date: periodEnd, periodStart, periodEnd })
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
        const periodStart = new Date(current)
        const periodEnd = new Date(current.getFullYear(), 11, 31)
        if (transactionTime !== null) {
          // 天偏移从**年度起点**算起（不是窗口起点），并裁掉窗口起点之前的落点
          const pointDate = new Date(current)
          pointDate.setDate(pointDate.getDate() + transactionTime)
          if (inRange(pointDate)) {
            points.push({ date: pointDate, periodStart, periodEnd })
          }
        } else if (inRange(periodEnd)) {
          // 默认：12月31日
          points.push({ date: periodEnd, periodStart, periodEnd })
        }
        current.setFullYear(current.getFullYear() + 1)
      }
      break
    }
  }

  return points
}

/** 只要日期序列的旧接口：与 `generateBudgetOccurrences` 同一份实现。 */
export function generateBudgetTimePoints(start: Date, end: Date, period: string, transactionTime: number | null): Date[] {
  return generateBudgetOccurrences(start, end, period, transactionTime).map((point) => point.date)
}

/** 预算类型收窄：生成器只会产出这三种，未知值直接失败而不是悄悄按 0 处理。 */
function budgetKindOf(value: string): BudgetKind {
  if (value === 'income' || value === 'expense' || value === 'transfer') return value
  throw new Error(`未知预算类型: ${value}`)
}

/**
 * 未来各周期预算额度（逐月）。
 *
 * 每个点位代表一个自然月：`hasBudget=false` 表示该月没有任何预算展开点位，
 * 此时 `totals=null`——「无预算」不能用一个 0 额度冒充。
 */
export async function buildBudgetPeriodPlan(fromMonth: string, months: number): Promise<BudgetPeriodPlanResult> {
  if (months < 1) {
    throw new ValidationError('months 必须大于 0')
  }

  const first = toDateValue(`${fromMonth}-01`)
  const windows: Array<{ month: string; start: Date; endExclusive: Date }> = []
  let cursor = new Date(first.getFullYear(), first.getMonth(), 1)
  for (let i = 0; i < months; i++) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    windows.push({
      month: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      start: cursor,
      endExclusive: next,
    })
    cursor = next
  }

  const lastWindow = windows[windows.length - 1]!
  const lastDay = new Date(lastWindow.endExclusive)
  lastDay.setDate(lastDay.getDate() - 1)
  const predictions = await generatePredictions(formatDateLocal(first), formatDateLocal(lastDay))

  const points: BudgetPeriodPlanPoint[] = windows.map((window) => ({
    month: window.month,
    hasBudget: false,
    budgets: [],
    totals: null,
  }))
  const pointByMonth = new Map(points.map((point) => [point.month, point]))

  for (const prediction of predictions) {
    const month = formatDateLocal(prediction.date).slice(0, 7)
    const point = pointByMonth.get(month)
    if (!point) continue

    const type = budgetKindOf(prediction.type)
    point.budgets.push({
      budgetId: prediction.budgetId,
      budgetName: prediction.budgetName,
      type,
      date: formatDateLocal(prediction.date),
      amount: minor(prediction.amount),
    })
    const totals = point.totals ?? {
      income: minor(0),
      expense: minor(0),
      transfer: minor(0),
    }
    totals[type] = minor(totals[type] + prediction.amount)
    point.totals = totals
    point.hasBudget = true
  }

  return { fromMonth, months, points }
}

export async function deleteBudget(budgetId: string) {
  const existing = await budgetRepo.findById(budgetId)
  if (!existing) {
    throw new NotFoundError('预算')
  }

  await budgetRepo.deleteById(budgetId)
  await auditEventRepo.createAuditEvent(
    { entity: 'budget', entityId: budgetId, action: 'deleted', before: existing },
  )

  return { message: '删除成功' }
}