import { prisma } from '../../index.js'
import { calculateBalancesBatch } from '../balance.service.js'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library.js'
import { toDecimal, ZERO, rootLogger } from '../../common/index.js'
import {
  getPredictionsIfFuture,
  computePredictedAccountTotal,
  resolveReportPeriod,
  PREDICTION_NOTE_DEFAULT,
} from './report.utils.js'

const logger = rootLogger.child({ module: 'report' })

// 现金流活动项（树形结构）
interface CashFlowActivityItem {
  categoryName: string
  categoryId: string | null
  parentId: string | null
  level: number
  amount: number
  actual: number
  predicted: number
  type: string
  direction: string
  icon?: string | null
  color?: string | null
  children?: CashFlowActivityItem[]
}

type TransactionWithIncludes = Prisma.TransactionGetPayload<{
  include: { account: true; toAccount: true; category: true }
}>

interface PredictionTransaction {
  date: Date
  type: string
  amount: number
  note: string | null
  accountId: string
  toAccountId: string | null
  categoryId: string | null
  budgetId: string
  budgetName: string
}

interface CashFlowActivityDecimal {
  inflow: Decimal
  outflow: Decimal
  items: Array<{
    categoryName: string
    categoryId: string | null
    parentId: string | null
    level: number
    amount: number
    type: string
    direction: string
    icon?: string | null
    color?: string | null
  }>
}

interface ReportValue {
  actual: number
  predicted: number
}

export interface CashFlowActivity {
  inflow: ReportValue
  outflow: ReportValue
  net: ReportValue
  items: Array<{
    categoryName: string
    amount: number
    actual: number
    predicted: number
    type: string
    direction: string
    icon?: string | null
    color?: string | null
  }>
}

export interface CashFlowResult {
  startDate: string
  endDate: string
  cashInflow: ReportValue
  cashOutflow: ReportValue
  netCashFlow: ReportValue
  flowByAccount: Record<string, { inflow: ReportValue; outflow: ReportValue }>
  cashAccounts: string[]
  startCash: ReportValue
  endCash: ReportValue
  cashChange: ReportValue
  byActivity: {
    operating: CashFlowActivity
    investing: CashFlowActivity
    financing: CashFlowActivity
    uncategorized: CashFlowActivity
  }
  sankey: {
    nodes: Array<{ name: string; category: string }>
    links: Array<{ source: string; target: string; value: number; actualValue?: number; predictedValue?: number }>
  }
  predictionNote?: string
}

// 内部使用的轻量类型（collectTransactions / aggregate 之间传递）
interface CategoryInfo {
  cashFlowType: string | null
  name: string
  icon?: string | null
  color?: string | null
  parentId: string | null
  level: number
}

interface AccountInfo {
  name: string
}

// 统一后的交易项：actual + predicted 共用同一处理路径
interface ProcessedTx {
  isPredicted: boolean
  type: string
  amount: Decimal
  fee: Decimal
  coupon: Decimal
  isFromCash: boolean
  isToCash: boolean
  categoryName: string
  categoryId: string | null
  parentId: string | null
  level: number
  cashFlowType: string | null
  accountName: string
  toAccountName: string | null
  icon: string | null
  color: string | null
}

interface AggregatedFlows {
  operating: CashFlowActivityDecimal
  investing: CashFlowActivityDecimal
  financing: CashFlowActivityDecimal
  uncategorized: CashFlowActivityDecimal
  flowByAccount: Record<string, { inflow: Decimal; outflow: Decimal }>
}

function calculateCashFlowAmount(type: string, amount: Decimal, fee: Decimal, coupon: Decimal): Decimal {
  if (type === 'expense' || type === 'transfer') {
    return amount.plus(fee).minus(coupon)
  }
  if (type === 'refund') {
    return amount.minus(fee).plus(coupon)
  }
  return amount
}

function calculateCashTransferInAmount(amount: Decimal, fee: Decimal, coupon: Decimal): Decimal {
  return amount.minus(fee).plus(coupon)
}

function addTransaction(
  activity: CashFlowActivityDecimal,
  categoryName: string,
  categoryId: string | null,
  parentId: string | null,
  level: number,
  amount: Decimal,
  type: string,
  direction: 'inflow' | 'outflow',
  icon?: string | null,
  color?: string | null,
) {
  if (direction === 'inflow') {
    activity.inflow = activity.inflow.plus(amount)
  } else {
    // 符号约定：outflow 累加为负，使 net = inflow + outflow 直接成立
    activity.outflow = activity.outflow.minus(amount)
  }
  // 查找是否已存在相同类别名称的 item，如果存在则累加金额
  const existingItem = activity.items.find(item => item.categoryName === categoryName && item.direction === direction)
  if (existingItem) {
    if (direction === 'inflow') {
      existingItem.amount += amount.toNumber()
    } else {
      existingItem.amount -= amount.toNumber()
    }
  } else {
    activity.items.push({
      categoryName,
      categoryId,
      parentId,
      level,
      amount: direction === 'inflow' ? amount.toNumber() : -amount.toNumber(),
      type,
      direction,
      icon: icon ?? null,
      color: color ?? null,
    })
  }
}

