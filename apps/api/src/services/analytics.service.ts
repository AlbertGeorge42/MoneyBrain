import { prisma } from '../prisma.js'
import type { Prisma } from '@prisma/client'
import { calculateBalancesBatch } from './balance.service.js'
import { toLedgerTransaction } from './ledger.adapter.js'
import { buildCategoryChildrenMap } from '../common/db.js'
import { dayStart, nextDay } from '../common/date.js'
import {
  UNCATEGORIZED_CATEGORY_ID,
  ZERO_MINOR,
  add,
  flowByCategory,
  fromDate,
  summarizeFlows,
  type Minor,
  type Period,
} from '../../../../packages/domain/src/index.js'

export interface TrendItem {
  label: string
  amount: Minor
}

export interface CategoryBreakdownItem {
  name: string
  value: Minor
  categoryId?: string
  hasChildren?: boolean
}

/** 所有派生统计都需要的交易字段；避免各查询的 select 漂移。 */
const LEDGER_SELECT = {
  id: true,
  type: true,
  ruleVersion: true,
  amount: true,
  fee: true,
  coupon: true,
  date: true,
  accountId: true,
  toAccountId: true,
  categoryId: true,
  relatedTransactionId: true,
  relatedType: true,
  excludeFromIncomeExpense: true,
} satisfies Prisma.TransactionSelect

function toPeriod(start: Date, endExclusive: Date): Period {
  return { start: fromDate(start), endExclusive: fromDate(endExclusive) }
}

// ===== Dashboard 聚合数据 =====

export async function getDashboardSummary() {
  const now = new Date()
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  // 一次取回两个月，交给领域层统一冲减退款。
  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: lastMonthStart, lt: nextMonthStart },
      excludeFromIncomeExpense: false,
    },
    select: LEDGER_SELECT,
  })
  const ledger = transactions.map(toLedgerTransaction)
  const thisMonth = summarizeFlows(ledger, toPeriod(currentMonthStart, nextMonthStart))
  const lastMonth = summarizeFlows(ledger, toPeriod(lastMonthStart, currentMonthStart))

  // 最近交易（含账户和分类信息）
  const recentTransactions = await prisma.transaction.findMany({
    include: { account: true, category: true, toAccount: true },
    orderBy: { date: 'desc' },
    take: 8,
  })

  return {
    thisMonth: {
      income: thisMonth.netIncome,
      expense: thisMonth.netExpense,
      balance: thisMonth.balance,
    },
    lastMonth: {
      income: lastMonth.netIncome,
      expense: lastMonth.netExpense,
    },
    recentTransactions,
  }
}

/** 近 12 个月窗口：趋势图与分类占比共用，未指定期间时按此范围查询。 */
function recent12MonthsWindow(): { startDate: Date; endExclusive: Date } {
  const now = new Date()
  return {
    startDate: new Date(now.getFullYear(), now.getMonth() - 11, 1),
    endExclusive: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  }
}

export async function getTrends(type: string): Promise<TrendItem[]> {
  if (type !== 'income' && type !== 'expense') return []

  const now = new Date()
  const { startDate, endExclusive } = recent12MonthsWindow()

  // 单次查询获取12个月全部数据，退款交给领域层冲减。
  const transactions = await prisma.transaction.findMany({
    where: {
      type: { in: [type, 'refund'] },
      date: { gte: startDate, lt: endExclusive },
      excludeFromIncomeExpense: false,
    },
    select: LEDGER_SELECT,
  })
  const ledger = transactions.map(toLedgerTransaction)

  const result: TrendItem[] = []
  for (let i = 11; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const summary = summarizeFlows(ledger, toPeriod(monthStart, monthEnd))
    result.push({
      label: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
      amount: type === 'income' ? summary.netIncome : summary.netExpense,
    })
  }

  return result
}

