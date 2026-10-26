import { minor } from '../../../../../packages/domain/src/index.js'
import { getCashFlags } from './report.utils.js'
import {
  AccountInfo,
  CategoryInfo,
  PredictionTransaction,
  ProcessedTx,
  TransactionWithIncludes,
} from './cash-flow-types.js'

/**
 * 将 actual + predicted 原始数据统一规整为 ProcessedTx 列表。
 * 这样后续 aggregate 不再需要区分 isActual / isPredicted 分支。
 */
export function collectTransactions(args: {
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
    const { isFromCash, isToCash } = getCashFlags(t.accountId, t.toAccountId, cashAccountIds)
    actualItems.push({
      isPredicted: false,
      type: t.type,
      relatedType: t.relatedType,
      amount: minor(Number(t.amount)),
      fee: minor(Number(t.fee ?? 0)),
      coupon: minor(Number(t.coupon ?? 0)),
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

    const { isFromCash, isToCash } = getCashFlags(p.accountId, p.toAccountId, cashAccountIds)
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
      icon: category?.icon ?? null,
      color: category?.color ?? null,
    })
  }

  return { actualItems, predictedItems }
}
