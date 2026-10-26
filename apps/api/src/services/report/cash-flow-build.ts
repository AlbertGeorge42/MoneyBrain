import { minor, transferOutflow, type Minor } from '../../../../../packages/domain/src/index.js'
import { buildChildrenMap } from '../../common/tree.js'
import { getCashFlags } from './report.utils.js'
import {
  AccountInfo,
  AggregatedFlows,
  CashFlowActivity,
  CashFlowActivityMinor,
  CashFlowActivityItem,
  CashFlowResult,
  CategoryInfo,
  PredictionTransaction,
  ReportValue,
  TransactionWithIncludes,
} from './cash-flow-types.js'

// 桑基图节点类型（与 shared CashFlowReportData.sankey.nodes 对齐）
type SankeyNode = CashFlowResult['sankey']['nodes'][number]

function toActivityResult(actual: CashFlowActivityMinor, predicted: CashFlowActivityMinor): CashFlowActivity {
  // 合并实际和预测的 items
  const itemMap = new Map<string, { categoryId: string | null; parentId: string | null; level: number; categoryName: string; actual: Minor; predicted: Minor; type: string; direction: string; icon?: string | null; color?: string | null }>()

  for (const item of actual.items) {
    const key = `${item.categoryName}|${item.type}|${item.direction}`
    itemMap.set(key, {
      categoryId: item.categoryId,
      parentId: item.parentId,
      level: item.level,
      categoryName: item.categoryName,
      actual: item.amount,
      predicted: minor(0),
      type: item.type,
      direction: item.direction,
      icon: item.icon,
      color: item.color,
    })
  }

  for (const item of predicted.items) {
    const key = `${item.categoryName}|${item.type}|${item.direction}`
    const existing = itemMap.get(key)
    if (existing) {
      existing.predicted = item.amount
      // 实际数据优先；预测数据仅在无实际数据时使用 icon/color
      if (existing.icon == null) existing.icon = item.icon
      if (existing.color == null) existing.color = item.color
    } else {
      itemMap.set(key, {
        categoryId: item.categoryId,
        parentId: item.parentId,
        level: item.level,
        categoryName: item.categoryName,
        actual: minor(0),
        predicted: item.amount,
        type: item.type,
        direction: item.direction,
        icon: item.icon,
        color: item.color,
      })
    }
  }

  const mergedItems = Array.from(itemMap.values())

  // 分离一级分类，并构建 parentId → children 映射（供树形构建使用）
  const level1Items = mergedItems.filter(item => item.level === 1 || !item.parentId)
  const childrenMap = buildChildrenMap(
    mergedItems.filter(i => i.parentId).map(i => ({ ...i, id: i.categoryId ?? '' }))
  )

  // 构建树形结构并累加
  const treeItems: CashFlowActivityItem[] = level1Items.map(item => {
    // 获取该一级分类下的所有二级子分类
    const children = (childrenMap.get(item.categoryId) ?? [])
      .map(child => ({
        categoryName: child.categoryName,
        categoryId: child.categoryId,
        parentId: child.parentId,
        level: child.level,
        amount: minor(child.actual + child.predicted),
        actual: child.actual,
        predicted: child.predicted,
        type: child.type,
        direction: child.direction,
        icon: child.icon,
        color: child.color,
      }))

    // 累加一级分类的值 = 一级分类本身 + 所有二级子分类
    const totalActual = minor(item.actual + children.reduce((sum, child) => sum + child.actual, 0))
    const totalPredicted = minor(item.predicted + children.reduce((sum, child) => sum + child.predicted, 0))

    return {
      categoryName: item.categoryName,
      categoryId: item.categoryId,
      parentId: item.parentId,
      level: item.level,
      amount: minor(totalActual + totalPredicted),
      actual: totalActual,
      predicted: totalPredicted,
      type: item.type,
      direction: item.direction,
      icon: item.icon,
      color: item.color,
      children: children.length > 0 ? children : undefined,
    }
  })

  return {
    inflow: { actual: actual.inflow, predicted: predicted.inflow },
    outflow: { actual: actual.outflow, predicted: predicted.outflow },
    // outflow 已是负数，net = inflow + outflow 直接相加
    net: { actual: minor(actual.inflow + actual.outflow), predicted: minor(predicted.inflow + predicted.outflow) },
    items: treeItems,
  }
}

function addToMap(map: Map<string, Minor>, key: string, value: Minor) {
  map.set(key, minor((map.get(key) ?? 0) + value))
}

function mapValue(map: Map<string, Minor>, key: string): Minor {
  return map.get(key) ?? minor(0)
}

