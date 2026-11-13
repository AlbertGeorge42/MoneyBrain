import { UNCATEGORIZED_CATEGORY_ID, flowByCategory, summarizeFlows } from '../ledger/summary.js'
import { postingsOf } from '../ledger/postings.js'
import type { LedgerTransaction } from '../ledger/types.js'
import { ZERO_MINOR, add, sub, sum, type Minor } from '../money.js'
import { buildCategoryTree, type CategoryRef, type FlowCategoryType } from './category-tree.js'

/** 预算预测点位：date 为 `Date.getTime()`，amount 已由 API 在边界转成整数分。 */
export interface IncomeExpensePrediction {
  date: number
  type: string
  amount: Minor
  categoryId: string | null
}

export interface IncomeExpenseStatementInput {
  /** 进收支统计的交易（income / expense / refund），已由 API 转成领域分录。 */
  ledger: readonly LedgerTransaction[]
  /** 改变余额但不进收支统计的交易（转账、平账、不计收支），已转成领域分录。 */
  balanceOnlyLedger: readonly LedgerTransaction[]
  categories: readonly CategoryRef[]
  /** 分类 id → 展示名；未命中的 key 用 `uncategorizedLabel`。 */
  categoryNames: ReadonlyMap<string, string>
  uncategorizedLabel: string
  predictions: readonly IncomeExpensePrediction[]
  /** 预测过滤窗口 `[rangeStart, rangeEndExclusive)`，与余额口径的半开区间一致。 */
  rangeStart: number
  rangeEndExclusive: number
  startNetWorth: Minor
  endNetWorth: Minor
  includeExcluded: boolean
}

export interface IncomeExpenseCategoryDetail {
  name: string
  actual: Minor
  predicted: Minor
  categoryId: string
  hasChildren: boolean
  sort: number
  children?: IncomeExpenseCategoryDetail[]
}

export interface IncomeExpenseReconciliation {
  startNetWorth: Minor
  netIncome: Minor
  netExpense: Minor
  other: Minor
  endNetWorth: Minor
  difference: Minor
}

export interface IncomeExpenseStatement {
  income: { actual: Minor; predicted: Minor }
  expense: { actual: Minor; predicted: Minor }
  balance: { actual: Minor; predicted: Minor }
  reconciliation: IncomeExpenseReconciliation
  incomeByCategory: Record<string, Minor>
  expenseByCategory: Record<string, Minor>
  incomeCategoryDetails: IncomeExpenseCategoryDetail[]
  expenseCategoryDetails: IncomeExpenseCategoryDetail[]
  /** 只要拿到过预测点位就为 true（即使全部被期间过滤掉），供 API 决定是否挂提示文案。 */
  hasPredictions: boolean
}

/** 一条分录交易对账户余额的净效应（权益 / 分类分录不计入净资产）。 */
function netWorthEffect(transaction: LedgerTransaction): Minor {
  return sum(
    postingsOf(transaction)
      .filter((posting) => posting.kind === 'account')
      .map((posting) => posting.amount),
  )
}

