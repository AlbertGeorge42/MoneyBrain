import { ZERO_MINOR, add, neg, sub, sum, type Minor } from '../../money.js'
import { projectionFlowValue } from '../../projection/sources.js'
import type {
  AggregatedFlows,
  CashFlowActivity,
  CashFlowActivityItem,
  CashFlowActivityMinor,
  CashFlowStatement,
  ProjectionCashActivity,
  ProjectionCashActivityItem,
  ProjectionCashByActivity,
  ReportValue,
} from './types.js'

type ActivityKey = 'operating' | 'investing' | 'financing' | 'uncategorized'

function itemKeyOf(item: CashFlowActivityMinor['items'][number]): string {
  return `${item.categoryName}|${item.type}|${item.direction}`
}

/** 单层 parentId → children 映射（与报表树工具同语义，Domain 不依赖 contracts）。 */
function childrenMapOf<T extends { parentId: string | null }>(items: T[]): Map<string | null, T[]> {
  const map = new Map<string | null, T[]>()
  for (const item of items) {
    const key = item.parentId ?? null
    const list = map.get(key)
    if (list) list.push(item)
    else map.set(key, [item])
  }
  return map
}

/**
 * 合并三来源的活动明细。
 * 活动级 inflow / outflow 用正数（与现金流推演点位同口径）；
 * item 保留既有符号约定（流入为正、流出为负），planned 为 null 表示无预算来源。
 */
export function buildProjectionActivity(
  actual: AggregatedFlows,
  committed: AggregatedFlows,
  planned: AggregatedFlows,
): ProjectionCashByActivity {
  const pick = (flows: AggregatedFlows, key: ActivityKey): CashFlowActivityMinor => flows[key]

  const buildItems = (key: ActivityKey): ProjectionCashActivityItem[] => {
    interface ItemState {
      categoryId: string | null
      parentId: string | null
      level: number
      categoryName: string
      type: string
      direction: string
      actual: Minor
      committed: Minor
      planned: Minor | null
    }
    const itemMap = new Map<string, ItemState>()
    const addSource = (source: 'actual' | 'committed' | 'planned', items: CashFlowActivityMinor['items']) => {
      for (const item of items) {
        const itemKey = itemKeyOf(item)
        const existing = itemMap.get(itemKey)
        if (existing) {
          if (source === 'actual') existing.actual = add(existing.actual, item.amount)
          else if (source === 'committed') existing.committed = add(existing.committed, item.amount)
          else existing.planned = add(existing.planned ?? ZERO_MINOR, item.amount)
        } else {
          itemMap.set(itemKey, {
            categoryId: item.categoryId,
            parentId: item.parentId,
            level: item.level,
            categoryName: item.categoryName,
            type: item.type,
            direction: item.direction,
            actual: source === 'actual' ? item.amount : ZERO_MINOR,
            committed: source === 'committed' ? item.amount : ZERO_MINOR,
            planned: source === 'planned' ? item.amount : null,
          })
        }
      }
    }

    addSource('actual', pick(actual, key).items)
    addSource('committed', pick(committed, key).items)
    addSource('planned', pick(planned, key).items)

    const merged = [...itemMap.values()]
    const level1 = merged.filter((item) => item.level === 1 || !item.parentId)
    const childrenMap = childrenMapOf(merged.filter((item) => item.parentId))

    return level1.map((item) => {
      const children: ProjectionCashActivityItem[] = (childrenMap.get(item.categoryId) ?? []).map((child) => ({
        categoryName: child.categoryName,
        categoryId: child.categoryId,
        parentId: child.parentId,
        level: child.level,
        direction: child.direction,
        type: child.type,
        actual: child.actual,
        committed: child.committed,
        planned: child.planned,
        total: sum([child.actual, child.committed, child.planned ?? ZERO_MINOR]),
      }))

      const actualTotal = sum([item.actual, ...children.map((child) => child.actual)])
      const committedTotal = sum([item.committed, ...children.map((child) => child.committed)])
      const plannedChildren = children.filter((child) => child.planned !== null)
      const plannedTotal = item.planned === null && plannedChildren.length === 0
        ? null
        : sum([item.planned ?? ZERO_MINOR, ...plannedChildren.map((child) => child.planned ?? ZERO_MINOR)])

      const node: ProjectionCashActivityItem = {
        categoryName: item.categoryName,
        categoryId: item.categoryId,
        parentId: item.parentId,
        level: item.level,
        direction: item.direction,
        type: item.type,
        actual: actualTotal,
        committed: committedTotal,
        planned: plannedTotal,
        total: sum([actualTotal, committedTotal, plannedTotal ?? ZERO_MINOR]),
      }
      if (children.length > 0) node.children = children
      return node
    })
  }

  const buildActivity = (key: ActivityKey): ProjectionCashActivity => {
    const a = pick(actual, key)
    const c = pick(committed, key)
    const p = pick(planned, key)
    // outflow 在 aggregate 里以负号累计，对外统一成正数。
    const inflow = projectionFlowValue(a.inflow, p.inflow, c.inflow)
    const outflow = projectionFlowValue(neg(a.outflow), neg(p.outflow), neg(c.outflow))
    return {
      inflow,
      outflow,
      net: projectionFlowValue(
        sub(inflow.actual, outflow.actual),
        sub(inflow.planned, outflow.planned),
        sub(inflow.committed, outflow.committed),
      ),
      items: buildItems(key),
    }
  }

  return {
    operating: buildActivity('operating'),
    investing: buildActivity('investing'),
    financing: buildActivity('financing'),
    uncategorized: buildActivity('uncategorized'),
  }
}

