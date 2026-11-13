import { calculateBalancesBatch } from '../balance.service.js'
import { rootLogger, toMinor } from '../../common/index.js'
import * as accountRepo from '../../db/repositories/account.repository.js'
import * as transactionCategoryRepo from '../../db/repositories/transaction-category.repository.js'
import * as transactionRepo from '../../db/repositories/transaction.repository.js'
import { toLedgerTransaction } from '../ledger.adapter.js'
import {
  buildIncomeExpenseStatement,
  sumAssetsLiabilities,
  type CategoryRef,
  type IncomeExpensePrediction,
} from '../../../../../packages/domain/src/index.js'
import { getPredictionsIfFuture, PREDICTION_NOTE_DEFAULT } from './prediction-source.js'
import { resolveReportPeriod } from './period.js'
import type { IncomeExpenseReportData } from '../../../../../packages/contracts/types/index.js'

const logger = rootLogger.child({ module: 'report' })

export async function generateIncomeExpense(
  startDate: string,
  endDate: string,
  includePredictions?: boolean,
  includeExcluded = false,
): Promise<IncomeExpenseReportData> {
  const startTime = Date.now()
  const { startDate: start, endDate: end, nextDay: endDayNext } = resolveReportPeriod(startDate, endDate)
  const startDay = new Date(start)

  // isAdjustment 已删除：type='adjustment' 已能区分非业务调整，Prisma schema 仅保留 type
  // 软删除过滤在 repository：已删除交易不进报表
  const transactions = await transactionRepo.findActive(
    {
      date: { gte: start, lte: end },
      type: { in: ['income', 'expense', 'refund'] },
      amount: { not: 0 },
      // includeExcluded 为 true 时不过滤「不计收支」交易，否则排除 excludeFromIncomeExpense=true 的交易
      ...(includeExcluded ? {} : { excludeFromIncomeExpense: false }),
    },
    { include: { category: true, account: true } },
  )

  // 对账条需要「改变余额但不进收支统计」的交易：转账手续费、平账、不计收支
  const balanceOnlyTransactions = await transactionRepo.findActive(
    {
      date: { gte: start, lte: end },
      OR: [
        { type: { in: ['transfer', 'adjustment'] } },
        { excludeFromIncomeExpense: true },
      ],
    },
    {
      select: {
        id: true,
        type: true,
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
    },
  )

  // Prisma 行 → 领域分录：收支口径、退款冲减、对账条净效应都在 domain/statements 内计算。
  const ledger = transactions.map(toLedgerTransaction)
  const balanceOnlyLedger = balanceOnlyTransactions.map((tx) => toLedgerTransaction({
    id: tx.id,
    type: tx.type,
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
  }))

  // 合并获取预测数据（一次查询替代原来的两次）
  const predictions = await getPredictionsIfFuture(endDate, !!includePredictions)
  const domainPredictions: IncomeExpensePrediction[] = predictions.map((p) => ({
    date: p.date.getTime(),
    type: p.type,
    amount: toMinor(p.amount),
    categoryId: p.categoryId,
  }))

  const allCategories = await transactionCategoryRepo.findMany({ orderBy: { sort: 'asc' } })
  const categories: CategoryRef[] = allCategories.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    parentId: c.parentId,
    sort: c.sort,
  }))

  const accounts = await accountRepo.findMany({})
  const allAccountIds = accounts.map(a => a.id)
  const balanceCache = await calculateBalancesBatch(allAccountIds, [startDay, endDayNext], accounts)
  const accountGetValue = (account: { id: string; type: string }, date: Date) =>
    toMinor(balanceCache.get(account.id, date))
  const startResult = sumAssetsLiabilities(
    accounts.map(a => ({ id: a.id, type: a.type })),
    (a) => accountGetValue(a, startDay),
  )
  const endResult = sumAssetsLiabilities(
    accounts.map(a => ({ id: a.id, type: a.type })),
    (a) => accountGetValue(a, endDayNext),
  )

  const statement = buildIncomeExpenseStatement({
    ledger,
    balanceOnlyLedger,
    categories,
    categoryNames: new Map(allCategories.map((c) => [c.id, c.name])),
    uncategorizedLabel: '未分类',
    predictions: domainPredictions,
    rangeStart: start.getTime(),
    rangeEndExclusive: endDayNext.getTime(),
    startNetWorth: startResult.netWorth,
    endNetWorth: endResult.netWorth,
    includeExcluded,
  })

  logger.info({ action: 'generate', report: 'income-expense', period: `${startDate}~${endDate}`, durationMs: Date.now() - startTime }, 'report generated')

  return {
    startDate,
    endDate,
    income: statement.income,
    expense: statement.expense,
    balance: statement.balance,
    reconciliation: statement.reconciliation,
    incomeByCategory: statement.incomeByCategory,
    expenseByCategory: statement.expenseByCategory,
    incomeCategoryDetails: statement.incomeCategoryDetails,
    expenseCategoryDetails: statement.expenseCategoryDetails,
    predictionNote: statement.hasPredictions ? PREDICTION_NOTE_DEFAULT : undefined,
  }
}
