/**
 * 现金流桑基图的 DTO 构造（报表编排层，非领域逻辑）。
 *
 * 本文件只做可视化数据结构组装：endpoint 身份前缀、按活动拆 ribbon、分组元数据、
 * 按列排序与 actual/predicted 合并。财务金额规则（X+f / X+c / c−f、退款冲减方向）
 * 一律调用 Domain 的 ledger/rules，不在此复写。
 *
 * 微服务职责边界：
 *   - Domain：财务语义与金额规则（唯一实现）
 *   - 本层：把财务结果编排成桑基 nodes / links DTO
 *   - Frontend：折叠 / 展开 / 排序 / 着色的展示投影
 */
import {
  abs, add, type CashFlowActivityKey, type Minor, ZERO_MINOR,
} from '../../../../../packages/domain/src/index.js'
import { refundOffsetKind, transferInflow, transferOutflow } from '../../../../../packages/domain/src/ledger/rules.js'
import type {
  SankeyEndpoint, SankeyGroupMeta, SankeyLink, SankeyResult, SankeyNodeType, SankeySide,
} from '../../../../../packages/contracts/types/index.js'

/**
 * 桑基图的编排输入。API 负责 Prisma 行 / 预算 DTO → 本结构的映射（含名称兜底差异、
 * 日期范围过滤与现金集合判定）；本层只做节点与链路 DTO 构造。
 */
export interface SankeySourceTransaction {
  isActual: boolean
  type: string
  relatedType: string | null
  /** 交易分类的有效现金流活动（沿一级分类继承）；合成交易为 null。 */
  cashFlowType: CashFlowActivityKey | null
  amount: Minor
  fee: Minor
  coupon: Minor
  isFromCash: boolean
  isToCash: boolean
  categoryName: string | null | undefined
  /** 一级分类稳定身份；聚合按它进行，展示名不参与身份判定。 */
  categoryId: string | null | undefined
  accountName: string | null | undefined
  /** 现金 / 非现金账户稳定身份。 */
  accountId: string | null | undefined
  toAccountName: string | null | undefined
  /** 转入账户稳定身份。 */
  toAccountId: string | null | undefined
  /** 分类所属一级分类组；真实分类由 API 解析，合成分类不填。 */
  categoryGroupId: string | null | undefined
  categoryGroupName: string | null | undefined
  /** 账户所属账户分类组；有账户分类的账户由 API 解析，未分组不填。 */
  accountGroupId: string | null | undefined
  accountGroupName: string | null | undefined
  /** 转入账户所属账户分类组（非现金转入节点归组用）。 */
  toAccountGroupId: string | null | undefined
  toAccountGroupName: string | null | undefined
}

/**
 * 链路 key 把活动身份编进 target 位：同一对端点上的经营 / 投资 / 筹资流水
 * 各成一条 ribbon，活动色不会串；无活动的内部转账 / 手续费 / 优惠券落 null。
 */
const linkKey = (targetId: string, activity: CashFlowActivityKey | null) =>
  `${targetId}|${activity ?? ''}`