function addTransferFlow(
  activity: CashFlowActivityDecimal,
  fromName: string,
  toName: string,
  categoryId: string | null,
  parentId: string | null,
  level: number,
  amount: Decimal,
  fee: Decimal,
  coupon: Decimal,
  isOutflow: boolean,
  icon?: string | null,
  color?: string | null,
) {
  if (isOutflow) {
    const actualOutflow = calculateCashFlowAmount('transfer', amount, fee, coupon).abs()
    // 符号约定：outflow 累加为负
    activity.outflow = activity.outflow.minus(actualOutflow)
    const categoryName = fromName || '转账转出'
    const existingItem = activity.items.find(item => item.categoryName === categoryName && item.direction === 'outflow')
    if (existingItem) {
      existingItem.amount -= actualOutflow.toNumber()
    } else {
      activity.items.push({
        categoryName,
        categoryId,
        parentId,
        level,
        amount: -actualOutflow.toNumber(),
        type: 'transfer_out',
        direction: 'outflow',
        icon: icon ?? null,
        color: color ?? null,
      })
    }
  } else {
    const actualInflow = calculateCashTransferInAmount(amount, fee, coupon)
    activity.inflow = activity.inflow.plus(actualInflow)
    const categoryName = toName || '转账转入'
    const existingItem = activity.items.find(item => item.categoryName === categoryName && item.direction === 'inflow')
    if (existingItem) {
      existingItem.amount += actualInflow.toNumber()
    } else {
      activity.items.push({
        categoryName,
        categoryId,
        parentId,
        level,
        amount: actualInflow.toNumber(),
        type: 'transfer_in',
        direction: 'inflow',
        icon: icon ?? null,
        color: color ?? null,
      })
    }
  }
}

function addToMap(map: Map<string, Decimal>, key: string, value: Decimal) {
  map.set(key, (map.get(key) || ZERO).plus(value))
}

function toActivityResult(actual: CashFlowActivityDecimal, predicted: CashFlowActivityDecimal): CashFlowActivity {
  // 合并实际和预测的 items
  const itemMap = new Map<string, { categoryId: string | null; parentId: string | null; level: number; categoryName: string; actual: number; predicted: number; type: string; direction: string; icon?: string | null; color?: string | null }>()

  for (const item of actual.items) {
    const key = `${item.categoryName}|${item.type}|${item.direction}`
    itemMap.set(key, {
      categoryId: item.categoryId,
      parentId: item.parentId,
      level: item.level,
      categoryName: item.categoryName,
      actual: item.amount,
      predicted: 0,
      type: item.type,
      direction: item.direction,
      icon: item.icon,
      color: item.color,
    })
  }

  for (const item of predicted.items) {
    const key = `${item.categoryName}|${item.type}|${item.direction}`
    const existing = itemMap.get(key)
    if (existing) {
      existing.predicted = item.amount
      // 实际数据优先；预测数据仅在无实际数据时使用 icon/color
      if (existing.icon == null) existing.icon = item.icon
      if (existing.color == null) existing.color = item.color
    } else {
      itemMap.set(key, {
        categoryId: item.categoryId,
        parentId: item.parentId,
        level: item.level,
        categoryName: item.categoryName,
        actual: 0,
        predicted: item.amount,
        type: item.type,
        direction: item.direction,
        icon: item.icon,
        color: item.color,
      })
    }
  }

  const mergedItems = Array.from(itemMap.values())

  // 分离一级和二级分类
  const level1Items = mergedItems.filter(item => item.level === 1 || !item.parentId)
  const level2Items = mergedItems.filter(item => item.level === 2 || item.parentId)

  // 构建树形结构并累加
  const treeItems: CashFlowActivityItem[] = level1Items.map(item => {
    // 获取该一级分类下的所有二级子分类
    const children = level2Items
      .filter(child => child.parentId === item.categoryId)
      .map(child => ({
        categoryName: child.categoryName,
        categoryId: child.categoryId,
        parentId: child.parentId,
        level: child.level,
        amount: child.actual + child.predicted,
        actual: child.actual,
        predicted: child.predicted,
        type: child.type,
        direction: child.direction,
        icon: child.icon,
        color: child.color,
      }))

    // 累加一级分类的值 = 一级分类本身 + 所有二级子分类
    const totalActual = item.actual + children.reduce((sum, child) => sum + child.actual, 0)
    const totalPredicted = item.predicted + children.reduce((sum, child) => sum + child.predicted, 0)

    return {
      categoryName: item.categoryName,
      categoryId: item.categoryId,
      parentId: item.parentId,
      level: item.level,
      amount: totalActual + totalPredicted,
      actual: totalActual,
      predicted: totalPredicted,
      type: item.type,
      direction: item.direction,
      icon: item.icon,
      color: item.color,
      children: children.length > 0 ? children : undefined,
    }
  })

  return {
    inflow: { actual: actual.inflow.toNumber(), predicted: predicted.inflow.toNumber() },
    outflow: { actual: actual.outflow.toNumber(), predicted: predicted.outflow.toNumber() },
    // outflow 已是负数，net = inflow + outflow 直接相加
    net: { actual: actual.inflow.plus(actual.outflow).toNumber(), predicted: predicted.inflow.plus(predicted.outflow).toNumber() },
    items: treeItems,
  }
}

