import { prisma } from '../../prisma.js'
import { calculateBalancesBatch } from '../balance.service.js'
import { rootLogger } from '../../common/index.js'
import {
  getPredictionsIfFuture,
  computePredictedAccountTotal,
  resolveReportPeriod,
  PREDICTION_NOTE_DEFAULT,
} from './report.utils.js'
import {
  AccountInfo,
  CategoryInfo,
  CashFlowResult,
  PredictionTransaction,
} from './cash-flow-types.js'
import { collectTransactions } from './cash-flow-collect.js'
import { aggregate } from './cash-flow-aggregate.js'
import { buildStatement, buildSankey } from './cash-flow-build.js'

const logger = rootLogger.child({ module: 'report' })

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
