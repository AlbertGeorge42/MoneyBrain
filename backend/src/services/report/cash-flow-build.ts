import { Decimal } from '@prisma/client/runtime/library.js'
import { buildChildrenMap } from '../../common/tree.js'
import { toDecimal, ZERO } from '../../common/index.js'
import { calculateCashFlowAmount, calculateCashTransferInAmount } from './cash-flow-aggregate.js'
import { getCashFlags } from './report.utils.js'
import {
  AccountInfo,
  AggregatedFlows,
  CashFlowActivity,
  CashFlowActivityDecimal,
  CashFlowActivityItem,
  CashFlowResult,
  CategoryInfo,
  PredictionTransaction,
  ReportValue,
  TransactionWithIncludes,
} from './cash-flow-types.js'

// 桑基图节点类型（与 shared CashFlowReportData.sankey.nodes 对齐）
type SankeyNode = CashFlowResult['sankey']['nodes'][number]

function toActivityResult(actual: CashFlowActivityDecimal, predicted: CashFlowActivityDecimal): CashFlowActivity {
  // 合并实际和预测的 items
  const itemMap = new Map<string, { categoryId: string | null; parentId: string | null; level: number; categoryName: string; actual: number; predicted: number; type: string; direction: string; icon?: string | null; color?: string | null }>()

  for (const item of actual.items) {
    const key = `${item.categoryName}|${item.type}|${item.direction}`
    itemMap.set(key, {
      categoryId: item.categoryId,
      parentId: item.parentId,
      level: item.level,
      categoryName: item.categoryName,
      actual: item.amount,
      predicted: 0,
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
        actual: 0,
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
        amount: child.actual + child.predicted,
        actual: child.actual,
        predicted: child.predicted,
        type: child.type,
        direction: child.direction,
        icon: child.icon,
        color: child.color,
      }))

    // 累加一级分类的值 = 一级分类本身 + 所有二级子分类
    const totalActual = item.actual + children.reduce((sum, child) => sum + child.actual, 0)
    const totalPredicted = item.predicted + children.reduce((sum, child) => sum + child.predicted, 0)

    return {
      categoryName: item.categoryName,
      categoryId: item.categoryId,
      parentId: item.parentId,
      level: item.level,
      amount: totalActual + totalPredicted,
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
    inflow: { actual: actual.inflow.toNumber(), predicted: predicted.inflow.toNumber() },
    outflow: { actual: actual.outflow.toNumber(), predicted: predicted.outflow.toNumber() },
    // outflow 已是负数，net = inflow + outflow 直接相加
    net: { actual: actual.inflow.plus(actual.outflow).toNumber(), predicted: predicted.inflow.plus(predicted.outflow).toNumber() },
    items: treeItems,
  }
}