/**
 * 将 actual + predicted 原始数据统一规整为 ProcessedTx 列表。
 * 这样后续 aggregate 不再需要区分 isActual / isPredicted 分支。
 */
function collectTransactions(args: {
  transactions: TransactionWithIncludes[]
  predictions: PredictionTransaction[]
  start: Date
  end: Date
  cashAccountIds: string[]
  categoryMap: Map<string, CategoryInfo>
  accountMap: Map<string, AccountInfo>
}): { actualItems: ProcessedTx[]; predictedItems: ProcessedTx[] } {
  const { transactions, predictions, start, end, cashAccountIds, categoryMap, accountMap } = args
  const rangeStart = start.getTime()
  const rangeEnd = end.getTime()

  const actualItems: ProcessedTx[] = []
  for (const t of transactions) {
    const isFromCash = cashAccountIds.includes(t.accountId)
    const isToCash = !!t.toAccountId && cashAccountIds.includes(t.toAccountId)
    actualItems.push({
      isPredicted: false,
      type: t.type,
      amount: t.amount,
      fee: toDecimal(t.fee),
      coupon: toDecimal(t.coupon),
      isFromCash,
      isToCash,
      categoryName: t.category?.name || '未分类',
      categoryId: t.category?.id || null,
      parentId: t.category?.parentId || null,
      level: t.category?.parentId ? 2 : 1,
      cashFlowType: t.category?.cashFlowType || null,
      accountName: t.account?.name || '未知账户',
      toAccountName: t.toAccount?.name || null,
      icon: t.category?.icon ?? null,
      color: t.category?.color ?? null,
    })
  }

  const predictedItems: ProcessedTx[] = []
  for (const p of predictions) {
    // predictions 来自 getPredictionsIfFuture，覆盖范围是 [now, endDate]，
    // 并不是 [startDate, endDate]。这里必须按 [start, end] 过滤，
    // 否则跨月查询会把前面月份的预测再次累加，
    // 导致 cashInflow/Outflow/netCashFlow 表现为"累加值"而非"期内值"。
    const ts = p.date.getTime()
    if (ts < rangeStart || ts > rangeEnd) continue

    const isFromCash = cashAccountIds.includes(p.accountId)
    const isToCash = !!p.toAccountId && cashAccountIds.includes(p.toAccountId)
    if (!isFromCash && !isToCash) continue

    const category = p.categoryId ? categoryMap.get(p.categoryId) : null
    const account = accountMap.get(p.accountId)
    const toAccount = p.toAccountId ? accountMap.get(p.toAccountId) : null

    predictedItems.push({
      isPredicted: true,
      type: p.type,
      amount: toDecimal(p.amount),
      fee: ZERO,
      coupon: ZERO,
      isFromCash,
      isToCash,
      categoryName: category?.name || '未分类',
      categoryId: p.categoryId || null,
      parentId: category?.parentId || null,
      level: category?.level || 1,
      cashFlowType: category?.cashFlowType || null,
      accountName: account?.name || '未知账户',
      toAccountName: toAccount?.name || null,
      icon: category?.icon ?? null,
      color: category?.color ?? null,
    })
  }

  return { actualItems, predictedItems }
}

/**
 * 将 ProcessedTx 列表聚合到 4 类活动桶 + 按账户现金流。
 * 同一函数对 actual 和 predicted 通用：通过传入的 buckets 区分目标。
 */