export async function getCategoryBreakdown(
  type: string,
  startDate?: string,
  endDate?: string,
  parentCategoryId?: string,
): Promise<CategoryBreakdownItem[]> {
  if (type !== 'income' && type !== 'expense') return []

  // 退款也取回，由领域层按 relatedType 冲减对应分类。
  const where: Prisma.TransactionWhereInput = {
    type: { in: [type, 'refund'] },
    amount: { not: 0 },
    excludeFromIncomeExpense: false,
  }
  if (startDate && endDate) {
    where.date = {
      gte: dayStart(startDate),
      lt: nextDay(endDate),
    }
  } else {
    // 未指定期间时默认近 12 个月（与趋势图一致），
    // 避免首页每次加载都扫描全部历史交易
    const window = recent12MonthsWindow()
    where.date = { gte: window.startDate, lt: window.endExclusive }
  }

  // 先加载全量分类：用于构建层级结构、判断 hasChildren
  const allCategories = await prisma.transactionCategory.findMany({
    where: { type },
  })
  const categoryMap = new Map(allCategories.map(c => [c.id, c]))
  // parent→children 映射：复用公共实现（传入已加载的全量分类，避免二次查询）
  const childrenOf = await buildCategoryChildrenMap(type, allCategories)

  const transactions = await prisma.transaction.findMany({
    where,
    select: {
      ...LEDGER_SELECT,
      category: { select: { id: true, name: true, parentId: true } },
    },
  })
  const flow = flowByCategory(transactions.map(toLedgerTransaction), type)

  if (parentCategoryId) {
    // 下钻：返回 parentCategoryId 的所有子分类（按分类层级，不只看交易）
    // 这样即使子分类暂无交易，UI 也能展示层级结构
    const kids = childrenOf.get(parentCategoryId) ?? []
    return kids
      .map((cat) => ({
        name: categoryMap.get(cat.id)?.name ?? '未分类',
        value: flow.get(cat.id) ?? ZERO_MINOR,
        categoryId: cat.id,
        hasChildren: (childrenOf.get(cat.id) ?? []).length > 0,
      }))
      .sort((a, b) => b.value - a.value)
  }

  const parentCategories = allCategories.filter(c => c.parentId === null)
  const parentCategoryMap = new Map(parentCategories.map(c => [c.id, c.name]))

  const breakdown = new Map<string, { value: Minor; categoryId: string; hasChildren: boolean }>()
  for (const [categoryId, amount] of flow) {
    let parentName = '未分类'
    let parentId = ''

    const category = categoryId === UNCATEGORIZED_CATEGORY_ID ? undefined : categoryMap.get(categoryId)
    if (category) {
      if (category.parentId && parentCategoryMap.has(category.parentId)) {
        parentName = parentCategoryMap.get(category.parentId)!
        parentId = category.parentId
      } else if (!category.parentId) {
        parentName = category.name
        parentId = category.id
      }
    }

    const bucket = breakdown.get(parentName) ?? {
      value: ZERO_MINOR,
      categoryId: parentId,
      hasChildren: (childrenOf.get(parentId) ?? []).length > 0,
    }
    bucket.value = add(bucket.value, amount)
    breakdown.set(parentName, bucket)
  }

  return [...breakdown.entries()]
    .map(([name, data]) => ({
      name,
      value: data.value,
      categoryId: data.categoryId,
      hasChildren: data.hasChildren,
    }))
    .sort((a, b) => b.value - a.value)
}

export async function getAssetTrend(): Promise<Array<{
  label: string
  assets: number
  liabilities: number
  netWorth: number
}>> {
  const now = new Date()
  const months: { label: string; targetDate: Date }[] = []

  for (let i = 11; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    months.push({
      label: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`,
      targetDate: nextMonthStart,
    })
  }

  const accounts = await prisma.account.findMany()

  const allAccountIds = accounts.map(a => a.id)
  const monthDates = months.map(m => m.targetDate)
  const balanceCache = await calculateBalancesBatch(allAccountIds, monthDates)

  return months.map(({ label, targetDate }) => {
    const balances = allAccountIds.map(id => balanceCache.get(id, targetDate))
    const assets = balances
      .filter((_, idx) => accounts[idx].type === 'asset')
      .reduce((sum, b) => sum + b, 0)
    const liabilities = balances
      .filter((_, idx) => accounts[idx].type === 'liability')
      .reduce((sum, b) => sum + b, 0)
    return {
      label,
      assets,
      liabilities: Math.abs(liabilities),
      netWorth: assets + liabilities,
    }
  })
}
