import { refundOffsetKind, transferInflow, transferNet, transferOutflow } from '../../ledger/rules.js'
import { ZERO_MINOR, abs, add, type Minor } from '../../money.js'
import type {
  SankeyEndpoint,
  SankeyGroupMeta,
  SankeyLink,
  SankeyNodeType,
  SankeyResult,
  SankeySide,
  SankeySourceTransaction,
} from './types.js'

function addToMap(map: Map<string, Minor>, key: string, value: Minor) {
  map.set(key, add(map.get(key) ?? ZERO_MINOR, value))
}

function mapValue(map: Map<string, Minor>, key: string): Minor {
  return map.get(key) ?? ZERO_MINOR
}

type ActualPredicted<T> = { actual: T; predicted: T }
const ap = <T>(a: T, b: T): ActualPredicted<T> => ({ actual: a, predicted: b })

interface GroupSeed {
  id: string
  name: string
}

interface EndpointMeta {
  name: string
  nodeType: SankeyNodeType
  side: SankeySide
  group: GroupSeed | null
}

const groupOf = (id: string | null | undefined, name: string | null | undefined): GroupSeed | null =>
  id && name ? { id, name } : null

/**
 * 分组身份按 endpoint 所在列隔离：左右两列的同 id 账户分类 / 交易分类不合并成一个组。
 * 中间账户列保持后端的实体 id，不额外加前缀。
 */
const columnGroupOf = (group: GroupSeed | null, side: SankeySide): GroupSeed | null =>
  group && side !== 'account' ? { id: `${side}:${group.id}`, name: group.name } : group

/**
 * 结构化 endpoint 身份规则。身份只来自实体 id；id 缺失的合成节点用固定语义位，
 * 绝不从展示名反推身份。`in:` / `out:` / `acct:` 前缀是命名空间，避免不同实体域碰撞。
 */
const categoryIdOf = (side: 'in' | 'out', id: string | null | undefined, name: string): string =>
  id ? `${side}:${id}` : `${side}:synthetic:${name}`
const accountIdOf = (id: string | null | undefined, name: string): string =>
  id ? `acct:${id}` : `acct:synthetic:${name}`
const sourceIdOf = (cat: string | null | undefined, acc: string | null | undefined, name: string): string =>
  cat && acc ? `in:ncs:${cat}:${acc}` : `in:ncs:synthetic:${name}`
const targetIdOf = (cat: string | null | undefined, acc: string | null | undefined, name: string): string =>
  cat && acc ? `out:nct:${cat}:${acc}` : `out:nct:synthetic:${name}`
const FEE_ID = 'out:synthetic:fee'
const COUPON_ID = 'in:synthetic:coupon'

/**
 * 构造现金流量表的桑基图节点与链路。
 *
 * endpoint 的身份全部由结构化 `id` 表达（`id` 来自实体 id + 桑基语义前缀），
 * 展示名 `name` 不参与身份判定，同名实体不会被合并。聚合 / 金额口径与改造前一致：
 * 三条链路对「现金→现金内部划转」的分叉保持原样——本金画成账户间链路、
 * 有效手续费单列到「手续费」支出节点。
 */