function aggregate(items: ProcessedTx[]): AggregatedFlows {
  const operating: CashFlowActivityDecimal = { inflow: ZERO, outflow: ZERO, items: [] }
  const investing: CashFlowActivityDecimal = { inflow: ZERO, outflow: ZERO, items: [] }
  const financing: CashFlowActivityDecimal = { inflow: ZERO, outflow: ZERO, items: [] }
  const uncategorized: CashFlowActivityDecimal = { inflow: ZERO, outflow: ZERO, items: [] }
  const flowByAccount: Record<string, { inflow: Decimal; outflow: Decimal }> = {}

  const getTargetByType = (cashFlowType: string | null): CashFlowActivityDecimal =>
    cashFlowType === 'investing' ? investing :
    cashFlowType === 'financing' ? financing :
    cashFlowType === 'operating' ? operating : uncategorized

  const getOrCreateAccountFlow = (name: string) => {
    if (!flowByAccount[name]) flowByAccount[name] = { inflow: ZERO, outflow: ZERO }
    return flowByAccount[name]
  }

  for (const it of items) {
    const target = getTargetByType(it.cashFlowType)

    if (it.type === 'income' && it.isFromCash) {
      addTransaction(
        target, it.categoryName, it.categoryId, it.parentId, it.level,
        it.amount, 'income', 'inflow', it.icon, it.color,
      )
      const accountFlow = getOrCreateAccountFlow(it.accountName)
      accountFlow.inflow = accountFlow.inflow.plus(it.amount)
    } else if (it.type === 'expense' && it.isFromCash) {
      addTransaction(
        target, it.categoryName, it.categoryId, it.parentId, it.level,
        it.amount, 'expense', 'outflow', it.icon, it.color,
      )
      const accountFlow = getOrCreateAccountFlow(it.accountName)
      // 符号约定：outflow 累加为负
      accountFlow.outflow = accountFlow.outflow.minus(it.amount)
    } else if (it.type === 'transfer') {
      if (it.isFromCash && !it.isToCash) {
        // 转出：原行为区分 actual('未分类') / predicted('转账转出') 默认值
        const fromName = it.categoryName || (it.isPredicted ? '转账转出' : '未分类')
        addTransferFlow(
          target, fromName, '', it.categoryId, it.parentId, it.level,
          it.amount, it.fee, it.coupon, true, it.icon, it.color,
        )
        const accountFlow = getOrCreateAccountFlow(it.accountName)
        const actualOutflow = calculateCashFlowAmount('transfer', it.amount, it.fee, it.coupon).abs()
        // 符号约定：outflow 累加为负
        accountFlow.outflow = accountFlow.outflow.minus(actualOutflow)
      } else if (!it.isFromCash && it.isToCash && it.toAccountName) {
        // 转入：原行为区分 actual('未分类') / predicted('转账转入') 默认值
        const toName = it.categoryName || (it.isPredicted ? '转账转入' : '未分类')
        addTransferFlow(
          target, '', toName, it.categoryId, it.parentId, it.level,
          it.amount, it.fee, it.coupon, false, it.icon, it.color,
        )
        const accountFlow = getOrCreateAccountFlow(it.toAccountName)
        const actualInflow = calculateCashTransferInAmount(it.amount, it.fee, it.coupon)
        accountFlow.inflow = accountFlow.inflow.plus(actualInflow)
      }
    } else if (it.type === 'refund' && it.isFromCash) {
      const actualInflow = calculateCashFlowAmount('refund', it.amount, it.fee, ZERO)
      addTransaction(
        target, it.categoryName, it.categoryId, it.parentId, it.level,
        actualInflow, 'refund', 'inflow', it.icon, it.color,
      )
      const accountFlow = getOrCreateAccountFlow(it.accountName)
      accountFlow.inflow = accountFlow.inflow.plus(actualInflow)
    }
  }

  return { operating, investing, financing, uncategorized, flowByAccount }
}

/**
 * 合并 actual + predicted 聚合结果，生成 4 类活动 + 现金流汇总 + 按账户流。
 */
