import { ZERO_MINOR, add, neg, round, sub, sum, type Minor } from '../money.js'
import type {
  AllocationItem,
  AllocationSnapshot,
  AllocationSnapshotItem,
  SnapshotHistoryEntry,
} from './types.js'

/** 未分类项使用的伪资产类型 id（不参与比例计算）。 */
export const UNCLASSIFIED_ASSET_CLASS_ID = '__unclassified__'

const UNCLASSIFIED_SORT = 999

function unclassifiedItem(marketValue: Minor): AllocationItem {
  return {
    assetClassId: UNCLASSIFIED_ASSET_CLASS_ID,
    name: '未分类',
    marketValue,
    ratio: 0,
    targetRatio: null,
    deviation: null,
    rebalanceAmount: null,
    periodInvested: ZERO_MINOR,
    periodWithdrawn: ZERO_MINOR,
    periodReturn: null,
    returnRate: null,
    sort: UNCLASSIFIED_SORT,
  }
}

/**
 * 最新快照的持仓明细：占比 / 目标偏差 / 再平衡金额 / 单项期间收益。
 * 占比与再平衡以「已分类市值」为分母，账户余额与市值的差额补成未分类项。
 */
export function buildAllocationItems(
  items: readonly AllocationSnapshotItem[],
  accountBalance: Minor,
): AllocationItem[] {
  const totalMarketValue = sum(items.map(item => item.marketValue))

  const result: AllocationItem[] = items.map(item => {
    const itemMarketValue = item.marketValue
    const ratio = totalMarketValue > 0
      ? (itemMarketValue / totalMarketValue) * 100
      : 0
    const targetRatio = item.targetRatio
    const deviation = targetRatio !== null ? ratio - targetRatio : null
    const rebalanceAmount = targetRatio !== null
      ? round((targetRatio / 100) * totalMarketValue - itemMarketValue)
      : null

    let periodReturn: Minor | null = null
    let returnRate: number | null = null

    if (item.previousMarketValue !== null) {
      const netContribution = item.periodNetFlow
      const periodReturnAmount = sub(sub(itemMarketValue, item.previousMarketValue), netContribution)
      const positiveNetContribution = netContribution > 0 ? netContribution : ZERO_MINOR
      const denominator = add(item.previousMarketValue, positiveNetContribution)
      periodReturn = periodReturnAmount
      returnRate = denominator > 0
        ? (periodReturnAmount / denominator) * 100
        : null
    }

    const periodNetFlow = item.periodNetFlow

    return {
      assetClassId: item.assetClassId,
      name: item.name,
      marketValue: itemMarketValue,
      ratio,
      targetRatio,
      deviation,
      rebalanceAmount,
      periodInvested: periodNetFlow > 0 ? periodNetFlow : ZERO_MINOR,
      periodWithdrawn: periodNetFlow < 0 ? neg(periodNetFlow) : ZERO_MINOR,
      periodReturn,
      returnRate,
      sort: item.sort,
    }
  })

  const unclassifiedValue = sub(accountBalance, totalMarketValue)
  if (unclassifiedValue !== 0 && result.length > 0) {
    result.push(unclassifiedItem(unclassifiedValue))
  }

  return result
}

/** 历史快照列表：占比以该快照的账户余额为分母，差额同样补成未分类项。 */
export function buildSnapshotHistory(
  snapshots: readonly AllocationSnapshot[],
): SnapshotHistoryEntry[] {
  return snapshots.map(snapshot => {
    const accountBalance = snapshot.accountBalance
    const totalMarketValue = sum(snapshot.items.map(item => item.marketValue))
    const unclassifiedValue = sub(accountBalance, totalMarketValue)
    const items = snapshot.items.map(item => ({
      assetClassId: item.assetClassId,
      name: item.name,
      marketValue: item.marketValue,
      ratio: accountBalance > 0 ? (item.marketValue / accountBalance) * 100 : 0,
    }))

    if (unclassifiedValue !== 0 && items.length > 0) {
      items.push({
        assetClassId: UNCLASSIFIED_ASSET_CLASS_ID,
        name: '未分类',
        marketValue: unclassifiedValue,
        ratio: accountBalance > 0 ? (unclassifiedValue / accountBalance) * 100 : 0,
      })
    }

    return {
      id: snapshot.id,
      date: snapshot.date,
      accountBalance,
      items,
    }
  })
}

/**
 * 把同一分类下各账户的持仓合并成分类级持仓列表（按 assetClassId 聚合）。
 * 字段口径与账户明细一致：市值 / 期间申赎 / 再平衡金额求和；ratio 以分类已分类市值为分母；
 * targetRatio 与 returnRate 按市值加权（无有效样本时保留 null）。
 */
export function mergeCategoryItems(items: readonly AllocationItem[]): AllocationItem[] {
  if (items.length === 0) return []

  const groups = new Map<string, AllocationItem[]>()
  for (const item of items) {
    const group = groups.get(item.assetClassId)
    if (group) group.push(item)
    else groups.set(item.assetClassId, [item])
  }

  const classifiedMarketValue = sum(
    items
      .filter(item => item.assetClassId !== UNCLASSIFIED_ASSET_CLASS_ID)
      .map(item => item.marketValue),
  )

  const merged: AllocationItem[] = []
  for (const [assetClassId, group] of groups) {
    const marketValue = sum(group.map(item => item.marketValue))
    const weighted = (pick: (item: AllocationItem) => number | null): number | null => {
      let total = 0
      let weight = 0
      for (const item of group) {
        const value = pick(item)
        if (value === null) continue
        total += value * item.marketValue
        weight += item.marketValue
      }
      return weight > 0 ? total / weight : null
    }

    const targetRatio = weighted(item => item.targetRatio)
    const ratio = assetClassId === UNCLASSIFIED_ASSET_CLASS_ID || classifiedMarketValue <= 0
      ? 0
      : (marketValue / classifiedMarketValue) * 100
    const rebalanceAmount = group.some(item => item.rebalanceAmount !== null)
      ? sum(group.map(item => item.rebalanceAmount ?? ZERO_MINOR))
      : null
    const periodReturn = group.some(item => item.periodReturn !== null)
      ? sum(group.map(item => item.periodReturn ?? ZERO_MINOR))
      : null

    merged.push({
      assetClassId,
      name: group[0]!.name,
      marketValue,
      ratio,
      targetRatio,
      deviation: targetRatio !== null ? ratio - targetRatio : null,
      rebalanceAmount,
      periodInvested: sum(group.map(item => item.periodInvested)),
      periodWithdrawn: sum(group.map(item => item.periodWithdrawn)),
      periodReturn,
      returnRate: weighted(item => item.returnRate),
      sort: Math.min(...group.map(item => item.sort)),
    })
  }

  return merged.sort((a, b) => a.sort - b.sort)
}
