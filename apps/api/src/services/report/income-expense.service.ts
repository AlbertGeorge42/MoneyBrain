import { prisma } from '../../prisma.js'
import { calculateBalancesBatch } from '../balance.service.js'
import { rootLogger } from '../../common/index.js'
import { toLedgerTransaction } from '../ledger.adapter.js'
import {
  flowByCategory,
  fromDate,
  minor,
  postingsOf,
  summarizeFlows,
  UNCATEGORIZED_CATEGORY_ID,
  ZERO_MINOR,
  type Minor,
} from '../../../../../packages/domain/src/index.js'
import {
  getPredictionsIfFuture,
  computePredictedAssetsLiabilities,
  sumAssetsLiabilities,
  resolveReportPeriod,
  PREDICTION_NOTE_DEFAULT,
} from './report.utils.js'
import type {
  IncomeExpenseReportData,
  ReportCategoryDetail,
} from '../../../../../packages/contracts/types/index.js'

const logger = rootLogger.child({ module: 'report' })


export async function generateIncomeExpense(startDate: string, endDate: string, includePredictions?: boolean, includeExcluded = false): Promise<IncomeExpenseReportData> {
  const startTime = Date.now()
  const { startDate: start, endDate: end, nextDay: endDayNext } = resolveReportPeriod(startDate, endDate)
  const startDay = new Date(start)

  // isAdjustment 已删除：type='adjustment' 已能区分非业务调整，Prisma schema 仅保留 type
  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: start, lte: end },
      type: { in: ['income', 'expense', 'refund'] },
      amount: { not: 0 },
      // includeExcluded 为 true 时不过滤「不计收支」交易，否则排除 excludeFromIncomeExpense=true 的交易
      ...(includeExcluded ? {} : { excludeFromIncomeExpense: false }),
    },
    include: { category: true, account: true },
  })

  // 对账条需要「改变余额但不进收支统计」的交易：转账手续费、平账、不计收支
  const balanceOnlyTransactions = await prisma.transaction.findMany({
    where: {
      date: { gte: start, lte: end },
      OR: [
        { type: { in: ['transfer', 'adjustment'] } },
        { excludeFromIncomeExpense: true },
      ],
    },
    select: {
      id: true,
      type: true,
      ruleVersion: true,
      amount: true,
      fee: true,
      coupon: true,
      accountId: true,
      toAccountId: true,
      date: true,
      excludeFromIncomeExpense: true,
      relatedType: true,
      categoryId: true,
      relatedTransactionId: true,
    },
  })

  // 收支口径只有领域层这一处：退款按原交易类型冲减对应侧，报表与首页、交易统计一致。
  const ledger = transactions.map(toLedgerTransaction)
  const summary = summarizeFlows(ledger, undefined, { includeExcluded })
  const netIncome = summary.netIncome
  const netExpense = summary.netExpense

  let pIncome: Minor = ZERO_MINOR
  let pExpense: Minor = ZERO_MINOR
  let predictionNote: string | undefined

  const predictedById: Record<string, Minor> = {}

  // 合并获取预测数据（一次查询替代原来的两次）
  const predictions = await getPredictionsIfFuture(startDate, endDate, !!includePredictions)

  if (predictions.length > 0) {
    // 注意：predictions 来自 getPredictionsIfFuture，覆盖范围是 [now, endDate]，
    // 并不是 [startDate, endDate]。这里必须按 [startDay, endDayNext) 过滤，
    // 否则跨月查询（如 7月→8月）会把前面月份的预测再次累加，
    // 导致 income/expense/balance 表现为"累加值"而非"期内值"。
    const rangeStart = start.getTime()
    const rangeEnd = endDayNext.getTime()
    predictions.forEach(p => {
      const t = p.date.getTime()
      if (t < rangeStart || t >= rangeEnd) return
      // 转账不是收入或支出，不应该计入收入支出报表
      if (p.type === 'transfer') return
      if (p.type === 'income') {
        pIncome = minor(pIncome + p.amount)
      } else if (p.type === 'expense') {
        pExpense = minor(pExpense + p.amount)
      }
      if (p.categoryId) {
        predictedById[p.categoryId] = minor((predictedById[p.categoryId] ?? 0) + p.amount)
      }
    })
    predictionNote = PREDICTION_NOTE_DEFAULT
  }

  const actualBalance = minor(netIncome - netExpense)
  const predictedBalance = minor(pIncome - pExpense)

  const incomeByCategory: Record<string, Minor> = {}
  const expenseByCategory: Record<string, Minor> = {}

  const allCategories = await prisma.transactionCategory.findMany({
    orderBy: { sort: 'asc' },
  })

  const categoryMap = new Map(allCategories.map(c => [c.id, c]))
  const childrenOf = new Map<string | null, typeof allCategories>()
  for (const cat of allCategories) {
    const key = cat.parentId ?? null
    if (!childrenOf.has(key)) childrenOf.set(key, [])
    childrenOf.get(key)!.push(cat)
  }

  // 分类净额：同样由领域层口径产出（退款从同分类中扣减）
  const netIncomeByCategory = flowByCategory(ledger, 'income', undefined, { includeExcluded })
  const netExpenseByCategory = flowByCategory(ledger, 'expense', undefined, { includeExcluded })

  const leafPredictedIncome: Record<string, Minor> = {}
  const leafPredictedExpense: Record<string, Minor> = {}

  for (const [catId, pAmount] of Object.entries(predictedById)) {
    const cat = categoryMap.get(catId)
    if (!cat) continue
    // 转账分类不应该出现在收入支出报表中
    if (cat.type === 'transfer') continue
    const target = cat.type === 'income' ? leafPredictedIncome : leafPredictedExpense
    target[catId] = minor((target[catId] ?? 0) + pAmount)
  }

  function buildTree(type: 'income' | 'expense', parentId: string | null): ReportCategoryDetail[] {
    const kids = childrenOf.get(parentId) ?? []
    const result: ReportCategoryDetail[] = []

    for (const cat of kids) {
      // 过滤：只处理匹配类型的分类
      if (cat.type !== type) continue

      const childLeaves = buildTree(type, cat.id)
      // hasChildren 基于真实分类层级：分类表里只要有子分类就视为可下钻
      const hasChildren = (childrenOf.get(cat.id) ?? []).length > 0

      // 自身实际 = 该分类的净额（退款已扣减）；预测侧无退款
      const ownActual = (type === 'income' ? netIncomeByCategory : netExpenseByCategory).get(cat.id) ?? ZERO_MINOR
      const catActual = ownActual
      const catPredicted = (type === 'income' ? leafPredictedIncome : leafPredictedExpense)[cat.id] ?? ZERO_MINOR
      const hasOwnData = catActual !== 0 || catPredicted !== 0

      // 无自身数据且子树无产出 → 完全空节点，跳过
      if (!hasOwnData && childLeaves.length === 0) continue

      const childrenActual = childLeaves.reduce((s, c) => s + c.actual, 0)
      const childrenPredicted = childLeaves.reduce((s, c) => s + c.predicted, 0)

      result.push({
        name: cat.name,
        actual: minor(catActual + childrenActual),
        predicted: minor(catPredicted + childrenPredicted),
        categoryId: cat.id,
        hasChildren,
        sort: cat.sort,
        icon: cat.icon,
        color: cat.color,
        children: childLeaves.length > 0 ? childLeaves : undefined,
      })
    }

    return result.sort((a, b) => a.sort - b.sort)
  }

  function buildUncategorized(type: 'income' | 'expense'): ReportCategoryDetail | null {
    const actual = (type === 'income' ? netIncomeByCategory : netExpenseByCategory).get(
      UNCATEGORIZED_CATEGORY_ID,
    ) ?? ZERO_MINOR
    if (actual === 0) return null

    return {
      name: '未分类',
      actual,
      predicted: ZERO_MINOR,
      categoryId: 'uncategorized',
      hasChildren: false,
      sort: Number.MAX_SAFE_INTEGER,
      icon: null,
      color: null,
    }
  }

  const incomeCategoryDetails: ReportCategoryDetail[] = buildTree('income', null)
  const expenseCategoryDetails: ReportCategoryDetail[] = buildTree('expense', null)
  // 汇总里包含未分类金额，明细树也必须显示，否则用户看到的合计与展开项对不上。
  const uncategorizedIncome = buildUncategorized('income')
  const uncategorizedExpense = buildUncategorized('expense')
  if (uncategorizedIncome) incomeCategoryDetails.push(uncategorizedIncome)
  if (uncategorizedExpense) expenseCategoryDetails.push(uncategorizedExpense)

  // 分类汇总：直接用领域层算出的净额（退款已从同分类扣减）
  for (const [catId, amount] of netIncomeByCategory) {
    const cat = categoryMap.get(catId)
    const key = cat?.name ?? '未分类'
    incomeByCategory[key] = minor((incomeByCategory[key] ?? 0) + amount)
  }
  for (const [catId, amount] of netExpenseByCategory) {
    const cat = categoryMap.get(catId)
    const key = cat?.name ?? '未分类'
    expenseByCategory[key] = minor((expenseByCategory[key] ?? 0) + amount)
  }

  const accounts = await prisma.account.findMany()

  // 期初/期末余额查询（传入 accounts 复用，避免 calculateBalancesBatch 内部重复查询）
  const allAccountIds = accounts.map(a => a.id)
  const balanceCache = await calculateBalancesBatch(allAccountIds, [startDay, endDayNext], accounts)

  // 期初期末资产/负债/净资产
  const accountGetValue = (account: { id: string; type: string }, date: Date) =>
    minor(balanceCache.get(account.id, date))

  const startResult = sumAssetsLiabilities(
    accounts.map(a => ({ id: a.id, type: a.type })),
    (a) => accountGetValue(a, startDay)
  )
  const endResult = sumAssetsLiabilities(
    accounts.map(a => ({ id: a.id, type: a.type })),
    (a) => accountGetValue(a, endDayNext)
  )

  const actualStartAssets = startResult.assets
  const actualStartLiabilitiesBalance = startResult.liabilities
  const actualStartLiabilities = minor(Math.abs(actualStartLiabilitiesBalance))
  const actualStartNetWorth = startResult.netWorth

  const actualEndAssets = endResult.assets
  const actualEndLiabilitiesBalance = endResult.liabilities
  const actualEndLiabilities = minor(Math.abs(actualEndLiabilitiesBalance))
  const actualEndNetWorth = endResult.netWorth

  // 预测资产/负债变动（统一调用 computePredictedAssetsLiabilities，
  // 历史/当前/未来场景共用同一份逻辑）
  // timePoint 减 1ms：filterPredictionsUpTo 用 <=，而 calculateBalancesBatch 用 <，
  // 减 1ms 使两者语义对齐，避免期初/期末当天的预测被重复计算或遗漏。
  const accountLookup = new Map(accounts.map(a => [a.id, a]))
  const startPredicted = computePredictedAssetsLiabilities(predictions, new Date(start.getTime() - 1), accountLookup)
  const endPredicted = computePredictedAssetsLiabilities(predictions, new Date(endDayNext.getTime() - 1), accountLookup)

  const predictedStartAssets = startPredicted.assets
  const predictedStartLiabilities = startPredicted.liabilities
  const predictedStartNetWorth = startPredicted.netWorth
  const predictedEndAssets = endPredicted.assets
  const predictedEndLiabilities = endPredicted.liabilities
  const predictedEndNetWorth = endPredicted.netWorth

  const predictedNetWorthChange = minor(predictedEndNetWorth - predictedStartNetWorth)
  const actualAssetChange = minor(actualEndNetWorth - actualStartNetWorth)

  const incomeByCategoryResult: Record<string, Minor> = { ...incomeByCategory }
  const expenseByCategoryResult: Record<string, Minor> = { ...expenseByCategory }

  logger.info({ action: 'generate', report: 'income-expense', period: `${startDate}~${endDate}`, durationMs: Date.now() - startTime }, 'report generated')

  // 对账条：期初净资产 + 净收入 − 净支出 + 不进收支但影响余额的部分 = 期末净资产。
  // 「不进收支但影响余额」包含：不计收支的交易、转账手续费、平账，
  // 以及早于账户开户日的交易（它们进收支统计但不进余额）。
  const openingDateOf = new Map(
    accounts.map((a) => [a.id, a.initialBalanceDate ? fromDate(a.initialBalanceDate) : null]),
  )
  const netWorthEffect = (tx: (typeof balanceOnlyTransactions)[number]): Minor => {
    const ledgerTx = toLedgerTransaction({
      id: tx.id,
      type: tx.type,
      ruleVersion: tx.ruleVersion,
      amount: tx.amount,
      fee: tx.fee,
      coupon: tx.coupon,
      date: tx.date,
      accountId: tx.accountId,
      toAccountId: tx.toAccountId,
      categoryId: tx.categoryId,
      relatedTransactionId: tx.relatedTransactionId,
      relatedType: tx.relatedType,
      excludeFromIncomeExpense: tx.excludeFromIncomeExpense,
    })
    return minor(
      postingsOf(ledgerTx)
        .filter((posting) => posting.kind === 'account')
        .reduce((total, posting) => total + posting.amount, 0),
    )
  }

  const excludedNet = balanceOnlyTransactions
    .filter((tx) => tx.excludeFromIncomeExpense)
    .reduce((total, tx) => total + netWorthEffect(tx), 0)
  const transferFee = balanceOnlyTransactions
    .filter((tx) => tx.type === 'transfer')
    .reduce((total, tx) => total + Math.max(Number(tx.fee) - Number(tx.coupon), 0), 0)
  const adjustmentNet = balanceOnlyTransactions
    .filter((tx) => tx.type === 'adjustment')
    .reduce((total, tx) => total + netWorthEffect(tx), 0)

  // 早于开户日的交易：进收支统计，但不进余额
  const preOpeningFlow = [...transactions, ...balanceOnlyTransactions]
    .filter((tx) => {
      const opening = openingDateOf.get(tx.accountId)
      return opening !== null && opening !== undefined && fromDate(tx.date) < opening
    })
    .filter((tx) => (includeExcluded ? true : !tx.excludeFromIncomeExpense))
    .reduce((total, tx) => {
      const amount = minor(Number(tx.amount))
      if (tx.type === 'income') return total + amount
      if (tx.type === 'expense') return total - amount
      if (tx.type === 'refund' && tx.relatedType === 'income') return total - amount
      if (tx.type === 'refund' && tx.relatedType === 'expense') return total + amount
      return total
    }, 0)

  const other = minor(
    (includeExcluded ? 0 : excludedNet) + transferFee + adjustmentNet - preOpeningFlow,
  )

  const reconciliation = {
    startNetWorth: actualStartNetWorth,
    netIncome,
    netExpense,
    other,
    endNetWorth: actualEndNetWorth,
    difference: minor(
      actualEndNetWorth - (actualStartNetWorth + netIncome - netExpense + other),
    ),
  }

  return {
    startDate,
    endDate,
    income: { actual: netIncome, predicted: pIncome },
    expense: { actual: netExpense, predicted: pExpense },
    balance: { actual: actualBalance, predicted: predictedBalance },
    reconciliation,
    incomeByCategory: incomeByCategoryResult,
    expenseByCategory: expenseByCategoryResult,
    incomeCategoryDetails,
    expenseCategoryDetails,
    startAssets: { actual: actualStartAssets, predicted: predictedStartAssets },
    startLiabilities: { actual: actualStartLiabilities, predicted: predictedStartLiabilities },
    startNetWorth: { actual: actualStartNetWorth, predicted: predictedStartNetWorth },
    endAssets: { actual: actualEndAssets, predicted: predictedEndAssets },
    endLiabilities: { actual: actualEndLiabilities, predicted: predictedEndLiabilities },
    endNetWorth: { actual: actualEndNetWorth, predicted: predictedEndNetWorth },
    assetChange: { actual: actualAssetChange, predicted: predictedNetWorthChange },
    predictionNote,
  }
}
