import { rulesFor } from '../../ledger/rules.js'
import { ZERO_MINOR, abs, add, type Minor } from '../../money.js'
import type { SankeyLink, SankeyNode, SankeyResult, SankeySourceTransaction } from './types.js'

function addToMap(map: Map<string, Minor>, key: string, value: Minor) {
  map.set(key, add(map.get(key) ?? ZERO_MINOR, value))
}

function mapValue(map: Map<string, Minor>, key: string): Minor {
  return map.get(key) ?? ZERO_MINOR
}

type ActualPredicted<T> = { actual: T; predicted: T }
const ap = <T>(a: T, b: T): ActualPredicted<T> => ({ actual: a, predicted: b })

/**
 * 构造现金流量表的桑基图节点与链路。
 *
 * 入参是 API 已映射好的领域交易（含 isActual / 现金集合判定 / 名称兜底），
 * 不再是 Prisma payload。三条链路对「现金→现金内部划转」的既有分叉保持原样：
 * 本金画成账户间链路、有效手续费单列到「手续费」支出节点。
 */
export function buildSankey(sources: readonly SankeySourceTransaction[]): SankeyResult {
  const incomeCategoryNodes = ap(new Map<string, Minor>(), new Map<string, Minor>())
  const nonCashSourceNodes = ap(new Map<string, Minor>(), new Map<string, Minor>())
  const expenseCategoryNodes = ap(new Map<string, Minor>(), new Map<string, Minor>())
  const nonCashTargetNodes = ap(new Map<string, Minor>(), new Map<string, Minor>())
  const cashAccountFlows = ap(new Map<string, Minor>(), new Map<string, Minor>())
  const sourceToCashLinks = ap(new Map<string, Map<string, Minor>>(), new Map<string, Map<string, Minor>>())
  const cashToTargetLinks = ap(new Map<string, Map<string, Minor>>(), new Map<string, Map<string, Minor>>())
  const cashToCashLinks = ap(new Map<string, Map<string, Minor>>(), new Map<string, Map<string, Minor>>())

  for (const tx of sources) {
    const incomeCategoryNodes_ = tx.isActual ? incomeCategoryNodes.actual : incomeCategoryNodes.predicted
    const nonCashSourceNodes_ = tx.isActual ? nonCashSourceNodes.actual : nonCashSourceNodes.predicted
    const expenseCategoryNodes_ = tx.isActual ? expenseCategoryNodes.actual : expenseCategoryNodes.predicted
    const nonCashTargetNodes_ = tx.isActual ? nonCashTargetNodes.actual : nonCashTargetNodes.predicted
    const cashAccountFlows_ = tx.isActual ? cashAccountFlows.actual : cashAccountFlows.predicted
    const sourceToCashLinks_ = tx.isActual ? sourceToCashLinks.actual : sourceToCashLinks.predicted
    const cashToTargetLinks_ = tx.isActual ? cashToTargetLinks.actual : cashToTargetLinks.predicted
    const cashToCashLinks_ = tx.isActual ? cashToCashLinks.actual : cashToCashLinks.predicted

    const { type, isFromCash, isToCash, amount, fee, coupon, ruleVersion, categoryName, accountName, toAccountName, relatedType } = tx

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
        const catName = categoryName || '转账转入'
        const accName = accountName || '非现金账户'
        const fromName = `${catName}-${accName}`
        const toCashName = toAccountName
        const actualInflow = rulesFor(ruleVersion).transferInflow(amount)
        addToMap(nonCashSourceNodes_, fromName, actualInflow)
        addToMap(cashAccountFlows_, toCashName, actualInflow)
        if (!sourceToCashLinks_.has(fromName)) sourceToCashLinks_.set(fromName, new Map())
        addToMap(sourceToCashLinks_.get(fromName)!, toCashName, actualInflow)
      } else if (isFromCash && !isToCash && accountName) {
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
      const offset = rulesFor(ruleVersion).refundOffsetKind(relatedType)
      const catName = categoryName || '退款'
      const cashName = accountName || '现金账户'
      if (offset === 'expense') {
        addToMap(incomeCategoryNodes_, catName, amount)
        addToMap(cashAccountFlows_, cashName, amount)
        if (!sourceToCashLinks_.has(catName)) sourceToCashLinks_.set(catName, new Map())
        addToMap(sourceToCashLinks_.get(catName)!, cashName, amount)
      } else if (offset === 'income') {
        addToMap(expenseCategoryNodes_, catName, amount)
        addToMap(cashAccountFlows_, cashName, amount)
        if (!cashToTargetLinks_.has(cashName)) cashToTargetLinks_.set(cashName, new Map())
        addToMap(cashToTargetLinks_.get(cashName)!, catName, amount)
      }
    }
  }

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

  // 排序权重是普通数值计算（只用于 Array.sort，不写回金额字段），保留原生算术
  const sortedNodeNames = (nodeSet: Set<string>, actualMap: Map<string, Minor>, predictedMap: Map<string, Minor>) =>
    Array.from(nodeSet).sort((a, b) =>
      (mapValue(predictedMap, b) + mapValue(actualMap, b)) - (mapValue(predictedMap, a) + mapValue(actualMap, a)))

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

  const sankeyLinks: SankeyLink[] = []

  const mergeLinks = (
    actualLinks: Map<string, Map<string, Minor>>,
    predictedLinks: Map<string, Map<string, Minor>>,
    mode: 'source-to-cash' | 'cash-to-target' | 'cash-to-cash',
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

          const link: SankeyLink = {
            source: nodeNameMap.get(sourceKey) || sourceName,
            target: nodeNameMap.get(targetKey) || targetName,
            value: totalAmount,
          }
          if (actualAmount > 0) link.actualValue = actualAmount
          if (predictedAmount > 0) link.predictedValue = predictedAmount
          sankeyLinks.push(link)
        }
      }
    }
  }

  mergeLinks(sourceToCashLinks.actual, sourceToCashLinks.predicted, 'source-to-cash')
  mergeLinks(cashToTargetLinks.actual, cashToTargetLinks.predicted, 'cash-to-target')
  mergeLinks(cashToCashLinks.actual, cashToCashLinks.predicted, 'cash-to-cash')

  return { nodes: sankeyNodes, links: sankeyLinks }
}
