import { CURRENT_RULE_VERSION, add, abs, rulesFor, sum, sub, neg, ZERO_MINOR, type Minor } from '../../../../../packages/domain/src/index.js'
import { toMinor } from '../../common/index.js'
import { buildChildrenMap } from '../../common/tree.js'
import {
  AccountInfo,
  AggregatedFlows,
  CashFlowActivity,
  CashFlowActivityMinor,
  CashFlowActivityItem,
  CashFlowResult,
  CategoryInfo,
  PredictionTransaction,
  TransactionWithIncludes,
} from './cash-flow-types.js'
import type {
  ProjectionCashActivity,
  ProjectionCashActivityItem,
  ProjectionCashByActivity,
  ProjectionFlowValue,
  ReportValue,
} from '../../../../../packages/contracts/types/index.js'

type ActivityKey = 'operating' | 'investing' | 'financing' | 'uncategorized'

function itemKeyOf(item: CashFlowActivityMinor['items'][number]): string {
  return `${item.categoryName}|${item.type}|${item.direction}`
}

export function projectionFlowValue(actual: Minor, planned: Minor, committed: Minor): ProjectionFlowValue {
  return { actual, planned, committed, total: sum([actual, planned, committed]) }
}

/**
 * 合并三来源的活动明细。
 *
 * - 活动级 inflow / outflow 用正数（与现金流推演点位同口径）；
 * - item 的 amount / actual / committed 保留既有符号约定（流入为正、流出为负），
 *   planned 为 null 表示该分类没有任何预算来源。
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
    const addSource = (
      source: 'actual' | 'committed' | 'planned',
      items: CashFlowActivityMinor['items'],
    ) => {
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
    const childrenMap = buildChildrenMap(
      merged.filter((item) => item.parentId).map((item) => ({ ...item, id: item.categoryId ?? '' })),
    )

    return level1.map((item) => {
      const children = (childrenMap.get(item.categoryId) ?? []).map((child) => ({
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

      return {
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
        children: children.length > 0 ? children : undefined,
      }
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



// 桑基图节点类型（与 shared CashFlowReportData.sankey.nodes 对齐）
type SankeyNode = CashFlowResult['sankey']['nodes'][number]

function toActivityResult(actual: CashFlowActivityMinor, predicted: CashFlowActivityMinor): CashFlowActivity {
  // 合并实际和预测的 items
  const itemMap = new Map<string, { categoryId: string | null; parentId: string | null; level: number; categoryName: string; actual: Minor; predicted: Minor; type: string; direction: string }>()

  for (const item of actual.items) {
    const key = itemKeyOf(item)
    itemMap.set(key, {
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
        amount: sum([child.actual, child.predicted]),
        actual: child.actual,
        predicted: child.predicted,
        type: child.type,
        direction: child.direction,
      }))

    // 累加一级分类的值 = 一级分类本身 + 所有二级子分类
    const totalActual = sum([item.actual, ...children.map((child) => child.actual)])
    const totalPredicted = sum([item.predicted, ...children.map((child) => child.predicted)])

    return {
      categoryName: item.categoryName,
      categoryId: item.categoryId,
      parentId: item.parentId,
      level: item.level,
      amount: sum([totalActual, totalPredicted]),
      actual: totalActual,
      predicted: totalPredicted,
      type: item.type,
      direction: item.direction,
      children: children.length > 0 ? children : undefined,
    }
  })

  return {
    inflow: { actual: actual.inflow, predicted: predicted.inflow },
    outflow: { actual: actual.outflow, predicted: predicted.outflow },
    // outflow 已是负数，net = inflow + outflow 直接相加
    net: { actual: add(actual.inflow, actual.outflow), predicted: add(predicted.inflow, predicted.outflow) },
    items: treeItems,
  }
}

function addToMap(map: Map<string, Minor>, key: string, value: Minor) {
  map.set(key, add(map.get(key) ?? ZERO_MINOR, value))
}

function mapValue(map: Map<string, Minor>, key: string): Minor {
  return map.get(key) ?? ZERO_MINOR
}

/**
 * 合并 actual + predicted 聚合结果，生成 4 类活动 + 现金流汇总 + 按账户流。
 */