function buildStatement(actual: AggregatedFlows, predicted: AggregatedFlows): {
  byActivity: CashFlowResult['byActivity']
  cashInflow: ReportValue
  cashOutflow: ReportValue
  netCashFlow: ReportValue
  flowByAccount: Record<string, { inflow: ReportValue; outflow: ReportValue }>
} {
  const actualCashInflow = actual.operating.inflow.plus(actual.investing.inflow).plus(actual.financing.inflow).plus(actual.uncategorized.inflow)
  const actualCashOutflow = actual.operating.outflow.plus(actual.investing.outflow).plus(actual.financing.outflow).plus(actual.uncategorized.outflow)
  // outflow 已是负数，net = inflow + outflow 直接相加
  const actualNetCashFlow = actualCashInflow.plus(actualCashOutflow)

  const predictedCashInflow = predicted.operating.inflow.plus(predicted.investing.inflow).plus(predicted.financing.inflow).plus(predicted.uncategorized.inflow)
  const predictedCashOutflow = predicted.operating.outflow.plus(predicted.investing.outflow).plus(predicted.financing.outflow).plus(predicted.uncategorized.outflow)
  const predictedNetCashFlow = predictedCashInflow.plus(predictedCashOutflow)

  // 合并按账户的流入流出（actual + predicted 同账户聚合；只有 predicted 的账户 actual 也补 0）
  const flowByAccount: Record<string, { inflow: ReportValue; outflow: ReportValue }> = {}
  for (const [name, flow] of Object.entries(actual.flowByAccount)) {
    const pred = predicted.flowByAccount[name] || { inflow: ZERO, outflow: ZERO }
    flowByAccount[name] = {
      inflow: { actual: flow.inflow.toNumber(), predicted: pred.inflow.toNumber() },
      outflow: { actual: flow.outflow.toNumber(), predicted: pred.outflow.toNumber() },
    }
  }
  for (const [name, flow] of Object.entries(predicted.flowByAccount)) {
    if (!flowByAccount[name]) {
      flowByAccount[name] = {
        inflow: { actual: 0, predicted: flow.inflow.toNumber() },
        outflow: { actual: 0, predicted: flow.outflow.toNumber() },
      }
    }
  }

  return {
    byActivity: {
      operating: toActivityResult(actual.operating, predicted.operating),
      investing: toActivityResult(actual.investing, predicted.investing),
      financing: toActivityResult(actual.financing, predicted.financing),
      uncategorized: toActivityResult(actual.uncategorized, predicted.uncategorized),
    },
    cashInflow: { actual: actualCashInflow.toNumber(), predicted: predictedCashInflow.toNumber() },
    cashOutflow: { actual: actualCashOutflow.toNumber(), predicted: predictedCashOutflow.toNumber() },
    netCashFlow: { actual: actualNetCashFlow.toNumber(), predicted: predictedNetCashFlow.toNumber() },
    flowByAccount,
  }
}

export async function generateCashFlow(startDate: string, endDate: string, includePredictions?: boolean): Promise<CashFlowResult> {
  const startTime = Date.now()
  const { startDate: start, endDate: end, nextDay: nextDayOfEnd } = resolveReportPeriod(startDate, endDate)

  // 1. 准备：现金等价账户
  const cashCategories = await prisma.accountCategory.findMany({
    where: { isCashEquivalent: true },
    select: { id: true },
  })
  const cashCategoryIds = cashCategories.map(c => c.id)

  const cashAccounts = await prisma.account.findMany({
    where: { categoryId: { in: cashCategoryIds } },
    select: { id: true, name: true },
  })
  const cashAccountIds = cashAccounts.map(a => a.id)

  // 2. 拉取 actual 交易（已限定到现金账户 + 日期范围）
  // isAdjustment 已删除：type='adjustment' 已能区分非业务调整
  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: start, lte: end },
      OR: [
        { accountId: { in: cashAccountIds } },
        { toAccountId: { in: cashAccountIds } },
      ],
    },
    include: { account: true, toAccount: true, category: true },
  })

  // 3. 拉取 predicted 交易（含分类 / 账户字典以便名称解析）
  let predictionNote: string | undefined
  let predictions: PredictionTransaction[] = []
  let categoryMap: Map<string, CategoryInfo> = new Map()
  let accountMap: Map<string, AccountInfo> = new Map()

  if (includePredictions) {
    const allPredictions = await getPredictionsIfFuture(startDate, endDate, true)
    predictions = allPredictions.map(p => ({
      date: p.date,
      type: p.type,
      amount: p.amount,
      note: p.note,
      accountId: p.accountId,
      toAccountId: p.toAccountId,
      categoryId: p.categoryId,
      budgetId: p.budgetId,
      budgetName: p.budgetName,
    }))

    if (predictions.length > 0) {
      const allCategories = await prisma.transactionCategory.findMany({ include: { parent: true } })
      categoryMap = new Map(allCategories.map(c => [c.id, {
        cashFlowType: c.cashFlowType,
        name: c.name,
        icon: c.icon,
        color: c.color,
        parentId: c.parentId,
        level: c.parentId ? 2 : 1,
      }]))
      const allAccounts = await prisma.account.findMany()
      accountMap = new Map(allAccounts.map(a => [a.id, { name: a.name }]))
      predictionNote = PREDICTION_NOTE_DEFAULT
    }
  }

  // 4. 收集 + 聚合 actual / predicted
  const { actualItems, predictedItems } = collectTransactions({
    transactions, predictions, start, end, cashAccountIds, categoryMap, accountMap,
  })
  const actual = aggregate(actualItems)
  const predicted = aggregate(predictedItems)

  // 5. 生成报表主体
  const statement = buildStatement(actual, predicted)

  // 6. 期初 / 期末现金余额
  const balanceCache = await calculateBalancesBatch(cashAccountIds, [start, nextDayOfEnd])
  const actualStartCash = cashAccountIds.reduce((sum, id) => sum + balanceCache.get(id, start), 0)
  const actualEndCash = cashAccountIds.reduce((sum, id) => sum + balanceCache.get(id, nextDayOfEnd), 0)
  const actualCashChange = actualEndCash - actualStartCash

  // 期初/期末现金预测：统一调用 computePredictedAccountTotal，
  // 不再依赖隐式排序、也不重复 income/expense/transfer 分支。
  // timePoint 减 1ms：filterPredictionsUpTo 用 <=，而 calculateBalancesBatch 用 <，
  // 减 1ms 使两者语义对齐，避免期初/期末当天的预测被重复计算或遗漏。
  const cashAccountIdSet = new Set(cashAccountIds)
  const predictedStartCash = computePredictedAccountTotal(predictions, new Date(start.getTime() - 1), cashAccountIdSet)
  const predictedEndCash = computePredictedAccountTotal(predictions, new Date(nextDayOfEnd.getTime() - 1), cashAccountIdSet)

  // 7. 桑基图
  const sankey = buildSankey({
    transactions, predictions, cashAccountIds, categoryMap, accountMap, start, end,
  })

  const result: CashFlowResult = {
    startDate,
    endDate,
    cashInflow: statement.cashInflow,
    cashOutflow: statement.cashOutflow,
    netCashFlow: statement.netCashFlow,
    flowByAccount: statement.flowByAccount,
    cashAccounts: cashAccounts.map(a => a.name),
    startCash: { actual: actualStartCash, predicted: predictedStartCash },
    endCash: { actual: actualEndCash, predicted: predictedEndCash },
    cashChange: { actual: actualCashChange, predicted: predictedEndCash - predictedStartCash },
    byActivity: statement.byActivity,
    sankey,
    predictionNote,
  }
  logger.info({ action: 'generate', report: 'cash-flow', period: `${startDate}~${endDate}`, durationMs: Date.now() - startTime }, 'report generated')
  return result
}