function toActivityResult(actual: CashFlowActivityMinor, predicted: CashFlowActivityMinor): CashFlowActivity {
  const itemMap = new Map<string, {
    categoryId: string | null
    parentId: string | null
    level: number
    categoryName: string
    actual: Minor
    predicted: Minor
    type: string
    direction: string
  }>()

  for (const item of actual.items) {
    itemMap.set(itemKeyOf(item), {
      categoryId: item.categoryId,
      parentId: item.parentId,
      level: item.level,
      categoryName: item.categoryName,
      actual: item.amount,
      predicted: ZERO_MINOR,
      type: item.type,
      direction: item.direction,
    })
  }

  for (const item of predicted.items) {
    const key = itemKeyOf(item)
    const existing = itemMap.get(key)
    if (existing) {
      // aggregate 阶段已按 (categoryName, direction) 合并，命中项不会重复累加
      existing.predicted = item.amount
    } else {
      itemMap.set(key, {
        categoryId: item.categoryId,
        parentId: item.parentId,
        level: item.level,
        categoryName: item.categoryName,
        actual: ZERO_MINOR,
        predicted: item.amount,
        type: item.type,
        direction: item.direction,
      })
    }
  }

  const mergedItems = Array.from(itemMap.values())
  const level1Items = mergedItems.filter((item) => item.level === 1 || !item.parentId)
  const childrenMap = childrenMapOf(mergedItems.filter((item) => item.parentId))

  const treeItems: CashFlowActivityItem[] = level1Items.map((item) => {
    const children: CashFlowActivityItem[] = (childrenMap.get(item.categoryId) ?? []).map((child) => ({
      categoryName: child.categoryName,
      categoryId: child.categoryId,
      parentId: child.parentId,
      level: child.level,
      amount: sum([child.actual, child.predicted]),
      actual: child.actual,
      predicted: child.predicted,
      type: child.type,
      direction: child.direction,
    }))

    const totalActual = sum([item.actual, ...children.map((child) => child.actual)])
    const totalPredicted = sum([item.predicted, ...children.map((child) => child.predicted)])

    const node: CashFlowActivityItem = {
      categoryName: item.categoryName,
      categoryId: item.categoryId,
      parentId: item.parentId,
      level: item.level,
      amount: sum([totalActual, totalPredicted]),
      actual: totalActual,
      predicted: totalPredicted,
      type: item.type,
      direction: item.direction,
    }
    if (children.length > 0) node.children = children
    return node
  })

  return {
    inflow: { actual: actual.inflow, predicted: predicted.inflow },
    outflow: { actual: actual.outflow, predicted: predicted.outflow },
    // outflow 已是负数，net = inflow + outflow 直接相加
    net: { actual: add(actual.inflow, actual.outflow), predicted: add(predicted.inflow, predicted.outflow) },
    items: treeItems,
  }
}

/** 合并 actual + predicted 聚合结果，生成 4 类活动 + 现金流汇总 + 按账户流。 */
export function buildStatement(actual: AggregatedFlows, predicted: AggregatedFlows): CashFlowStatement {
  const sumBucket = (flows: AggregatedFlows, field: 'inflow' | 'outflow') => sum([
    flows.operating[field],
    flows.investing[field],
    flows.financing[field],
    flows.uncategorized[field],
  ])

  const actualCashInflow = sumBucket(actual, 'inflow')
  const actualCashOutflow = sumBucket(actual, 'outflow')
  const actualNetCashFlow = add(actualCashInflow, actualCashOutflow)

  const predictedCashInflow = sumBucket(predicted, 'inflow')
  const predictedCashOutflow = sumBucket(predicted, 'outflow')
  const predictedNetCashFlow = add(predictedCashInflow, predictedCashOutflow)

  const flowByAccount: Record<string, { inflow: ReportValue; outflow: ReportValue }> = {}
  for (const [name, flow] of Object.entries(actual.flowByAccount)) {
    const pred = predicted.flowByAccount[name] ?? { inflow: ZERO_MINOR, outflow: ZERO_MINOR }
    flowByAccount[name] = {
      inflow: { actual: flow.inflow, predicted: pred.inflow },
      outflow: { actual: flow.outflow, predicted: pred.outflow },
    }
  }
  for (const [name, flow] of Object.entries(predicted.flowByAccount)) {
    if (!flowByAccount[name]) {
      flowByAccount[name] = {
        inflow: { actual: ZERO_MINOR, predicted: flow.inflow },
        outflow: { actual: ZERO_MINOR, predicted: flow.outflow },
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
    cashInflow: { actual: actualCashInflow, predicted: predictedCashInflow },
    cashOutflow: { actual: actualCashOutflow, predicted: predictedCashOutflow },
    netCashFlow: { actual: actualNetCashFlow, predicted: predictedNetCashFlow },
    // 平账单列：netCashFlow + reconciliation === cashChange
    reconciliation: { actual: actual.reconciliation, predicted: predicted.reconciliation },
    flowByAccount,
  }
}
