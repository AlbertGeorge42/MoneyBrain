import {
  ZERO_MINOR,
  minor,
  type CashFlowActivityKey,
  type ProcessedTx,
} from '../../../../../packages/domain/src/index.js'
import { toMinor } from '../../common/index.js'
import { type SankeySourceTransaction } from './sankey.js'
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
  /** TransactionCategory 有效 cashFlowType（根节点继承后）。 */
  effectiveCashFlowTypes?: Map<string, CashFlowActivityKey | null>
}

/** 从叶子分类向上沿 parentId 链找 cashFlowType（actual 交易的 category 行可能没被 effectiveFlags 覆盖到）。 */
function effectiveCashFlowTypeOf(
  categoryId: string | null | undefined,
  categoryMap: Map<string, CategoryInfo>,
  effectiveCashFlowTypes?: Map<string, CashFlowActivityKey | null>,
): CashFlowActivityKey | null {
  if (categoryId && effectiveCashFlowTypes && effectiveCashFlowTypes.has(categoryId)) {
    return effectiveCashFlowTypes.get(categoryId) ?? null
  }
  // fallback: 如果 categoryMap 里有已继承好的值（predicted 路径）也能拿到
  if (categoryId && categoryMap.has(categoryId)) {
    return (categoryMap.get(categoryId)?.cashFlowType ?? null) as CashFlowActivityKey | null
  }
  return null
}

/** 将 actual + predicted 原始数据统一规整为 ProcessedTx 列表。 */
export function collectTransactions(args: CollectArgs): { actualItems: ProcessedTx[]; predictedItems: ProcessedTx[] } {
  const { transactions, predictions, start, end, cashAccountIds, categoryMap, accountMap, effectiveCashFlowTypes } = args
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
      cashFlowType: effectiveCashFlowTypeOf(t.category?.id, categoryMap, effectiveCashFlowTypes),
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
      cashFlowType: effectiveCashFlowTypeOf(p.categoryId, categoryMap, effectiveCashFlowTypes),
      accountName: account?.name || '未知账户',
      toAccountName: toAccount?.name || null,
    })
  }

  return { actualItems, predictedItems }
}

/** 沿 parentId 找一级分类，返回其稳定 id 与展示名（桑基分类分组身份）。 */
function categoryGroupOf(
  categoryId: string | null | undefined,
  categoryMap: Map<string, CategoryInfo>,
): { id: string; name: string } | null {
  if (!categoryId) return null
  let current = categoryMap.get(categoryId)
  if (!current) return null
  const visited = new Set<string>()
  let rootId = categoryId
  while (current.parentId && !visited.has(rootId)) {
    visited.add(rootId)
    rootId = current.parentId
    const parent = categoryMap.get(rootId)
    if (!parent) break
    current = parent
  }
  return { id: rootId, name: current.name }
}

/** 账户的账户分类分组身份。 */
function accountGroupOf(accountId: string | null | undefined, accountMap: Map<string, AccountInfo>) {
  if (!accountId) return null
  const account = accountMap.get(accountId)
  if (!account?.categoryId) return null
  return { id: account.categoryId, name: account.categoryName ?? account.name }
}


/** 有效 cashFlowType → 桑基活动身份；非三类值（未分配）落 null。 */
function activityOf(value: CashFlowActivityKey | string | null): CashFlowActivityKey | null {
  return value === 'operating' || value === 'investing' || value === 'financing' ? value : null
}

/**
 * Prisma 行 / 预算 DTO → 桑基图的领域输入。
 * 名称兜底与 collectTransactions 有意不同（桑基有「其他收入」「现金账户」等展示节点名），
 * 这是既有口径，不要顺手统一。
 */
export function collectSankeySources(args: CollectArgs): SankeySourceTransaction[] {
  const { transactions, predictions, start, end, cashAccountIds, categoryMap, accountMap, effectiveCashFlowTypes } = args
  const rangeStart = start.getTime()
  const rangeEnd = end.getTime()
  const sources: SankeySourceTransaction[] = []

  for (const t of transactions) {
    const { isFromCash, isToCash } = cashFlags(t.accountId, t.toAccountId, cashAccountIds)
    const catGroup = categoryGroupOf(t.category?.id, categoryMap)
    const accGroup = accountGroupOf(t.accountId, accountMap)
    const toGroup = accountGroupOf(t.toAccountId, accountMap)
    sources.push({
      isActual: true,
      type: t.type,
      relatedType: t.relatedType,
      amount: toMinor(t.amount),
      fee: toMinor(t.fee),
      coupon: toMinor(t.coupon),
      cashFlowType: activityOf(effectiveCashFlowTypeOf(t.category?.id, categoryMap, effectiveCashFlowTypes)),
      isFromCash,
      isToCash,
      categoryName: t.category?.name || '未分类',
      categoryId: t.category?.id ?? null,
      accountName: t.account?.name,
      accountId: t.accountId,
      toAccountName: t.toAccount?.name,
      toAccountId: t.toAccountId ?? null,
      categoryGroupId: catGroup?.id ?? null,
      categoryGroupName: catGroup?.name ?? null,
      accountGroupId: accGroup?.id ?? null,
      accountGroupName: accGroup?.name ?? null,
      toAccountGroupId: toGroup?.id ?? null,
      toAccountGroupName: toGroup?.name ?? null,
    })
  }

  for (const p of predictions) {
    if (!inWindow(p.date.getTime(), rangeStart, rangeEnd)) continue
    const { isFromCash, isToCash } = cashFlags(p.accountId, p.toAccountId, cashAccountIds)
    if (!isFromCash && !isToCash) continue

    const category = p.categoryId ? categoryMap.get(p.categoryId) : null
    const account = accountMap.get(p.accountId)
    const toAccount = p.toAccountId ? accountMap.get(p.toAccountId) : null
    const catGroup = categoryGroupOf(p.categoryId, categoryMap)
    const accGroup = accountGroupOf(p.accountId, accountMap)
    const toGroup = accountGroupOf(p.toAccountId, accountMap)

    sources.push({
      isActual: false,
      type: p.type,
      relatedType: null,
      amount: toMinor(p.amount),
      fee: ZERO_MINOR,
      coupon: ZERO_MINOR,
      cashFlowType: activityOf(effectiveCashFlowTypeOf(p.categoryId, categoryMap, effectiveCashFlowTypes)),
      isFromCash,
      isToCash,
      categoryName: category?.name,
      categoryId: p.categoryId ?? null,
      accountName: account?.name,
      accountId: p.accountId,
      toAccountName: toAccount?.name,
      toAccountId: p.toAccountId ?? null,
      categoryGroupId: catGroup?.id ?? null,
      categoryGroupName: catGroup?.name ?? null,
      accountGroupId: accGroup?.id ?? null,
      accountGroupName: accGroup?.name ?? null,
      toAccountGroupId: toGroup?.id ?? null,
      toAccountGroupName: toGroup?.name ?? null,
    })
  }

  return sources
}
