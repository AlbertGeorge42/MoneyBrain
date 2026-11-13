import { calculateBalancesBatch } from '../balance.service.js'
import * as accountRepo from '../../db/repositories/account.repository.js'
import { rootLogger, toMinor } from '../../common/index.js'
import {
  accumulatePredictedChanges,
  buildBalanceSheet,
  neg,
  sub,
  sumPredictedByType,
  ZERO_MINOR,
  type BalanceSheetAccountInput,
  type Minor,
} from '../../../../../packages/domain/src/index.js'
import { PREDICTION_NOTE_BALANCE_SHEET, toPredictedEvents } from './prediction-source.js'
import { resolveReportPeriod, type DateGranularity } from './period.js'
import { formatDateLocal } from '../../common/date.js'
import { generatePredictions } from '../budget.service.js'
import type { BalanceSheetReportData } from '../../../../../packages/contracts/types/index.js'

const logger = rootLogger.child({ module: 'report' })

export type { DateGranularity }

export async function generateBalanceSheet(date: string): Promise<BalanceSheetReportData> {
  const startTime = Date.now()
  const { endDate: targetDate, nextDay: nextDayDate, granularity } = resolveReportPeriod(date)
  const now = new Date()

  const accounts = await accountRepo.findMany({
    include: { category: true },
    orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
  })

  const allAccountIds = accounts.map(a => a.id)
  const balanceCache = await calculateBalancesBatch(allAccountIds, [nextDayDate])

  const accountBalances = accounts.map(account => ({
    ...account,
    balance: toMinor(balanceCache.get(account.id, nextDayDate)),
  }))

  // 预测数据
  // 数据约定：predictedAssets / predictedLiabilities / predictedNetWorth 均为"变化量"
  //   predictedLiabilities > 0 → 未来负债金额增加
  //   predictedLiabilities < 0 → 未来负债金额减少（还债等）
  // sumPredictionByType 返回的 liabilityChange 是"负债账户余额的变化"，
  // 由于负债账户余额在数据库中以负数存储，余额变正意味着负债金额减少，
  // 因此需要取负再写入"负债金额变化"这一语义。
  let predictedAssets: Minor = ZERO_MINOR
  let predictedLiabilities: Minor = ZERO_MINOR
  let predictionNote: string | undefined
  let predictedChanges: Map<string, Minor> = new Map()

  if (targetDate > now) {
    const predictions = await generatePredictions(
      formatDateLocal(now),
      formatDateLocal(targetDate)
    )

    if (predictions.length > 0) {
      const accountLookup = new Map(accounts.map(a => [a.id, a]))
      predictedChanges = accumulatePredictedChanges(toPredictedEvents(predictions))
      const predicted = sumPredictedByType(predictedChanges, accountLookup)
      predictedAssets = predicted.assetChange
      predictedLiabilities = neg(predicted.liabilityChange)
      predictionNote = PREDICTION_NOTE_BALANCE_SHEET
    }
  }

  const predictedNetWorth = sub(predictedAssets, predictedLiabilities)

  // Prisma 账户 + 批量余额 + 预测变化量 → 领域输入；分类树、逐级小计、
  // 负债符号口径、排序与实际值汇总全部由 domain/statements 计算。
  const domainAccounts: BalanceSheetAccountInput[] = accountBalances.map(account => ({
    id: account.id,
    name: account.name,
    type: account.type,
    categoryId: account.category?.id || 'uncategorized',
    categoryName: account.category?.name || '未分类',
    categorySort: account.category?.sort ?? 0,
    actualBalance: account.balance,
    predictedChange: predictedChanges.get(account.id) ?? ZERO_MINOR,
  }))

  const report = buildBalanceSheet(domainAccounts)

  logger.info({ action: 'generate', report: 'balance-sheet', period: date, durationMs: Date.now() - startTime }, 'report generated')

  return {
    date: formatDateLocal(targetDate),
    granularity,
    assets: { actual: report.actual.assets, predicted: predictedAssets },
    liabilities: { actual: report.actual.liabilities, predicted: predictedLiabilities },
    netWorth: { actual: report.actual.netWorth, predicted: predictedNetWorth },
    assetNodes: report.assetNodes,
    liabilityNodes: report.liabilityNodes,
    predictionNote,
  }
}