export function buildSankey(sources: readonly SankeySourceTransaction[]): SankeyResult {
  const meta = new Map<string, EndpointMeta>()
  const register = (
    id: string,
    nodeType: SankeyNodeType,
    side: SankeySide,
    name: string,
    group: GroupSeed | null,
  ) => {
    if (!meta.has(id)) meta.set(id, { name, nodeType, side, group: columnGroupOf(group, side) })
  }
  const addEndpoint = (
    map: Map<string, Minor>,
    id: string,
    nodeType: SankeyNodeType,
    side: SankeySide,
    name: string,
    group: GroupSeed | null,
    amount: Minor,
  ) => {
    register(id, nodeType, side, name, group)
    addToMap(map, id, amount)
  }

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

    const {
      type, isFromCash, isToCash, amount, fee, coupon,
      categoryName, categoryId, accountName, accountId,
      toAccountName, toAccountId, relatedType,
      categoryGroupId, categoryGroupName,
      accountGroupId, accountGroupName,
      toAccountGroupId, toAccountGroupName,
    } = tx
    const categoryGroup = groupOf(categoryGroupId, categoryGroupName)
    const accountGroup = groupOf(accountGroupId, accountGroupName)
    const toAccountGroup = groupOf(toAccountGroupId, toAccountGroupName)

    if (type === 'income' && isFromCash) {
      const name = categoryName || '其他收入'
      const cashName = accountName || '现金账户'
      const catEndpoint = categoryIdOf('in', categoryId, name)
      const cashEndpoint = accountIdOf(accountId, cashName)
      addEndpoint(incomeCategoryNodes_, catEndpoint, 'income_category', 'in', name, categoryGroup, amount)
      addEndpoint(cashAccountFlows_, cashEndpoint, 'cash', 'account', cashName, accountGroup, amount)
      if (!sourceToCashLinks_.has(catEndpoint)) sourceToCashLinks_.set(catEndpoint, new Map())
      addToMap(sourceToCashLinks_.get(catEndpoint)!, cashEndpoint, amount)
    } else if (type === 'expense' && isFromCash) {
      const name = categoryName || '其他支出'
      const cashName = accountName || '现金账户'
      const catEndpoint = categoryIdOf('out', categoryId, name)
      const cashEndpoint = accountIdOf(accountId, cashName)
      addEndpoint(expenseCategoryNodes_, catEndpoint, 'expense_category', 'out', name, categoryGroup, amount)
      addEndpoint(cashAccountFlows_, cashEndpoint, 'cash', 'account', cashName, accountGroup, amount)
      if (!cashToTargetLinks_.has(cashEndpoint)) cashToTargetLinks_.set(cashEndpoint, new Map())
      addToMap(cashToTargetLinks_.get(cashEndpoint)!, catEndpoint, amount)
    } else if (type === 'transfer') {
      if (!isFromCash && isToCash && toAccountName) {
        // 非现金来源节点：展示名只用账户名，不拼交易分类名；身份仍由 (分类,账户) 组合表达。
        const accName = accountName || '非现金账户'
        const fromEndpoint = sourceIdOf(categoryId, accountId, accName)
        const toCashEndpoint = accountIdOf(toAccountId, toAccountName)
        const actualInflow = transferInflow(amount, coupon)
        addEndpoint(nonCashSourceNodes_, fromEndpoint, 'non_cash_source', 'in', accName, accountGroup, actualInflow)
        addEndpoint(cashAccountFlows_, toCashEndpoint, 'cash', 'account', toAccountName, toAccountGroup, actualInflow)
        if (!sourceToCashLinks_.has(fromEndpoint)) sourceToCashLinks_.set(fromEndpoint, new Map())
        addToMap(sourceToCashLinks_.get(fromEndpoint)!, toCashEndpoint, actualInflow)
      } else if (isFromCash && !isToCash && accountName) {
        // 非现金去向节点：同上，展示名只用账户名。
        const accName = toAccountName || '非现金账户'
        const fromCashEndpoint = accountIdOf(accountId, accountName)
        const toEndpoint = targetIdOf(categoryId, toAccountId, accName)
        const actualOutflow = abs(transferOutflow(amount, fee))
        addEndpoint(nonCashTargetNodes_, toEndpoint, 'non_cash_target', 'out', accName, toAccountGroup, actualOutflow)
        addEndpoint(cashAccountFlows_, fromCashEndpoint, 'cash', 'account', accountName, accountGroup, actualOutflow)
        if (!cashToTargetLinks_.has(fromCashEndpoint)) cashToTargetLinks_.set(fromCashEndpoint, new Map())
        addToMap(cashToTargetLinks_.get(fromCashEndpoint)!, toEndpoint, actualOutflow)
      } else if (isFromCash && isToCash && accountName && toAccountName) {
        const fromCashEndpoint = accountIdOf(accountId, accountName)
        const toCashEndpoint = accountIdOf(toAccountId, toAccountName)
        const actualOutflow = transferOutflow(amount, fee)
        const actualInflow = transferInflow(amount, coupon)
        const net = transferNet(fee, coupon)
        addEndpoint(cashAccountFlows_, fromCashEndpoint, 'cash', 'account', accountName, accountGroup, actualOutflow)
        addEndpoint(cashAccountFlows_, toCashEndpoint, 'cash', 'account', toAccountName, toAccountGroup, actualInflow)
        if (!cashToCashLinks_.has(fromCashEndpoint)) cashToCashLinks_.set(fromCashEndpoint, new Map())
        addToMap(cashToCashLinks_.get(fromCashEndpoint)!, toCashEndpoint, amount)
        if (net < 0) {
          const feeValue = abs(net)
          addEndpoint(expenseCategoryNodes_, FEE_ID, 'expense_category', 'out', '手续费', null, feeValue)
          if (!cashToTargetLinks_.has(fromCashEndpoint)) cashToTargetLinks_.set(fromCashEndpoint, new Map())
          addToMap(cashToTargetLinks_.get(fromCashEndpoint)!, FEE_ID, feeValue)
        } else if (net > 0) {
          addEndpoint(incomeCategoryNodes_, COUPON_ID, 'income_category', 'in', '优惠券', null, net)
          if (!sourceToCashLinks_.has(COUPON_ID)) sourceToCashLinks_.set(COUPON_ID, new Map())
          addToMap(sourceToCashLinks_.get(COUPON_ID)!, toCashEndpoint, net)
        }
      }
    } else if (type === 'refund' && isFromCash) {
      const offset = refundOffsetKind(relatedType)
      const name = categoryName || '退款'
      const cashName = accountName || '现金账户'
      const cashEndpoint = accountIdOf(accountId, cashName)
      if (offset === 'expense') {
        const catEndpoint = categoryIdOf('in', categoryId, name)
        addEndpoint(incomeCategoryNodes_, catEndpoint, 'income_category', 'in', name, categoryGroup, amount)
        addEndpoint(cashAccountFlows_, cashEndpoint, 'cash', 'account', cashName, accountGroup, amount)
        if (!sourceToCashLinks_.has(catEndpoint)) sourceToCashLinks_.set(catEndpoint, new Map())
        addToMap(sourceToCashLinks_.get(catEndpoint)!, cashEndpoint, amount)
      } else if (offset === 'income') {
        const catEndpoint = categoryIdOf('out', categoryId, name)
        addEndpoint(expenseCategoryNodes_, catEndpoint, 'expense_category', 'out', name, categoryGroup, amount)
        addEndpoint(cashAccountFlows_, cashEndpoint, 'cash', 'account', cashName, accountGroup, amount)
        if (!cashToTargetLinks_.has(cashEndpoint)) cashToTargetLinks_.set(cashEndpoint, new Map())
        addToMap(cashToTargetLinks_.get(cashEndpoint)!, catEndpoint, amount)
      }
    }
  }

  const mergeNodes = (actual: Map<string, Minor>, predicted: Map<string, Minor>): Set<string> => {
    const result = new Set<string>()
    actual.forEach((_, key) => result.add(key))
    predicted.forEach((_, key) => result.add(key))
    return result
  }

  const allNonCashSourceNodes = mergeNodes(nonCashSourceNodes.actual, nonCashSourceNodes.predicted)
  const allIncomeCategoryNodes = mergeNodes(incomeCategoryNodes.actual, incomeCategoryNodes.predicted)
  const allCashAccountFlows = mergeNodes(cashAccountFlows.actual, cashAccountFlows.predicted)
  const allNonCashTargetNodes = mergeNodes(nonCashTargetNodes.actual, nonCashTargetNodes.predicted)
  const allExpenseCategoryNodes = mergeNodes(expenseCategoryNodes.actual, expenseCategoryNodes.predicted)

  // 先汇总全部 endpoint id，再按 group.id 统计组内成员数（可展开性由后端确定）。
  const allIds = [
    ...allNonCashSourceNodes, ...allIncomeCategoryNodes, ...allCashAccountFlows,
    ...allNonCashTargetNodes, ...allExpenseCategoryNodes,
  ]
  const groupSize = new Map<string, number>()
  for (const id of allIds) {
    const group = meta.get(id)?.group
    if (group) groupSize.set(group.id, (groupSize.get(group.id) ?? 0) + 1)
  }

  // 排序权重是普通数值计算（只用于 Array.sort，不写回金额字段），保留原生算术
  const sortedIds = (idSet: Set<string>, actualMap: Map<string, Minor>, predictedMap: Map<string, Minor>) =>
    Array.from(idSet).sort((a, b) =>
      (mapValue(predictedMap, b) + mapValue(actualMap, b)) - (mapValue(predictedMap, a) + mapValue(actualMap, a)))
  const endpointOf = (id: string): SankeyEndpoint => {
    const entry = meta.get(id)!
    const group: SankeyGroupMeta | null = entry.group
      ? { ...entry.group, expandable: (groupSize.get(entry.group.id) ?? 0) > 1 }
      : null
    return { id, name: entry.name, nodeType: entry.nodeType, side: entry.side, group }
  }

  const sankeyNodes: SankeyEndpoint[] = []
  for (const id of sortedIds(allNonCashSourceNodes, nonCashSourceNodes.actual, nonCashSourceNodes.predicted)) {
    sankeyNodes.push(endpointOf(id))
  }
  for (const id of sortedIds(allIncomeCategoryNodes, incomeCategoryNodes.actual, incomeCategoryNodes.predicted)) {
    sankeyNodes.push(endpointOf(id))
  }
  for (const id of sortedIds(allCashAccountFlows, cashAccountFlows.actual, cashAccountFlows.predicted)) {
    sankeyNodes.push(endpointOf(id))
  }
  for (const id of sortedIds(allNonCashTargetNodes, nonCashTargetNodes.actual, nonCashTargetNodes.predicted)) {
    sankeyNodes.push(endpointOf(id))
  }
  for (const id of sortedIds(allExpenseCategoryNodes, expenseCategoryNodes.actual, expenseCategoryNodes.predicted)) {
    sankeyNodes.push(endpointOf(id))
  }

  const sankeyLinks: SankeyLink[] = []

  const mergeLinks = (
    actualLinks: Map<string, Map<string, Minor>>,
    predictedLinks: Map<string, Map<string, Minor>>,
  ) => {
    const allSources = new Set<string>()
    actualLinks.forEach((_, source) => allSources.add(source))
    predictedLinks.forEach((_, source) => allSources.add(source))

    for (const sourceId of allSources) {
      const actualTargets = actualLinks.get(sourceId) || new Map<string, Minor>()
      const predictedTargets = predictedLinks.get(sourceId) || new Map<string, Minor>()
      const allTargets = new Set<string>()
      actualTargets.forEach((_, target) => allTargets.add(target))
      predictedTargets.forEach((_, target) => allTargets.add(target))

      for (const targetId of allTargets) {
        const actualAmount = mapValue(actualTargets, targetId)
        const predictedAmount = mapValue(predictedTargets, targetId)
        const totalAmount = add(actualAmount, predictedAmount)

        if (totalAmount > 0) {
          const link: SankeyLink = { source: sourceId, target: targetId, value: totalAmount }
          if (actualAmount > 0) link.actualValue = actualAmount
          if (predictedAmount > 0) link.predictedValue = predictedAmount
          sankeyLinks.push(link)
        }
      }
    }
  }

  mergeLinks(sourceToCashLinks.actual, sourceToCashLinks.predicted)
  mergeLinks(cashToTargetLinks.actual, cashToTargetLinks.predicted)
  mergeLinks(cashToCashLinks.actual, cashToCashLinks.predicted)

  return { nodes: sankeyNodes, links: sankeyLinks }
}