const splitLinkKey = (key: string): { targetId: string; activity: CashFlowActivityKey | null } => {
  const at = key.lastIndexOf('|')
  if (at < 0) return { targetId: key, activity: null }
  const raw = key.slice(at + 1)
  const activity =
    raw === 'operating' || raw === 'investing' || raw === 'financing' ? raw : null
  return { targetId: key.slice(0, at), activity }
}

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
 * 构造现金流量表的桑基 DTO。
 *
 * endpoint 的身份全部由结构化 `id` 表达（`id` 来自实体 id + 桑基语义前缀），
 * 展示名 `name` 不参与身份判定，同名实体不会被合并。聚合 / 金额口径与改造前一致：
 * 三条链路对「现金→现金内部划转」的分叉保持原样——本金画成账户间链路、
 * 手续费与优惠券各自单列成节点，与完整账务金额 X+f / X+c 对齐。
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
      addToMap(sourceToCashLinks_.get(catEndpoint)!, linkKey(cashEndpoint, tx.cashFlowType), amount)
    } else if (type === 'expense' && isFromCash) {
      const name = categoryName || '其他支出'
      const cashName = accountName || '现金账户'
      const catEndpoint = categoryIdOf('out', categoryId, name)
      const cashEndpoint = accountIdOf(accountId, cashName)
      addEndpoint(expenseCategoryNodes_, catEndpoint, 'expense_category', 'out', name, categoryGroup, amount)
      addEndpoint(cashAccountFlows_, cashEndpoint, 'cash', 'account', cashName, accountGroup, amount)
      if (!cashToTargetLinks_.has(cashEndpoint)) cashToTargetLinks_.set(cashEndpoint, new Map())
      addToMap(cashToTargetLinks_.get(cashEndpoint)!, linkKey(catEndpoint, tx.cashFlowType), amount)
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
        addToMap(sourceToCashLinks_.get(fromEndpoint)!, linkKey(toCashEndpoint, tx.cashFlowType), actualInflow)
      } else if (isFromCash && !isToCash && accountName) {
        // 非现金去向节点：同上，展示名只用账户名。
        const accName = toAccountName || '非现金账户'
        const fromCashEndpoint = accountIdOf(accountId, accountName)
        const toEndpoint = targetIdOf(categoryId, toAccountId, accName)
        const actualOutflow = abs(transferOutflow(amount, fee))
        addEndpoint(nonCashTargetNodes_, toEndpoint, 'non_cash_target', 'out', accName, toAccountGroup, actualOutflow)
        addEndpoint(cashAccountFlows_, fromCashEndpoint, 'cash', 'account', accountName, accountGroup, actualOutflow)
        if (!cashToTargetLinks_.has(fromCashEndpoint)) cashToTargetLinks_.set(fromCashEndpoint, new Map())
        addToMap(cashToTargetLinks_.get(fromCashEndpoint)!, linkKey(toEndpoint, tx.cashFlowType), actualOutflow)
      } else if (isFromCash && isToCash && accountName && toAccountName) {
        const fromCashEndpoint = accountIdOf(accountId, accountName)
        const toCashEndpoint = accountIdOf(toAccountId, toAccountName)
        // 完整账务金额：转出 X+f、转入 X+c；手续费与优惠券各自独立成节点，
        // 不再用净额 c−f 相互抵消，才能与逐账户余额回放口径一致。
        const actualOutflow = transferOutflow(amount, fee)
        const actualInflow = transferInflow(amount, coupon)
        addEndpoint(cashAccountFlows_, fromCashEndpoint, 'cash', 'account', accountName, accountGroup, actualOutflow)
        addEndpoint(cashAccountFlows_, toCashEndpoint, 'cash', 'account', toAccountName, toAccountGroup, actualInflow)
        if (!cashToCashLinks_.has(fromCashEndpoint)) cashToCashLinks_.set(fromCashEndpoint, new Map())
        // 本金按原语义画账户间链路，金额仍是 X（不含 f / c）。
        addToMap(cashToCashLinks_.get(fromCashEndpoint)!, linkKey(toCashEndpoint, null), amount)
        if (fee > ZERO_MINOR) {
          addEndpoint(expenseCategoryNodes_, FEE_ID, 'expense_category', 'out', '手续费', null, fee)
          if (!cashToTargetLinks_.has(fromCashEndpoint)) cashToTargetLinks_.set(fromCashEndpoint, new Map())
          addToMap(cashToTargetLinks_.get(fromCashEndpoint)!, linkKey(FEE_ID, null), fee)
        }
        if (coupon > ZERO_MINOR) {
          addEndpoint(incomeCategoryNodes_, COUPON_ID, 'income_category', 'in', '优惠券', null, coupon)
          if (!sourceToCashLinks_.has(COUPON_ID)) sourceToCashLinks_.set(COUPON_ID, new Map())
          addToMap(sourceToCashLinks_.get(COUPON_ID)!, linkKey(toCashEndpoint, null), coupon)
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
        addToMap(sourceToCashLinks_.get(catEndpoint)!, linkKey(cashEndpoint, tx.cashFlowType), amount)
      } else if (offset === 'income') {
        const catEndpoint = categoryIdOf('out', categoryId, name)
        addEndpoint(expenseCategoryNodes_, catEndpoint, 'expense_category', 'out', name, categoryGroup, amount)
        addEndpoint(cashAccountFlows_, cashEndpoint, 'cash', 'account', cashName, accountGroup, amount)
        if (!cashToTargetLinks_.has(cashEndpoint)) cashToTargetLinks_.set(cashEndpoint, new Map())
        addToMap(cashToTargetLinks_.get(cashEndpoint)!, linkKey(catEndpoint, tx.cashFlowType), amount)
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

      for (const targetKey of allTargets) {
        const { targetId, activity } = splitLinkKey(targetKey)
        const actualAmount = mapValue(actualTargets, targetKey)
        const predictedAmount = mapValue(predictedTargets, targetKey)
        const totalAmount = add(actualAmount, predictedAmount)

        if (totalAmount > 0) {
          const link: SankeyLink = { source: sourceId, target: targetId, value: totalAmount, activity }
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