/** 构造收支表：收支汇总、预测、分类明细树、按名称汇总与净资产对账条。 */
export function buildIncomeExpenseStatement(
  input: IncomeExpenseStatementInput,
): IncomeExpenseStatement {
  const { ledger, balanceOnlyLedger, categories, includeExcluded } = input
  const options = { includeExcluded }

  const summary = summarizeFlows(ledger, undefined, options)
  const netIncome = summary.netIncome
  const netExpense = summary.netExpense

  // 预测点位覆盖范围是 [now, endDate]，必须按报表期间半开窗口再过滤一次，
  // 否则跨月查询会把窗口外的预测累加进来。
  let pIncome: Minor = ZERO_MINOR
  let pExpense: Minor = ZERO_MINOR
  const predictedById: Record<string, Minor> = {}
  for (const prediction of input.predictions) {
    const time = prediction.date
    if (time < input.rangeStart || time >= input.rangeEndExclusive) continue
    if (prediction.type === 'transfer') continue
    if (prediction.type === 'income') pIncome = add(pIncome, prediction.amount)
    else if (prediction.type === 'expense') pExpense = add(pExpense, prediction.amount)
    if (prediction.categoryId) {
      predictedById[prediction.categoryId] = add(
        predictedById[prediction.categoryId] ?? ZERO_MINOR,
        prediction.amount,
      )
    }
  }

  const actualBalance = sub(netIncome, netExpense)
  const predictedBalance = sub(pIncome, pExpense)

  const categoryMap = new Map(categories.map((category) => [category.id, category]))
  const netIncomeByCategory = flowByCategory(ledger, 'income', undefined, options)
  const netExpenseByCategory = flowByCategory(ledger, 'expense', undefined, options)

  const leafPredictedIncome: Record<string, Minor> = {}
  const leafPredictedExpense: Record<string, Minor> = {}
  for (const [catId, amount] of Object.entries(predictedById)) {
    const category = categoryMap.get(catId)
    if (!category) continue
    if (category.type === 'transfer') continue
    const target = category.type === 'income' ? leafPredictedIncome : leafPredictedExpense
    target[catId] = add(target[catId] ?? ZERO_MINOR, amount)
  }

  const categoryTree = (type: FlowCategoryType): IncomeExpenseCategoryDetail[] =>
    buildCategoryTree<IncomeExpenseCategoryDetail>(categories, type, (category, childLeaves, hasChildren) => {
      const ownActual = (type === 'income' ? netIncomeByCategory : netExpenseByCategory).get(category.id) ?? ZERO_MINOR
      const catActual = ownActual
      const catPredicted = (type === 'income' ? leafPredictedIncome : leafPredictedExpense)[category.id] ?? ZERO_MINOR
      const hasOwnData = catActual !== 0 || catPredicted !== 0
      if (!hasOwnData && childLeaves.length === 0) return null

      const childrenActual = sum(childLeaves.map((child) => child.actual))
      const childrenPredicted = sum(childLeaves.map((child) => child.predicted))
      const node: IncomeExpenseCategoryDetail = {
        name: category.name,
        actual: sum([catActual, childrenActual]),
        predicted: sum([catPredicted, childrenPredicted]),
        categoryId: category.id,
        hasChildren,
        sort: category.sort,
      }
      if (childLeaves.length > 0) node.children = childLeaves
      return node
    })

  const uncategorized = (type: FlowCategoryType): IncomeExpenseCategoryDetail | null => {
    const actual = (type === 'income' ? netIncomeByCategory : netExpenseByCategory).get(
      UNCATEGORIZED_CATEGORY_ID,
    ) ?? ZERO_MINOR
    if (actual === 0) return null
    return {
      name: input.uncategorizedLabel,
      actual,
      predicted: ZERO_MINOR,
      categoryId: 'uncategorized',
      hasChildren: false,
      sort: Number.MAX_SAFE_INTEGER,
    }
  }

  const incomeCategoryDetails = categoryTree('income')
  const expenseCategoryDetails = categoryTree('expense')
  const uncategorizedIncome = uncategorized('income')
  const uncategorizedExpense = uncategorized('expense')
  if (uncategorizedIncome) incomeCategoryDetails.push(uncategorizedIncome)
  if (uncategorizedExpense) expenseCategoryDetails.push(uncategorizedExpense)

  // 按展示名汇总：分类净额里已扣减退款，未分类金额必须也进明细树，否则合计对不上。
  const incomeByCategory: Record<string, Minor> = {}
  const expenseByCategory: Record<string, Minor> = {}
  for (const [catId, amount] of netIncomeByCategory) {
    const key = input.categoryNames.get(catId) ?? input.uncategorizedLabel
    incomeByCategory[key] = add(incomeByCategory[key] ?? ZERO_MINOR, amount)
  }
  for (const [catId, amount] of netExpenseByCategory) {
    const key = input.categoryNames.get(catId) ?? input.uncategorizedLabel
    expenseByCategory[key] = add(expenseByCategory[key] ?? ZERO_MINOR, amount)
  }

  // 对账条：期初净资产 + 净收入 − 净支出 + other = 期末净资产。
  // other = 不进收支统计的交易（转账、平账、不计收支）对账户余额的净效应，
  // 统一走 postingsOf；期初余额日只是锚点，不再有「开户前交易」的补偿项。
  const other = sum(
    balanceOnlyLedger
      .filter((transaction) => (includeExcluded ? !transaction.excludeFromIncomeExpense : true))
      .map(netWorthEffect),
  )
  const reconciliation: IncomeExpenseReconciliation = {
    startNetWorth: input.startNetWorth,
    netIncome,
    netExpense,
    other,
    endNetWorth: input.endNetWorth,
    difference: sub(
      input.endNetWorth,
      add(sub(add(input.startNetWorth, netIncome), netExpense), other),
    ),
  }

  return {
    income: { actual: netIncome, predicted: pIncome },
    expense: { actual: netExpense, predicted: pExpense },
    balance: { actual: actualBalance, predicted: predictedBalance },
    reconciliation,
    incomeByCategory,
    expenseByCategory,
    incomeCategoryDetails,
    expenseCategoryDetails,
    hasPredictions: input.predictions.length > 0,
  }
}