function addToMap(map: Map<string, Decimal>, key: string, value: Decimal) {
  map.set(key, (map.get(key) || ZERO).plus(value))
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
  const actualCashInflow = actual.operating.inflow.plus(actual.investing.inflow).plus(actual.financing.inflow).plus(actual.uncategorized.inflow)
  const actualCashOutflow = actual.operating.outflow.plus(actual.investing.outflow).plus(actual.financing.outflow).plus(actual.uncategorized.outflow)
  // outflow 已是负数，net = inflow + outflow 直接相加
  const actualNetCashFlow = actualCashInflow.plus(actualCashOutflow)

  const predictedCashInflow = predicted.operating.inflow.plus(predicted.investing.inflow).plus(predicted.financing.inflow).plus(predicted.uncategorized.inflow)
  const predictedCashOutflow = predicted.operating.outflow.plus(predicted.investing.outflow).plus(predicted.financing.outflow).plus(predicted.uncategorized.outflow)
  const predictedNetCashFlow = predictedCashInflow.plus(predictedCashOutflow)

  // 合并按账户的流入流出（actual + predicted 同账户聚合；只有 predicted 的账户 actual 也补 0）
  const flowByAccount: Record<string, { inflow: ReportValue; outflow: ReportValue }> = {}
  for (const [name, flow] of Object.entries(actual.flowByAccount)) {
    const pred = predicted.flowByAccount[name] || { inflow: ZERO, outflow: ZERO }
    flowByAccount[name] = {
      inflow: { actual: flow.inflow.toNumber(), predicted: pred.inflow.toNumber() },
      outflow: { actual: flow.outflow.toNumber(), predicted: pred.outflow.toNumber() },
    }
  }
  for (const [name, flow] of Object.entries(predicted.flowByAccount)) {
    if (!flowByAccount[name]) {
      flowByAccount[name] = {
        inflow: { actual: 0, predicted: flow.inflow.toNumber() },
        outflow: { actual: 0, predicted: flow.outflow.toNumber() },
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
    cashInflow: { actual: actualCashInflow.toNumber(), predicted: predictedCashInflow.toNumber() },
    cashOutflow: { actual: actualCashOutflow.toNumber(), predicted: predictedCashOutflow.toNumber() },
    netCashFlow: { actual: actualNetCashFlow.toNumber(), predicted: predictedNetCashFlow.toNumber() },
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
  links: Array<{ source: string; target: string; value: number; actualValue?: number; predictedValue?: number }>
} {
  const { transactions, predictions, cashAccountIds, categoryMap, accountMap, start, end } = args

  type ActualPredicted<T> = { actual: T; predicted: T }
  const ap = <T>(a: T, b: T): ActualPredicted<T> => ({ actual: a, predicted: b })

  const incomeCategoryNodes: ActualPredicted<Map<string, Decimal>> = ap(new Map(), new Map())
  const nonCashSourceNodes: ActualPredicted<Map<string, Decimal>> = ap(new Map(), new Map())
  const expenseCategoryNodes: ActualPredicted<Map<string, Decimal>> = ap(new Map(), new Map())
  const nonCashTargetNodes: ActualPredicted<Map<string, Decimal>> = ap(new Map(), new Map())
  const cashAccountFlows: ActualPredicted<Map<string, Decimal>> = ap(new Map(), new Map())
  const sourceToCashLinks: ActualPredicted<Map<string, Map<string, Decimal>>> = ap(new Map(), new Map())
  const cashToTargetLinks: ActualPredicted<Map<string, Map<string, Decimal>>> = ap(new Map(), new Map())

  const processTransaction = (
    type: string,
    isFromCash: boolean,
    isToCash: boolean,
    amount: Decimal,
    fee: Decimal,
    coupon: Decimal,
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
        const actualInflow = calculateCashTransferInAmount(amount, fee, coupon)
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
        const actualOutflow = calculateCashFlowAmount('transfer', amount, fee, coupon).abs()
        addToMap(nonCashTargetNodes_, toName, actualOutflow)
        addToMap(cashAccountFlows_, fromCashName, actualOutflow)
        if (!cashToTargetLinks_.has(fromCashName)) cashToTargetLinks_.set(fromCashName, new Map())
        addToMap(cashToTargetLinks_.get(fromCashName)!, toName, actualOutflow)
      }
    } else if (type === 'refund' && isFromCash) {
      const catName = categoryName || '退款'
      const cashName = accountName || '现金账户'
      const actualInflow = calculateCashFlowAmount('refund', amount, fee, ZERO)
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
      t.amount,
      toDecimal(t.fee),
      toDecimal(t.coupon),
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
      toDecimal(p.amount),
      ZERO,
      ZERO,
      category?.name,
      account?.name,
      toAccount?.name,
      false
    )
  })

  const mergeNodes = (actual: Map<string, Decimal>, predicted: Map<string, Decimal>): Set<string> => {
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

  const sortedNodeNames = (nodeSet: Set<string>, actualMap: Map<string, Decimal>, predictedMap: Map<string, Decimal>) => {
    return Array.from(nodeSet).sort((a, b) => {
      const aVal = (actualMap.get(a) || ZERO).plus(predictedMap.get(a) || ZERO)
      const bVal = (actualMap.get(b) || ZERO).plus(predictedMap.get(b) || ZERO)
      return bVal.minus(aVal).toNumber()
    })
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

  const sankeyLinks: Array<{ source: string; target: string; value: number; actualValue?: number; predictedValue?: number }> = []

  const mergeLinks = (
    actualLinks: Map<string, Map<string, Decimal>>,
    predictedLinks: Map<string, Map<string, Decimal>>,
    isSourceToCash: boolean
  ) => {
    const allSources = new Set<string>()
    actualLinks.forEach((_, source) => allSources.add(source))
    predictedLinks.forEach((_, source) => allSources.add(source))

    for (const sourceName of allSources) {
      const actualTargets = actualLinks.get(sourceName) || new Map()
      const predictedTargets = predictedLinks.get(sourceName) || new Map()
      const allTargets = new Set<string>()
      actualTargets.forEach((_, target) => allTargets.add(target))
      predictedTargets.forEach((_, target) => allTargets.add(target))

      for (const targetName of allTargets) {
        const actualAmount = actualTargets.get(targetName) || ZERO
        const predictedAmount = predictedTargets.get(targetName) || ZERO
        const totalAmount = actualAmount.plus(predictedAmount)

        if (totalAmount.greaterThan(ZERO)) {
          const sourceKey = isSourceToCash
            ? (incomeCategoryNodes.actual.has(sourceName) || incomeCategoryNodes.predicted.has(sourceName) ? `income_${sourceName}` : `ncs_${sourceName}`)
            : `cash_${sourceName}`
          const targetKey = isSourceToCash
            ? `cash_${targetName}`
            : (expenseCategoryNodes.actual.has(targetName) || expenseCategoryNodes.predicted.has(targetName) ? `expense_${targetName}` : `nct_${targetName}`)

          sankeyLinks.push({
            source: nodeNameMap.get(sourceKey) || sourceName,
            target: nodeNameMap.get(targetKey) || targetName,
            value: totalAmount.toNumber(),
            actualValue: actualAmount.greaterThan(ZERO) ? actualAmount.toNumber() : undefined,
            predictedValue: predictedAmount.greaterThan(ZERO) ? predictedAmount.toNumber() : undefined,
          })
        }
      }
    }
  }

  mergeLinks(sourceToCashLinks.actual, sourceToCashLinks.predicted, true)
  mergeLinks(cashToTargetLinks.actual, cashToTargetLinks.predicted, false)

  return { nodes: sankeyNodes, links: sankeyLinks }
}