/**
 * 合并 actual + predicted 聚合结果，生成 4 类活动 + 现金流汇总 + 按账户流。
 */
export function buildStatement(actual: AggregatedFlows, predicted: AggregatedFlows): {
  byActivity: CashFlowResult['byActivity']
  cashInflow: ReportValue
  cashOutflow: ReportValue
  netCashFlow: ReportValue
  flowByAccount: Record<string, { inflow: ReportValue; outflow: ReportValue }>
} {
  const sumBucket = (flows: AggregatedFlows, field: 'inflow' | 'outflow') => minor(
    flows.operating[field] + flows.investing[field] + flows.financing[field] + flows.uncategorized[field],
  )

  const actualCashInflow = sumBucket(actual, 'inflow')
  const actualCashOutflow = sumBucket(actual, 'outflow')
  // outflow 已是负数，net = inflow + outflow 直接相加
  const actualNetCashFlow = minor(actualCashInflow + actualCashOutflow)

  const predictedCashInflow = sumBucket(predicted, 'inflow')
  const predictedCashOutflow = sumBucket(predicted, 'outflow')
  const predictedNetCashFlow = minor(predictedCashInflow + predictedCashOutflow)

  // 合并按账户的流入流出（actual + predicted 同账户聚合；只有 predicted 的账户 actual 也补 0）
  const flowByAccount: Record<string, { inflow: ReportValue; outflow: ReportValue }> = {}
  for (const [name, flow] of Object.entries(actual.flowByAccount)) {
    const pred = predicted.flowByAccount[name] ?? { inflow: minor(0), outflow: minor(0) }
    flowByAccount[name] = {
      inflow: { actual: flow.inflow, predicted: pred.inflow },
      outflow: { actual: flow.outflow, predicted: pred.outflow },
    }
  }
  for (const [name, flow] of Object.entries(predicted.flowByAccount)) {
    if (!flowByAccount[name]) {
      flowByAccount[name] = {
        inflow: { actual: minor(0), predicted: flow.inflow },
        outflow: { actual: minor(0), predicted: flow.outflow },
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
    flowByAccount,
  }
}

export function buildSankey(args: {
  transactions: TransactionWithIncludes[]
  predictions: PredictionTransaction[]
  cashAccountIds: string[]
  categoryMap: Map<string, CategoryInfo>
  accountMap: Map<string, AccountInfo>
  start: Date
  end: Date
}): {
  nodes: SankeyNode[]
  links: CashFlowResult['sankey']['links']
} {
  const { transactions, predictions, cashAccountIds, categoryMap, accountMap, start, end } = args

  type ActualPredicted<T> = { actual: T; predicted: T }
  const ap = <T>(a: T, b: T): ActualPredicted<T> => ({ actual: a, predicted: b })

  const incomeCategoryNodes = ap(new Map<string, Minor>(), new Map<string, Minor>())
  const nonCashSourceNodes = ap(new Map<string, Minor>(), new Map<string, Minor>())
  const expenseCategoryNodes = ap(new Map<string, Minor>(), new Map<string, Minor>())
  const nonCashTargetNodes = ap(new Map<string, Minor>(), new Map<string, Minor>())
  const cashAccountFlows = ap(new Map<string, Minor>(), new Map<string, Minor>())
  const sourceToCashLinks = ap(new Map<string, Map<string, Minor>>(), new Map<string, Map<string, Minor>>())
  const cashToTargetLinks = ap(new Map<string, Map<string, Minor>>(), new Map<string, Map<string, Minor>>())

  const processTransaction = (
    type: string,
    isFromCash: boolean,
    isToCash: boolean,
    amount: Minor,
    fee: Minor,
    coupon: Minor,
    categoryName: string | undefined,
    accountName: string | undefined,
    toAccountName: string | undefined,
    isActual: boolean
  ) => {
    const incomeCategoryNodes_ = isActual ? incomeCategoryNodes.actual : incomeCategoryNodes.predicted
    const nonCashSourceNodes_ = isActual ? nonCashSourceNodes.actual : nonCashSourceNodes.predicted
    const expenseCategoryNodes_ = isActual ? expenseCategoryNodes.actual : expenseCategoryNodes.predicted
    const nonCashTargetNodes_ = isActual ? nonCashTargetNodes.actual : nonCashTargetNodes.predicted
    const cashAccountFlows_ = isActual ? cashAccountFlows.actual : cashAccountFlows.predicted
    const sourceToCashLinks_ = isActual ? sourceToCashLinks.actual : sourceToCashLinks.predicted
    const cashToTargetLinks_ = isActual ? cashToTargetLinks.actual : cashToTargetLinks.predicted

    if (type === 'income' && isFromCash) {
      const catName = categoryName || '其他收入'
      const cashName = accountName || '现金账户'
      addToMap(incomeCategoryNodes_, catName, amount)
      addToMap(cashAccountFlows_, cashName, amount)
      if (!sourceToCashLinks_.has(catName)) sourceToCashLinks_.set(catName, new Map())
      addToMap(sourceToCashLinks_.get(catName)!, cashName, amount)
    } else if (type === 'expense' && isFromCash) {
      const catName = categoryName || '其他支出'
      const cashName = accountName || '现金账户'
      addToMap(expenseCategoryNodes_, catName, amount)
      addToMap(cashAccountFlows_, cashName, amount)
      if (!cashToTargetLinks_.has(cashName)) cashToTargetLinks_.set(cashName, new Map())
      addToMap(cashToTargetLinks_.get(cashName)!, catName, amount)
    } else if (type === 'transfer') {
      if (!isFromCash && isToCash && toAccountName) {
        // 非现金转入现金：节点名改为"分类-账户"形式
        const catName = categoryName || '转账转入'
        const accName = accountName || '非现金账户'
        const fromName = `${catName}-${accName}`
        const toCashName = toAccountName
        const actualInflow = amount
        addToMap(nonCashSourceNodes_, fromName, actualInflow)
        addToMap(cashAccountFlows_, toCashName, actualInflow)
        if (!sourceToCashLinks_.has(fromName)) sourceToCashLinks_.set(fromName, new Map())
        addToMap(sourceToCashLinks_.get(fromName)!, toCashName, actualInflow)
      } else if (isFromCash && !isToCash && accountName) {
        // 现金转出非现金：节点名改为"分类-账户"形式
        const catName = categoryName || '转账转出'
        const accName = toAccountName || '非现金账户'
        const fromCashName = accountName
        const toName = `${catName}-${accName}`
        const actualOutflow = minor(Math.abs(transferOutflow(amount, fee, coupon)))
        addToMap(nonCashTargetNodes_, toName, actualOutflow)
        addToMap(cashAccountFlows_, fromCashName, actualOutflow)
        if (!cashToTargetLinks_.has(fromCashName)) cashToTargetLinks_.set(fromCashName, new Map())
        addToMap(cashToTargetLinks_.get(fromCashName)!, toName, actualOutflow)
      }
    } else if (type === 'refund' && isFromCash) {
      const catName = categoryName || '退款'
      const cashName = accountName || '现金账户'
      const actualInflow = amount
      addToMap(incomeCategoryNodes_, catName, actualInflow)
      addToMap(cashAccountFlows_, cashName, actualInflow)
      if (!sourceToCashLinks_.has(catName)) sourceToCashLinks_.set(catName, new Map())
      addToMap(sourceToCashLinks_.get(catName)!, cashName, actualInflow)
    }
  }

  transactions.forEach(t => {
    const { isFromCash, isToCash } = getCashFlags(t.accountId, t.toAccountId, cashAccountIds)
    processTransaction(
      t.type,
      isFromCash,
      isToCash,
      minor(Number(t.amount)),
      minor(Number(t.fee ?? 0)),
      minor(Number(t.coupon ?? 0)),
      t.category?.name || '未分类',
      t.account?.name,
      t.toAccount?.name,
      true
    )
  })

  predictions.forEach(p => {
    // 同样按 [start, end] 过滤，避免跨月时累计
    const t = p.date.getTime()
    if (t < start.getTime() || t > end.getTime()) return
    const { isFromCash, isToCash } = getCashFlags(p.accountId, p.toAccountId, cashAccountIds)
    if (!isFromCash && !isToCash) return
    const category = p.categoryId ? categoryMap.get(p.categoryId) : null
    const account = accountMap.get(p.accountId)
    const toAccount = p.toAccountId ? accountMap.get(p.toAccountId) : null
    processTransaction(
      p.type,
      isFromCash,
      isToCash,
      minor(p.amount),
      minor(0),
      minor(0),
      category?.name,
      account?.name,
      toAccount?.name,
      false
    )
  })

  const mergeNodes = (actual: Map<string, Minor>, predicted: Map<string, Minor>): Set<string> => {
    const result = new Set<string>()
    actual.forEach((_, key) => result.add(key))
    predicted.forEach((_, key) => result.add(key))
    return result
  }

  const allIncomeCategoryNodes = mergeNodes(incomeCategoryNodes.actual, incomeCategoryNodes.predicted)
  const allNonCashSourceNodes = mergeNodes(nonCashSourceNodes.actual, nonCashSourceNodes.predicted)
  const allExpenseCategoryNodes = mergeNodes(expenseCategoryNodes.actual, expenseCategoryNodes.predicted)
  const allNonCashTargetNodes = mergeNodes(nonCashTargetNodes.actual, nonCashTargetNodes.predicted)
  const allCashAccountFlows = mergeNodes(cashAccountFlows.actual, cashAccountFlows.predicted)

  const sankeyNodes: SankeyNode[] = []
  const nodeNameMap: Map<string, string> = new Map()

  const sortedNodeNames = (nodeSet: Set<string>, actualMap: Map<string, Minor>, predictedMap: Map<string, Minor>) => {
    return Array.from(nodeSet).sort((a, b) =>
      (mapValue(predictedMap, b) + mapValue(actualMap, b)) - (mapValue(predictedMap, a) + mapValue(actualMap, a)),
    )
  }

  for (const name of sortedNodeNames(allNonCashSourceNodes, nonCashSourceNodes.actual, nonCashSourceNodes.predicted)) {
    const uniqueName = `${name}_ncs`
    nodeNameMap.set(`ncs_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'non_cash_source' })
  }
  for (const name of sortedNodeNames(allIncomeCategoryNodes, incomeCategoryNodes.actual, incomeCategoryNodes.predicted)) {
    const uniqueName = `${name}_income`
    nodeNameMap.set(`income_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'income_category' })
  }
  for (const name of sortedNodeNames(allCashAccountFlows, cashAccountFlows.actual, cashAccountFlows.predicted)) {
    const uniqueName = `${name}_cash`
    nodeNameMap.set(`cash_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'cash' })
  }
  for (const name of sortedNodeNames(allNonCashTargetNodes, nonCashTargetNodes.actual, nonCashTargetNodes.predicted)) {
    const uniqueName = `${name}_nct`
    nodeNameMap.set(`nct_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'non_cash_target' })
  }
  for (const name of sortedNodeNames(allExpenseCategoryNodes, expenseCategoryNodes.actual, expenseCategoryNodes.predicted)) {
    const uniqueName = `${name}_expense`
    nodeNameMap.set(`expense_${name}`, uniqueName)
    sankeyNodes.push({ name: uniqueName, category: 'expense_category' })
  }

  const sankeyLinks: CashFlowResult['sankey']['links'] = []

  const mergeLinks = (
    actualLinks: Map<string, Map<string, Minor>>,
    predictedLinks: Map<string, Map<string, Minor>>,
    isSourceToCash: boolean
  ) => {
    const allSources = new Set<string>()
    actualLinks.forEach((_, source) => allSources.add(source))
    predictedLinks.forEach((_, source) => allSources.add(source))

    for (const sourceName of allSources) {
      const actualTargets = actualLinks.get(sourceName) || new Map<string, Minor>()
      const predictedTargets = predictedLinks.get(sourceName) || new Map<string, Minor>()
      const allTargets = new Set<string>()
      actualTargets.forEach((_, target) => allTargets.add(target))
      predictedTargets.forEach((_, target) => allTargets.add(target))

      for (const targetName of allTargets) {
        const actualAmount = mapValue(actualTargets, targetName)
        const predictedAmount = mapValue(predictedTargets, targetName)
        const totalAmount = minor(actualAmount + predictedAmount)

        if (totalAmount > 0) {
          const sourceKey = isSourceToCash
            ? (incomeCategoryNodes.actual.has(sourceName) || incomeCategoryNodes.predicted.has(sourceName) ? `income_${sourceName}` : `ncs_${sourceName}`)
            : `cash_${sourceName}`
          const targetKey = isSourceToCash
            ? `cash_${targetName}`
            : (expenseCategoryNodes.actual.has(targetName) || expenseCategoryNodes.predicted.has(targetName) ? `expense_${targetName}` : `nct_${targetName}`)

          sankeyLinks.push({
            source: nodeNameMap.get(sourceKey) || sourceName,
            target: nodeNameMap.get(targetKey) || targetName,
            value: totalAmount,
            actualValue: actualAmount > 0 ? actualAmount : undefined,
            predictedValue: predictedAmount > 0 ? predictedAmount : undefined,
          })
        }
      }
    }
  }

  mergeLinks(sourceToCashLinks.actual, sourceToCashLinks.predicted, true)
  mergeLinks(cashToTargetLinks.actual, cashToTargetLinks.predicted, false)

  return { nodes: sankeyNodes, links: sankeyLinks }
}