export function buildStatement(actual: AggregatedFlows, predicted: AggregatedFlows): {
  byActivity: CashFlowResult['byActivity']
  cashInflow: ReportValue
  cashOutflow: ReportValue
  netCashFlow: ReportValue
  reconciliation: ReportValue
  flowByAccount: Record<string, { inflow: ReportValue; outflow: ReportValue }>
} {
  const sumBucket = (flows: AggregatedFlows, field: 'inflow' | 'outflow') => sum([
    flows.operating[field],
    flows.investing[field],
    flows.financing[field],
    flows.uncategorized[field],
  ])

  const actualCashInflow = sumBucket(actual, 'inflow')
  const actualCashOutflow = sumBucket(actual, 'outflow')
  // outflow 已是负数，net = inflow + outflow 直接相加
  const actualNetCashFlow = add(actualCashInflow, actualCashOutflow)

  const predictedCashInflow = sumBucket(predicted, 'inflow')
  const predictedCashOutflow = sumBucket(predicted, 'outflow')
  const predictedNetCashFlow = add(predictedCashInflow, predictedCashOutflow)

  // 合并按账户的流入流出（actual + predicted 同账户聚合；只有 predicted 的账户 actual 也补 0）
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
  const cashToCashLinks = ap(new Map<string, Map<string, Minor>>(), new Map<string, Map<string, Minor>>())

  const processTransaction = (
    type: string,
    isFromCash: boolean,
    isToCash: boolean,
    amount: Minor,
    fee: Minor,
    coupon: Minor,
    ruleVersion: number,
    categoryName: string | undefined,
    accountName: string | undefined,
    toAccountName: string | undefined,
    relatedType: string | null,
    isActual: boolean
  ) => {
    const incomeCategoryNodes_ = isActual ? incomeCategoryNodes.actual : incomeCategoryNodes.predicted
    const nonCashSourceNodes_ = isActual ? nonCashSourceNodes.actual : nonCashSourceNodes.predicted
    const expenseCategoryNodes_ = isActual ? expenseCategoryNodes.actual : expenseCategoryNodes.predicted
    const nonCashTargetNodes_ = isActual ? nonCashTargetNodes.actual : nonCashTargetNodes.predicted
    const cashAccountFlows_ = isActual ? cashAccountFlows.actual : cashAccountFlows.predicted
    const sourceToCashLinks_ = isActual ? sourceToCashLinks.actual : sourceToCashLinks.predicted
    const cashToTargetLinks_ = isActual ? cashToTargetLinks.actual : cashToTargetLinks.predicted
    const cashToCashLinks_ = isActual ? cashToCashLinks.actual : cashToCashLinks.predicted

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
        // 转账转入的现金只经领域层规则取值（与转出侧 transferOutflow 对称，A0）
        const actualInflow = rulesFor(ruleVersion).transferInflow(amount)
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
        const actualOutflow = abs(rulesFor(ruleVersion).transferOutflow(amount, fee, coupon))
        addToMap(nonCashTargetNodes_, toName, actualOutflow)
        addToMap(cashAccountFlows_, fromCashName, actualOutflow)
        if (!cashToTargetLinks_.has(fromCashName)) cashToTargetLinks_.set(fromCashName, new Map())
        addToMap(cashToTargetLinks_.get(fromCashName)!, toName, actualOutflow)
      } else if (isFromCash && isToCash && accountName && toAccountName) {
        // 现金账户之间转账：本金从转出账户流入转入账户，账户之间的内部移动可见；
        // 手续费不随本金转移，单独挂到「手续费」节点，保持逐账户恒等式。
        const fromCashName = accountName
        const toCashName = toAccountName
        const actualInflow = rulesFor(ruleVersion).transferInflow(amount)
        const effectiveFee = rulesFor(ruleVersion).effectiveTransferFee(fee, coupon)
        addToMap(cashAccountFlows_, fromCashName, add(actualInflow, effectiveFee))
        addToMap(cashAccountFlows_, toCashName, actualInflow)
        if (!cashToCashLinks_.has(fromCashName)) cashToCashLinks_.set(fromCashName, new Map())
        addToMap(cashToCashLinks_.get(fromCashName)!, toCashName, actualInflow)
        if (effectiveFee > 0) {
          addToMap(expenseCategoryNodes_, '手续费', effectiveFee)
          if (!cashToTargetLinks_.has(fromCashName)) cashToTargetLinks_.set(fromCashName, new Map())
          addToMap(cashToTargetLinks_.get(fromCashName)!, '手续费', effectiveFee)
        }
      }
    } else if (type === 'refund' && isFromCash) {
      // 退款方向由领域层 refundOffsetKind 唯一判定（C4）：支出退款 = 钱流回账户 → 流入；
      // 收入退款 = 钱流出账户 → 流出。与 aggregate() 同一判定，不再一律按流入直取
      const offset = rulesFor(ruleVersion).refundOffsetKind(relatedType)
      const catName = categoryName || '退款'
      const cashName = accountName || '现金账户'
      if (offset === 'expense') {
        // 支出退款：退款分类 → 现金（流入侧）
        addToMap(incomeCategoryNodes_, catName, amount)
        addToMap(cashAccountFlows_, cashName, amount)
        if (!sourceToCashLinks_.has(catName)) sourceToCashLinks_.set(catName, new Map())
        addToMap(sourceToCashLinks_.get(catName)!, cashName, amount)
      } else if (offset === 'income') {
        // 收入退款：现金 → 退款分类（流出侧）
        addToMap(expenseCategoryNodes_, catName, amount)
        addToMap(cashAccountFlows_, cashName, amount)
        if (!cashToTargetLinks_.has(cashName)) cashToTargetLinks_.set(cashName, new Map())
        addToMap(cashToTargetLinks_.get(cashName)!, catName, amount)
      }
      // relatedType 无法识别时 refundOffsetKind 返回 null：不计入，与 aggregate() 一致
    }
  }

  transactions.forEach(t => {
    const isFromCash = cashAccountIds.includes(t.accountId)
    const isToCash = !!t.toAccountId && cashAccountIds.includes(t.toAccountId)
    processTransaction(
      t.type,
      isFromCash,
      isToCash,
      toMinor(t.amount),
      toMinor(t.fee),
      toMinor(t.coupon),
      t.ruleVersion,
      t.category?.name || '未分类',
      t.account?.name,
      t.toAccount?.name,
      t.relatedType,
      true
    )
  })

  predictions.forEach(p => {
    // 同样按 [start, end] 过滤，避免跨月时累计
    const t = p.date.getTime()
    if (t < start.getTime() || t > end.getTime()) return
    const isFromCash = cashAccountIds.includes(p.accountId)
    const isToCash = !!p.toAccountId && cashAccountIds.includes(p.toAccountId)
    if (!isFromCash && !isToCash) return
    const category = p.categoryId ? categoryMap.get(p.categoryId) : null
    const account = accountMap.get(p.accountId)
    const toAccount = p.toAccountId ? accountMap.get(p.toAccountId) : null
    processTransaction(
      p.type,
      isFromCash,
      isToCash,
      toMinor(p.amount),
      ZERO_MINOR,
      ZERO_MINOR,
      CURRENT_RULE_VERSION,
      category?.name,
      account?.name,
      toAccount?.name,
      null,
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
    mode: 'source-to-cash' | 'cash-to-target' | 'cash-to-cash'
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
        const totalAmount = add(actualAmount, predictedAmount)

        if (totalAmount > 0) {
          const sourceKey = mode === 'source-to-cash'
            ? (incomeCategoryNodes.actual.has(sourceName) || incomeCategoryNodes.predicted.has(sourceName) ? `income_${sourceName}` : `ncs_${sourceName}`)
            : `cash_${sourceName}`
          const targetKey = mode === 'cash-to-target'
            ? (expenseCategoryNodes.actual.has(targetName) || expenseCategoryNodes.predicted.has(targetName) ? `expense_${targetName}` : `nct_${targetName}`)
            : `cash_${targetName}`

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

  mergeLinks(sourceToCashLinks.actual, sourceToCashLinks.predicted, 'source-to-cash')
  mergeLinks(cashToTargetLinks.actual, cashToTargetLinks.predicted, 'cash-to-target')
  mergeLinks(cashToCashLinks.actual, cashToCashLinks.predicted, 'cash-to-cash')

  return { nodes: sankeyNodes, links: sankeyLinks }
}
