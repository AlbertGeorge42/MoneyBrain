import {
  ZERO_MINOR,
  minor,
  type ProcessedTx,
  type SankeySourceTransaction,
} from '../../../../../packages/domain/src/index.js'
import { toMinor } from '../../common/index.js'
import {
  AccountInfo,
  CategoryInfo,
  PredictionTransaction,
  TransactionWithIncludes,
} from './cash-flow-types.js'

/** 现金集合判定：活动桶聚合与桑基图共用同一处，避免两条链路各自判断。 */
function cashFlags(accountId: string, toAccountId: string | null | undefined, cashAccountIds: string[]) {
  return {
    isFromCash: cashAccountIds.includes(accountId),
    isToCash: !!toAccountId && cashAccountIds.includes(toAccountId),
  }
}

/**
 * 预测点位覆盖范围是 [now, endDate] 而非 [startDate, endDate]，
 * 两条链路都必须按 [start, end] 再过滤一次，否则跨月查询会累加窗口外的点位。
 */
function inWindow(timestamp: number, rangeStart: number, rangeEnd: number): boolean {
  return timestamp >= rangeStart && timestamp <= rangeEnd
}

interface CollectArgs {
  transactions: TransactionWithIncludes[]
  predictions: PredictionTransaction[]
  start: Date
  end: Date
  cashAccountIds: string[]
  categoryMap: Map<string, CategoryInfo>
  accountMap: Map<string, AccountInfo>
}

/** 将 actual + predicted 原始数据统一规整为 ProcessedTx 列表。 */
export function collectTransactions(args: CollectArgs): { actualItems: ProcessedTx[]; predictedItems: ProcessedTx[] } {
  const { transactions, predictions, start, end, cashAccountIds, categoryMap, accountMap } = args
  const rangeStart = start.getTime()
  const rangeEnd = end.getTime()

  const actualItems: ProcessedTx[] = []
  for (const t of transactions) {
    const { isFromCash, isToCash } = cashFlags(t.accountId, t.toAccountId, cashAccountIds)
    actualItems.push({
      isPredicted: false,
      type: t.type,
      relatedType: t.relatedType,
      amount: toMinor(t.amount),
      fee: toMinor(t.fee),
      coupon: toMinor(t.coupon),
      isFromCash,
      isToCash,
      categoryName: t.category?.name || '未分类',
      categoryId: t.category?.id || null,
      parentId: t.category?.parentId || null,
      level: t.category?.parentId ? 2 : 1,
      cashFlowType: t.category?.cashFlowType || null,
      accountName: t.account?.name || '未知账户',
      toAccountName: t.toAccount?.name || null,
    })
  }

  const predictedItems: ProcessedTx[] = []
  for (const p of predictions) {
    if (!inWindow(p.date.getTime(), rangeStart, rangeEnd)) continue

    const { isFromCash, isToCash } = cashFlags(p.accountId, p.toAccountId, cashAccountIds)
    if (!isFromCash && !isToCash) continue

    const category = p.categoryId ? categoryMap.get(p.categoryId) : null
    const account = accountMap.get(p.accountId)
    const toAccount = p.toAccountId ? accountMap.get(p.toAccountId) : null

    predictedItems.push({
      isPredicted: true,
      type: p.type,
      relatedType: null,
      amount: minor(p.amount),
      fee: minor(0),
      coupon: minor(0),
      isFromCash,
      isToCash,
      categoryName: category?.name || '未分类',
      categoryId: p.categoryId || null,
      parentId: category?.parentId || null,
      level: category?.level || 1,
      cashFlowType: category?.cashFlowType || null,
      accountName: account?.name || '未知账户',
      toAccountName: toAccount?.name || null,
    })
  }

  return { actualItems, predictedItems }
}

/**
 * Prisma 行 / 预算 DTO → 桑基图的领域输入。
 * 名称兜底与 collectTransactions 有意不同（桑基有「其他收入」「现金账户」等展示节点名），
 * 这是既有口径，不要顺手统一。
 */
export function collectSankeySources(args: CollectArgs): SankeySourceTransaction[] {
  const { transactions, predictions, start, end, cashAccountIds, categoryMap, accountMap } = args
  const rangeStart = start.getTime()
  const rangeEnd = end.getTime()
  const sources: SankeySourceTransaction[] = []

  for (const t of transactions) {
    const { isFromCash, isToCash } = cashFlags(t.accountId, t.toAccountId, cashAccountIds)
    sources.push({
      isActual: true,
      type: t.type,
      relatedType: t.relatedType,
      amount: toMinor(t.amount),
      fee: toMinor(t.fee),
      coupon: toMinor(t.coupon),
      isFromCash,
      isToCash,
      categoryName: t.category?.name || '未分类',
      accountName: t.account?.name,
      toAccountName: t.toAccount?.name,
    })
  }

  for (const p of predictions) {
    if (!inWindow(p.date.getTime(), rangeStart, rangeEnd)) continue
    const { isFromCash, isToCash } = cashFlags(p.accountId, p.toAccountId, cashAccountIds)
    if (!isFromCash && !isToCash) continue

    const category = p.categoryId ? categoryMap.get(p.categoryId) : null
    const account = accountMap.get(p.accountId)
    const toAccount = p.toAccountId ? accountMap.get(p.toAccountId) : null

    sources.push({
      isActual: false,
      type: p.type,
      relatedType: null,
      amount: toMinor(p.amount),
      fee: ZERO_MINOR,
      coupon: ZERO_MINOR,
      isFromCash,
      isToCash,
      categoryName: category?.name,
      accountName: account?.name,
      toAccountName: toAccount?.name,
    })
  }

  return sources
}