function buildSankey(args: {
  transactions: TransactionWithIncludes[]
  predictions: PredictionTransaction[]
  cashAccountIds: string[]
  categoryMap: Map<string, CategoryInfo>
  accountMap: Map<string, AccountInfo>
  start: Date
  end: Date
}): {
  nodes: Array<{ name: string; category: string }>
  links: Array<{ source: string; target: string; value: number; actualValue?: number; predictedValue?: number }>
} {
  const { transactions, predictions, cashAccountIds, categoryMap, accountMap, start, end } = args

  const incomeCategoryNodesActual: Map<string, Decimal> = new Map()
  const incomeCategoryNodesPredicted: Map<string, Decimal> = new Map()
  const nonCashSourceNodesActual: Map<string, Decimal> = new Map()
  const nonCashSourceNodesPredicted: Map<string, Decimal> = new Map()
  const expenseCategoryNodesActual: Map<string, Decimal> = new Map()
  const expenseCategoryNodesPredicted: Map<string, Decimal> = new Map()
  const nonCashTargetNodesActual: Map<string, Decimal> = new Map()
  const nonCashTargetNodesPredicted: Map<string, Decimal> = new Map()
  const cashAccountFlowsActual: Map<string, Decimal> = new Map()
  const cashAccountFlowsPredicted: Map<string, Decimal> = new Map()

  const sourceToCashLinksActual: Map<string, Map<string, Decimal>> = new Map()
  const sourceToCashLinksPredicted: Map<string, Map<string, Decimal>> = new Map()
  const cashToTargetLinksActual: Map<string, Map<string, Decimal>> = new Map()
  const cashToTargetLinksPredicted: Map<string, Map<string, Decimal>> = new Map()

  const processTransaction = (
    type: string,
    isFromCash: boolean,
    isToCash: boolean,
    amount: Decimal,
    fee: Decimal,
    coupon: Decimal,
    categoryName: string | undefined,
    accountName: string | undefined,
    toAccountName: string | undefined,
    isActual: boolean
  ) => {
    const incomeCategoryNodes = isActual ? incomeCategoryNodesActual : incomeCategoryNodesPredicted
    const nonCashSourceNodes = isActual ? nonCashSourceNodesActual : nonCashSourceNodesPredicted
    const expenseCategoryNodes = isActual ? expenseCategoryNodesActual : expenseCategoryNodesPredicted
    const nonCashTargetNodes = isActual ? nonCashTargetNodesActual : nonCashTargetNodesPredicted
    const cashAccountFlows = isActual ? cashAccountFlowsActual : cashAccountFlowsPredicted
    const sourceToCashLinks = isActual ? sourceToCashLinksActual : sourceToCashLinksPredicted
    const cashToTargetLinks = isActual ? cashToTargetLinksActual : cashToTargetLinksPredicted

    if (type === 'income' && isFromCash) {
      const catName = categoryName || '其他收入'
      const cashName = accountName || '现金账户'
      addToMap(incomeCategoryNodes, catName, amount)
      addToMap(cashAccountFlows, cashName, amount)
      if (!sourceToCashLinks.has(catName)) sourceToCashLinks.set(catName, new Map())
      addToMap(sourceToCashLinks.get(catName)!, cashName, amount)
    } else if (type === 'expense' && isFromCash) {
      const catName = categoryName || '其他支出'
      const cashName = accountName || '现金账户'
      addToMap(expenseCategoryNodes, catName, amount)
      addToMap(cashAccountFlows, cashName, amount)
      if (!cashToTargetLinks.has(cashName)) cashToTargetLinks.set(cashName, new Map())
      addToMap(cashToTargetLinks.get(cashName)!, catName, amount)
    } else if (type === 'transfer') {
      if (!isFromCash && isToCash && toAccountName) {
        // 非现金转入现金：节点名改为"分类-账户"形式
        const catName = categoryName || '转账转入'
        const accName = accountName || '非现金账户'
        const fromName = `${catName}-${accName}`
        const toCashName = toAccountName
        const actualInflow = calculateCashTransferInAmount(amount, fee, coupon)
        addToMap(nonCashSourceNodes, fromName, actualInflow)
        addToMap(cashAccountFlows, toCashName, actualInflow)
        if (!sourceToCashLinks.has(fromName)) sourceToCashLinks.set(fromName, new Map())
        addToMap(sourceToCashLinks.get(fromName)!, toCashName, actualInflow)
      } else if (isFromCash && !isToCash && accountName) {
        // 现金转出非现金：节点名改为"分类-账户"形式
        const catName = categoryName || '转账转出'
        const accName = toAccountName || '非现金账户'
        const fromCashName = accountName
        const toName = `${catName}-${accName}`
        const actualOutflow = calculateCashFlowAmount('transfer', amount, fee, coupon).abs()
        addToMap(nonCashTargetNodes, toName, actualOutflow)
        addToMap(cashAccountFlows, fromCashName, actualOutflow)
        if (!cashToTargetLinks.has(fromCashName)) cashToTargetLinks.set(fromCashName, new Map())
        addToMap(cashToTargetLinks.get(fromCashName)!, toName, actualOutflow)
      }
    } else if (type === 'refund' && isFromCash) {
      const catName = categoryName || '退款'
      const cashName = accountName || '现金账户'
      const actualInflow = calculateCashFlowAmount('refund', amount, fee, ZERO)
      addToMap(incomeCategoryNodes, catName, actualInflow)
      addToMap(cashAccountFlows, cashName, actualInflow)
      if (!sourceToCashLinks.has(catName)) sourceToCashLinks.set(catName, new Map())
      addToMap(sourceToCashLinks.get(catName)!, cashName, actualInflow)
    }
  }

  transactions.forEach(t => {
    const isFromCash = cashAccountIds.includes(t.accountId)
    const isToCash = !!t.toAccountId && cashAccountIds.includes(t.toAccountId)
    processTransaction(
      t.type,
      isFromCash,
      isToCash,
      t.amount,
      toDecimal(t.fee),
      toDecimal(t.coupon),
      t.category?.name || '未分类',
      t.account?.name,
      t.toAccount?.name,
      true
    )
  })

  predictions.forEach(p => {
    // 同样按 [start, end] 过滤，避免跨月时累计
    const t = p.date.getTime()
    if (t < start.getTime() || t > end.getTime()) return
    const isFromCash = cashAccountIds.includes(p.accountId)
    const isToCash = !!p.toAccountId && cashAccountIds.includes(p.toAccountId)
    if (!isFromCash && !isToCash) return
    const category = p.categoryId ? categoryMap.get(p.categoryId) : null
    const account = accountMap.get(p.accountId)
    const toAccount = p.toAccountId ? accountMap.get(p.toAccountId) : null
    processTransaction(
      p.type,
      isFromCash,
      isToCash,
      toDecimal(p.amount),
      ZERO,
      ZERO,
      category?.name,
      account?.name,
      toAccount?.name,
      false
    )
  })

  const mergeNodes = (actual: Map<string, Decimal>, predicted: Map<string, Decimal>): Set<string> => {
    const result = new Set<string>()
    actual.forEach((_, key) => result.add(key))
    predicted.forEach((_, key) => result.add(key))
    return result
  }

  const allIncomeCategoryNodes = mergeNodes(incomeCategoryNodesActual, incomeCategoryNodesPredicted)
  const allNonCashSourceNodes = mergeNodes(nonCashSourceNodesActual, nonCashSourceNodesPredicted)
  const allExpenseCategoryNodes = mergeNodes(expenseCategoryNodesActual, expenseCategoryNodesPredicted)
  const allNonCashTargetNodes = mergeNodes(nonCashTargetNodesActual, nonCashTargetNodesPredicted)
  const allCashAccountFlows = mergeNodes(cashAccountFlowsActual, cashAccountFlowsPredicted)

  const sankeyNodes: Array<{ name: string; category: string }> = []
  const nodeNameMap: Map<string, string> = new Map()

  const sortedNodeNames = (nodeSet: Set<string>, actualMap: Map<string, Decimal>, predictedMap: Map<string, Decimal>) => {
    return Array.from(nodeSet).sort((a, b) => {
      const aVal = (actualMap.get(a) || ZERO).plus(predictedMap.get(a) || ZERO)
      const bVal = (actualMap.get(b) || ZERO).plus(predictedMap.get(b) || ZERO)
      return bVal.minus(aVal).toNumber()
    })
  }

  for (const name of sortedNodeNames(allNonCashSourceNodes, nonCashSourceNodesActual, nonCashSourceNodesPredicted)) {
    const uniqueName = `${name}_ncs`
    nodeNameMap.set(`ncs_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'non_cash_source' })
  }
  for (const name of sortedNodeNames(allIncomeCategoryNodes, incomeCategoryNodesActual, incomeCategoryNodesPredicted)) {
    const uniqueName = `${name}_income`
    nodeNameMap.set(`income_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'income_category' })
  }
  for (const name of sortedNodeNames(allCashAccountFlows, cashAccountFlowsActual, cashAccountFlowsPredicted)) {
    const uniqueName = `${name}_cash`
    nodeNameMap.set(`cash_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'cash' })
  }
  for (const name of sortedNodeNames(allNonCashTargetNodes, nonCashTargetNodesActual, nonCashTargetNodesPredicted)) {
    const uniqueName = `${name}_nct`
    nodeNameMap.set(`nct_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'non_cash_target' })
  }
  for (const name of sortedNodeNames(allExpenseCategoryNodes, expenseCategoryNodesActual, expenseCategoryNodesPredicted)) {
    const uniqueName = `${name}_expense`
    nodeNameMap.set(`expense_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'expense_category' })
  }

  const sankeyLinks: Array<{ source: string; target: string; value: number; actualValue?: number; predictedValue?: number }> = []

  const mergeLinks = (
    actualLinks: Map<string, Map<string, Decimal>>,
    predictedLinks: Map<string, Map<string, Decimal>>,
    isSourceToCash: boolean
  ) => {
    const allSources = new Set<string>()
    actualLinks.forEach((_, source) => allSources.add(source))
    predictedLinks.forEach((_, source) => allSources.add(source))

    for (const sourceName of allSources) {
      const actualTargets = actualLinks.get(sourceName) || new Map()
      const predictedTargets = predictedLinks.get(sourceName) || new Map()
      const allTargets = new Set<string>()
      actualTargets.forEach((_, target) => allTargets.add(target))
      predictedTargets.forEach((_, target) => allTargets.add(target))

      for (const targetName of allTargets) {
        const actualAmount = actualTargets.get(targetName) || ZERO
        const predictedAmount = predictedTargets.get(targetName) || ZERO
        const totalAmount = actualAmount.plus(predictedAmount)

        if (totalAmount.greaterThan(ZERO)) {
          const sourceKey = isSourceToCash
            ? (incomeCategoryNodesActual.has(sourceName) || incomeCategoryNodesPredicted.has(sourceName) ? `income_${sourceName}` : `ncs_${sourceName}`)
            : `cash_${sourceName}`
          const targetKey = isSourceToCash
            ? `cash_${targetName}`
            : (expenseCategoryNodesActual.has(targetName) || expenseCategoryNodesPredicted.has(targetName) ? `expense_${targetName}` : `nct_${targetName}`)

          sankeyLinks.push({
            source: nodeNameMap.get(sourceKey) || sourceName,
            target: nodeNameMap.get(targetKey) || targetName,
            value: totalAmount.toNumber(),
            actualValue: actualAmount.greaterThan(ZERO) ? actualAmount.toNumber() : undefined,
            predictedValue: predictedAmount.greaterThan(ZERO) ? predictedAmount.toNumber() : undefined,
          })
        }
      }
    }
  }

  mergeLinks(sourceToCashLinksActual, sourceToCashLinksPredicted, true)
  mergeLinks(cashToTargetLinksActual, cashToTargetLinksPredicted, false)

  return { nodes: sankeyNodes, links: sankeyLinks }
}
