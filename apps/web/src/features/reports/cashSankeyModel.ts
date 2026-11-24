/**
 * 现金流桑基模型（三层重设计）
 *
 * 三层固定为「收入类 → 账户 → 支出类」：
 *   - 左列：一级收入分类（含非现金转入、对账修正等来源）；
 *   - 中列：本期涉及的账户，现金账户之间的转账画成账户 → 账户的 link；
 *   - 右列：一级支出分类（含转出到非现金账户、手续费、对账修正等去向）。
 *
 * 单位是分，容差 ¥0.01。期初 / 期末不画成首尾节点，而是逐账户读数：
 *   期初_i + 流入_i − 流出_i + 转入_i − 转出_i = 期末_i
 *   Σ期初 + 流入 − 流出 − Σ期末 = 0（内部转账在总账里抵消）
 * 任一账户或总账超容差都落失败态，绝不为了出图放宽。
 */
import { minor, type CashFlowActivityKey } from '@domain/index'
import type { SankeyEndpoint } from '@contracts/types'
import { formatCurrency } from '@/utils/format'
import type { Ledger } from '@/features/overview/model'
import { addDays } from '@/utils/date'
import {
  accountBalancesAt,
  type CashChild,
  type CashGroup,
  type CashReport,
} from './reportsModel'

type Tone = 'income' | 'expense' | 'neutral'

export interface CashSankeyAccount {
  id: string
  name: string
  opening: number
  closing: number
  inflow: number
  outflow: number
  transferIn: number
  transferOut: number
  /** 逐账户等式残差（分）。 */
  difference: number
}

export interface CashSankeyNode {
  id: string
  name: string
  /** 0 = 收入类，1 = 账户，2 = 支出类。 */
  layer: 0 | 1 | 2
  tone: Tone
  amount: number
  children: CashChild[]
  hiddenCount?: number
  account?: CashSankeyAccount
  /** 所属折叠组身份（一级分类 / 账户分类）；渐进式投影据此聚合或展开。 */
  groupId?: string
  /** 折叠组展示名。 */
  groupName?: string
  /** 该节点在细图中是否为可展开组的成员（组内成员数 > 1）。 */
  expandable?: boolean
  /** 分区：账户类节点排前，分类节点排后。 */
  origin?: 'account' | 'category'
  /** 稳定排序位次：折叠态分配，展开只在原组内展开，不改变其他节点相对顺序。 */
  rank?: number
  /** 组内次序（按金额降序），展开后成员按此排列。 */
  memberIndex?: number
  /** 投影后是否为折叠组节点（点击展开）。 */
  isGroup?: boolean
  /**
   * 现金流活动分类；账户列取相连流里金额最大的活动，**只用于排序**（让现金账户
   * 与两侧分类按同一活动顺序排列，减少 ribbon 交叉），渲染层仍固定为中性色。
   * 由投影层回填。
   */
  activity?: CashFlowActivityKey | null
}

export interface CashSankeyLink {
  id: string
  sourceId: string
  targetId: string
  /** 抽屉锚点：点击 ribbon 时打开这一侧的分类 / 账户。 */
  nodeId: string
  amount: number
  tone: Tone
  /** `transfer` 为账户之间的内部转账；其余为真实的流入 / 流出。 */
  kind: 'flow' | 'transfer'
  /** 现金流活动分类；null = 内部转账 / 手续费 / 优惠券等非收支活动。 */
  activity: CashFlowActivityKey | null
}

/** ribbon 的着色键：活动不同就分成多条，避免折叠 / 动画时 key 碰撞。 */
export function linkIdentity(link: Pick<CashSankeyLink, 'sourceId' | 'targetId' | 'kind' | 'activity'>): string {
  return `${link.sourceId}>${link.targetId}|${link.kind}|${link.activity ?? 'none'}`
}

export interface CashSankey {
  status: 'ready' | 'invalid'
  reason?: string
  opening: number
  closing: number
  inflow: number
  outflow: number
  fee: number
  correction: number
  difference: number
  nodes: CashSankeyNode[]
  links: CashSankeyLink[]
  /** 配置里被隐藏的活动分组数（跨流入 / 流出只算一次，账户间转账也只算一次）。 */
  hiddenGroups: number
  /** 内部转账总额（本金）。现金账户之间画成账户 → 账户的 link，不再从图里排除。 */
  transferTotal: number
  accounts: CashSankeyAccount[]
}

/**
 * 守恒硬断言：期初 + 流入 − 流出 − 期末，单位是分，容差 ¥0.01。
 * 不守恒时开发期直接抛错；生产分支由调用方转成可见失败态，绝不静默画图。
 */
export function assertCashSankeyConservation(
  opening: number,
  inflow: number,
  outflow: number,
  closing: number,
): number {
  const difference = opening + inflow - outflow - closing
  if (Math.abs(difference) > 1) {
    throw new Error(
      `现金流桑基不守恒：期初 ${opening} + 流入 ${inflow} − 流出 ${outflow} − 期末 ${closing} = ${difference} 分`,
    )
  }
  return difference
}

/** 逐账户守恒断言：任一账户残差超过 1 分即失败。 */
export function assertAccountConservation(accounts: CashSankeyAccount[]): string | null {
  const broken = accounts
    .filter((account) => Math.abs(account.difference) > 1)
    .sort((left, right) => Math.abs(right.difference) - Math.abs(left.difference))
  if (broken.length === 0) return null
  const account = broken[0]
  const tail = broken.length > 1 ? `（另有 ${broken.length - 1} 个账户对不上）` : ''
  return `账户「${account.name}」逐账户等式对不上：期初 ${money(account.opening)} + 流入 ${money(account.inflow)} − 流出 ${money(account.outflow)} + 转入 ${money(account.transferIn)} − 转出 ${money(account.transferOut)} = 期末 ${money(account.closing)}，差 ${money(account.difference)}${tail}`
}

function money(value: number): string {
  return formatCurrency(minor(Math.round(value)))
}

function rootOf(ledger: Ledger, categoryId: string | undefined): { id: string; name: string } | null {
  if (!categoryId) return null
  let current = ledger.categories.find((category) => category.id === categoryId)
  if (!current) return null
  const visited = new Set<string>()
  while (current?.parentId && !visited.has(current.id)) {
    visited.add(current.id)
    const parent = ledger.categories.find((category) => category.id === current?.parentId)
    if (!parent) break
    current = parent
  }
  return { id: current.id, name: current.name }
}

function categoryKey(side: 'in' | 'out', categoryId: string): string {
  return side === 'in' ? `in:${categoryId}` : `out:${categoryId}`
}

interface GroupIndex {
  hiddenGroups: number
  hideTransfers: boolean
  hiddenInIds: Set<string>
  hiddenOutIds: Set<string>
  hiddenInChildren: CashChild[]
  hiddenOutChildren: CashChild[]
  inGroupOf: Map<string, string>
  outGroupOf: Map<string, string>
  inChildrenByRoot: Map<string, CashChild[]>
  outChildrenByRoot: Map<string, CashChild[]>
}

function buildGroupIndex(
  ledger: Ledger,
  report: CashReport,
  visibility: Record<string, boolean>,
  hasTransfers: boolean,
): GroupIndex {
  const visible = (key: string) => visibility[key] !== false
  const hiddenKeys = new Set<string>()
  for (const group of [...report.inflowGroups, ...report.outflowGroups]) {
    if (group.total > 0 && !visible(group.key)) hiddenKeys.add(group.key)
  }
  const hideTransfers = !visible('账户间转账')
  // 账户间转账不在后端活动分组里；配置隐藏且有转账时同样只算一组。
  if (hideTransfers && hasTransfers) hiddenKeys.add('账户间转账')

  const index: GroupIndex = {
    hiddenGroups: hiddenKeys.size,
    hideTransfers,
    hiddenInIds: new Set(),
    hiddenOutIds: new Set(),
    hiddenInChildren: [],
    hiddenOutChildren: [],
    inGroupOf: new Map(),
    outGroupOf: new Map(),
    inChildrenByRoot: new Map(),
    outChildrenByRoot: new Map(),
  }

  const addChildren = (side: 'in' | 'out', group: CashGroup, hidden: boolean) => {
    const map = side === 'in' ? index.inChildrenByRoot : index.outChildrenByRoot
    for (const child of group.children) {
      const root = rootOf(ledger, child.categoryId)
      const rootId = root?.id ?? child.categoryId
      const list = map.get(rootId) ?? []
      list.push(child)
      map.set(rootId, list)
      if (hidden) {
        if (side === 'in') {
          index.hiddenInIds.add(rootId)
          index.hiddenInChildren.push(child)
        } else {
          index.hiddenOutIds.add(rootId)
          index.hiddenOutChildren.push(child)
        }
      }
    }
  }

  for (const group of report.inflowGroups) {
    if (group.total <= 0) continue
    for (const child of group.children) {
      index.inGroupOf.set(child.categoryId, group.key)
    }
    addChildren('in', group, !visible(group.key))
  }
  for (const group of report.outflowGroups) {
    if (group.total <= 0) continue
    for (const child of group.children) {
      index.outGroupOf.set(child.categoryId, group.key)
    }
    addChildren('out', group, !visible(group.key))
  }
  return index
}

interface Builder {
  nodeMap: Map<string, CashSankeyNode>
  linkMap: Map<string, CashSankeyLink>
  addNode: (node: CashSankeyNode) => CashSankeyNode
  addLink: (link: Omit<CashSankeyLink, 'id'>) => void
}

function createBuilder(): Builder {
  const nodeMap = new Map<string, CashSankeyNode>()
  const linkMap = new Map<string, CashSankeyLink>()
  const addNode = (node: CashSankeyNode) => {
    const existing = nodeMap.get(node.id)
    if (existing) {
      if (node.children.length > 0) existing.children.push(...node.children)
      return existing
    }
    nodeMap.set(node.id, node)
    return node
  }
  const addLink = (link: Omit<CashSankeyLink, 'id'>) => {
    if (link.amount <= 0) return
    const key = linkIdentity(link)
    const existing = linkMap.get(key)
    if (existing) {
      existing.amount += link.amount
      return
    }
    linkMap.set(key, { ...link, id: key })
  }
  return { nodeMap, linkMap, addNode, addLink }
}

type EndpointRole = 'income' | 'expense' | 'account'

/**
 * 从后端 endpoint 的结构化字段解析角色与实体身份，完全不读展示名。
 * `base` 是稳定实体 id（分类 id / 账户 id）；合成节点才退化为固定语义位。
 */
function endpointRole(endpoint: SankeyEndpoint): {
  role: EndpointRole
  base: string
  synthetic: boolean
  id: string
  name: string
} {
  const { id, name, nodeType } = endpoint
  const synthetic =
    nodeType === 'non_cash_source' ||
    nodeType === 'non_cash_target' ||
    id.includes(':synthetic:')

  if (nodeType === 'cash') return { role: 'account', base: accountBaseOf(id), synthetic, id, name }
  if (nodeType === 'income_category' || nodeType === 'non_cash_source') {
    return { role: 'income', base: categoryBaseOf(id, 'in'), synthetic, id, name }
  }
  return { role: 'expense', base: categoryBaseOf(id, 'out'), synthetic, id, name }
}

/** 从 `acct:<id>` / `acct:synthetic:<name>` 提取账户身份。 */
function accountBaseOf(id: string): string {
  const rest = id.startsWith('acct:') ? id.slice('acct:'.length) : id
  return rest.startsWith('synthetic:') ? rest.slice('synthetic:'.length) : rest
}

/** 从 `in:<id>` / `out:<id>` 提取分类身份；合成节点返回其固定语义位。 */
function categoryBaseOf(id: string, side: 'in' | 'out'): string {
  const prefix = `${side}:`
  const rest = id.startsWith(prefix) ? id.slice(prefix.length) : id
  return rest.startsWith('synthetic:') ? rest.slice('synthetic:'.length) : rest
}

/** 从细图节点 id 解析其分类根 id，用于下钻明细按一级分类对齐。 */
function nodeCategoryRootId(ledger: Ledger, node: CashSankeyNode): string {
  const side = node.layer === 0 ? 'in' : 'out'
  const prefix = `${side}:`
  const base = node.id.startsWith(prefix) ? node.id.slice(prefix.length) : node.id
  return rootOf(ledger, base)?.id ?? base
}

/**
 * 给节点回填活动身份：取相连流里金额最大的活动，混合时退到占优者。
 *
 * 账户列也参与计算——只为排序服务：现金账户按主导活动与两侧分类对齐，避免
 * ribbon 在列内交叉；账户竖条与读数在渲染层固定为中性色，不跟着活动着色。
 */
export function assignNodeActivities(nodes: CashSankeyNode[], links: CashSankeyLink[]): void {
  const weights = new Map<string, Map<CashFlowActivityKey, number>>()
  const add = (id: string, link: CashSankeyLink) => {
    if (!link.activity) return
    const byActivity = weights.get(id) ?? new Map<CashFlowActivityKey, number>()
    byActivity.set(link.activity, (byActivity.get(link.activity) ?? 0) + link.amount)
    weights.set(id, byActivity)
  }
  for (const link of links) {
    add(link.sourceId, link)
    add(link.targetId, link)
  }
  for (const node of nodes) {
    const byActivity = weights.get(node.id)
    node.activity = byActivity
      ? [...byActivity.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      : null
  }
}

/**
 * 桑基节点的稳定视图排序：活动类型 → 账户/分类 → 金额降序 → id 兜底。
 *
 * 活动类型优先，使同色 ribbon 在列内相邻；账户类节点先于分类节点（沿用既有约定）；
 * 金额降序让大额在上。折叠态由本函数给每个组定 rank，展开时成员继承该 rank 并按
 * 同一函数定 memberIndex，因此任意展开组合下其它节点的相对顺序都不变。
 */
export function sankeyOrder(left: CashSankeyNode, right: CashSankeyNode): number {
  const activityRank = (node: CashSankeyNode) => {
    switch (node.activity) {
      case 'operating': return 0
      case 'investing': return 1
      case 'financing': return 2
      default: return 3 // neutral / 无活动
    }
  }
  const a = activityRank(left) - activityRank(right)
  if (a !== 0) return a
  const originLeft = left.origin === 'account' ? 0 : 1
  const originRight = right.origin === 'account' ? 0 : 1
  if (originLeft !== originRight) return originLeft - originRight
  if (left.amount !== right.amount) return right.amount - left.amount
  return left.id.localeCompare(right.id)
}

/**
 * 给细图节点回填渐进式分组与稳定排序字段。
 *
 * 分组身份、展示名、可展开性全部来自后端 endpoint 自带的 `group`，前端不读
 * ledger 的分类层级 / 账户分类归属。前端只负责视图排序：组间顺序在完全折叠态
 * 按「活动类型 → 账户/分类 → 金额」确定，成员按同一规则定 memberIndex；
 * 展开只在原组内展开，因此任意展开组合下其他节点的相对顺序都不变。
 */
function finalizeGroups(nodes: CashSankeyNode[], endpointMap: Map<string, SankeyEndpoint>): CashSankeyNode[] {
  const grouped = new Map<string, CashSankeyNode[]>()
  for (const node of nodes) {
    const group = endpointMap.get(node.id)?.group ?? null
    node.groupId = group?.id ?? `self:${node.id}`
    node.groupName = group?.name ?? node.name
    node.expandable = group?.expandable ?? false
    node.origin = node.layer === 1 ? 'account' : 'category'
    const list = grouped.get(node.groupId) ?? []
    list.push(node)
    grouped.set(node.groupId, list)
  }

  // 组的排序代表：取组内活动优先级最高、金额最大的成员作为代理节点参与比较，
  // 使混合活动的组按其主导活动归位，且与展开后组内首个成员的位次一致。
  const representative = (members: CashSankeyNode[]): CashSankeyNode =>
    members.slice().sort(sankeyOrder)[0]!
  const groupOrder = [...grouped.entries()].sort((left, right) =>
    sankeyOrder(representative(left[1]), representative(right[1])))

  groupOrder.forEach(([, members], rank) => {
    const ordered = members.slice().sort(sankeyOrder)
    ordered.forEach((node, index) => {
      // expandable 由后端 endpoint.group 权威给出，前端只排视图序位。
      node.rank = rank
      node.memberIndex = index
    })
  })
  return nodes
}

interface AccountRuntime {
  account: CashSankeyAccount
  nodeId: string
}

function accountLayer(
  ledger: Ledger,
  included: Set<string>,
  from: string,
  to: string,
): Map<string, AccountRuntime> {
  // 时点余额由 reportsModel 统一回放（转账按 Domain 的 X+f / X+c 反推），
  // 这里不再为手续费做第二套补偿。
  const openingBalances = accountBalancesAt(ledger, addDays(from, -1))
  const closingBalances = accountBalancesAt(ledger, to)
  const layer = new Map<string, AccountRuntime>()
  for (const account of ledger.accounts) {
    if (account.kind !== 'cash' && !included.has(account.id)) continue
    const opening = openingBalances.get(account.id) ?? account.balance
    const closing = closingBalances.get(account.id) ?? account.balance
    if (!included.has(account.id) && opening === 0 && closing === 0) continue
    const entry: CashSankeyAccount = {
      id: account.id,
      name: account.name,
      opening,
      closing,
      inflow: 0,
      outflow: 0,
      transferIn: 0,
      transferOut: 0,
      difference: 0,
    }
    layer.set(account.id, { account: entry, nodeId: `acct:${account.id}` })
  }
  return layer
}

function accountChildren(node: CashSankeyNode, nodes: Map<string, CashSankeyNode>, links: CashSankeyLink[]): CashChild[] {
  const rows = new Map<string, CashChild>()
  for (const link of links) {
    if (link.sourceId !== node.id && link.targetId !== node.id) continue
    const otherId = link.sourceId === node.id ? link.targetId : link.sourceId
    const other = nodes.get(otherId)
    if (!other) continue
    const label = link.kind === 'transfer' ? `转入/转出 · ${other.name}` : other.name
    const key = `${otherId}|${link.kind}|${link.tone}`
    const row = rows.get(key)
    if (row) {
      row.amount += link.amount
    } else {
      rows.set(key, {
        id: key,
        label,
        account: node.name,
        amount: link.amount,
        tone: link.kind === 'transfer' ? 'transfer' : link.tone === 'income' ? 'income' : 'expense',
        categoryId: '',
      })
    }
  }
  return [...rows.values()].sort((left, right) => right.amount - left.amount)
}

/**
 * API 模式只用实际发生的金额：后端 `value` 含预测，直接画会与账本回放的
 * 期初 / 期末对不上，逐账户断言必然失败。
 */
function actualAmountOf(link: { actualValue?: number; predictedValue?: number; value: number }): number {
  if (link.actualValue !== undefined) return link.actualValue
  if (link.predictedValue !== undefined) return 0
  return link.value
}

/**
 * 预测区间的窗口级桑基：后端已把 actual / committed / planned 合成到 link，
 * 不再用账本回放校验期初 / 期末（预测事件不在账本流水里）。
 * 只做「后端字段 → 三层结构」的直译，差额仍按 期初 + 流入 − 流出 − 期末 校验。
 */
function projectionSankey(ledger: Ledger, report: CashReport): CashSankey {
  const apiSankey = report.apiSankey
  const base: CashSankey = {
    status: 'ready',
    opening: report.openingCash ?? 0,
    closing: report.closingCash ?? 0,
    inflow: 0,
    outflow: 0,
    fee: 0,
    correction: 0,
    difference: 0,
    nodes: [],
    links: [],
    hiddenGroups: 0,
    transferTotal: 0,
    accounts: [],
  }
  if (!apiSankey || apiSankey.links.length === 0) {
    return { ...base, status: 'invalid', reason: '本窗口没有可绘制的现金流事件。' }
  }

  // 后端 endpoint 自带结构化身份：id 即节点身份，nodeType / side 表达类型与方向。
  const endpointMap = new Map<string, SankeyEndpoint>(apiSankey.nodes.map((node) => [node.id, node]))
  const nodeMap = new Map<string, CashSankeyNode>()
  const ensureNode = (endpointId: string): CashSankeyNode => {
    const existing = nodeMap.get(endpointId)
    if (existing) return existing
    const endpoint = endpointMap.get(endpointId)
    const role = endpointRole(endpoint ?? {
      id: endpointId,
      name: endpointId,
      nodeType: 'income_category',
      side: 'in',
      group: null,
    })
    const node: CashSankeyNode = {
      id: endpointId,
      name: endpoint?.name ?? role.base,
      layer: role.role === 'account' ? 1 : role.role === 'income' ? 0 : 2,
      tone: role.role === 'account' ? 'neutral' : role.role,
      amount: 0,
      children: [],
    }
    nodeMap.set(endpointId, node)
    return node
  }

  const links: CashSankeyLink[] = []
  let transferTotal = 0
  for (const link of apiSankey.links) {
    if (link.value <= 0) continue
    const sourceId = ensureNode(link.source).id
    const targetId = ensureNode(link.target).id
    const sourceRole = endpointRole(endpointMap.get(link.source) ?? {
      id: link.source, name: link.source, nodeType: 'income_category', side: 'in', group: null,
    })
    const targetRole = endpointRole(endpointMap.get(link.target) ?? {
      id: link.target, name: link.target, nodeType: 'expense_category', side: 'out', group: null,
    })
    const kind = sourceRole.role === 'account' && targetRole.role === 'account' ? ('transfer' as const) : ('flow' as const)
    if (kind === 'transfer') transferTotal += link.value
    const next: CashSankeyLink = {
      id: '',
      sourceId,
      targetId,
      nodeId: sourceRole.role === 'income' ? sourceId : targetRole.role === 'expense' ? targetId : sourceId,
      amount: link.value,
      tone: sourceRole.role === 'income' ? 'income' : targetRole.role === 'expense' ? 'expense' : 'neutral',
      kind,
      activity: kind === 'transfer' ? null : link.activity,
    }
    next.id = linkIdentity(next)
    links.push(next)
  }

  const nodes = [...nodeMap.values()]
  // 先回填活动再分组：排序键含活动类型，必须让同一组的成员继承组的行为一致。
  assignNodeActivities(nodes, links)
  finalizeGroups(nodes, endpointMap)
  const inflow = links
    .filter((link) => link.kind === 'flow' && nodeMap.get(link.sourceId)?.layer === 0 && nodeMap.get(link.targetId)?.layer === 1)
    .reduce((sum, link) => sum + link.amount, 0)
  const outflow = links
    .filter((link) => link.kind === 'flow' && nodeMap.get(link.sourceId)?.layer === 1 && nodeMap.get(link.targetId)?.layer === 2)
    .reduce((sum, link) => sum + link.amount, 0)

  // 节点吞吐与下钻明细：分类节点按根分类名对齐活动分组，账户节点按 link 端点。
  const childrenByRoot = (side: 'in' | 'out'): Map<string, CashChild[]> => {
    const map = new Map<string, CashChild[]>()
    const groups = side === 'in' ? report.inflowGroups : report.outflowGroups
    for (const group of groups) {
      for (const child of group.children) {
        const root = rootOf(ledger, child.categoryId)
        const key = root?.id ?? child.categoryId
        const list = map.get(key) ?? []
        list.push(child)
        map.set(key, list)
      }
    }
    return map
  }
  const inChildren = childrenByRoot('in')
  const outChildren = childrenByRoot('out')
  for (const node of nodes) {
    if (node.layer === 1) {
      node.amount = Math.max(
        links.filter((link) => link.targetId === node.id).reduce((sum, link) => sum + link.amount, 0),
        links.filter((link) => link.sourceId === node.id).reduce((sum, link) => sum + link.amount, 0),
      )
      node.children = accountChildren(node, nodeMap, links)
    } else if (node.layer === 0) {
      node.amount = links.filter((link) => link.sourceId === node.id).reduce((sum, link) => sum + link.amount, 0)
      node.children = inChildren.get(nodeCategoryRootId(ledger, node)) ?? []
    } else {
      node.amount = links.filter((link) => link.targetId === node.id).reduce((sum, link) => sum + link.amount, 0)
      node.children = outChildren.get(nodeCategoryRootId(ledger, node)) ?? []
    }
  }

  // 账户数组只用于图例计数；逐账户期初 / 期末不在该端点返回，保持 0、不挂到节点上。
  const accounts: CashSankeyAccount[] = nodes
    .filter((node) => node.layer === 1)
    .map((node) => ({
      id: node.id,
      name: node.name,
      opening: 0,
      closing: 0,
      inflow: 0,
      outflow: 0,
      transferIn: 0,
      transferOut: 0,
      difference: 0,
    }))

  const difference = base.opening + inflow - outflow - base.closing
  if (Math.abs(difference) > 1) {
    return {
      ...base,
      nodes,
      links,
      accounts,
      inflow,
      outflow,
      transferTotal,
      difference,
      status: 'invalid',
      reason: `预测区间现金流不守恒：期初 ${money(base.opening)} + 流入 ${money(inflow)} − 流出 ${money(outflow)} − 期末 ${money(base.closing)} = ${money(Math.abs(difference))}。为避免误读，本图已停画。`,
    }
  }

  return {
    ...base,
    inflow,
    outflow,
    nodes,
    links,
    accounts,
    transferTotal,
    difference,
  }
}

/**
 * 现金流桑基（PC）。只消费后端 `sankey` 的逐账户分配；
 * 节点 / 守恒校验与后端分配共用同一套结构。
 */
export function deriveCashSankey(
  ledger: Ledger,
  report: CashReport,
  /** 隐藏分组的可见性表；默认全显示（报表设置不再提供隐藏分组开关）。 */
  visibility: Record<string, boolean> = {},
): CashSankey {
  if (report.projectionMode) return projectionSankey(ledger, report)
  const { from, to } = report.period
  const apiEndpoints = report.apiSankey?.nodes ?? []
  const apiLinks = report.apiSankey?.links ?? []
  const endpointMap = new Map<string, SankeyEndpoint>(apiEndpoints.map((node) => [node.id, node]))
  const endpointFor = (id: string): SankeyEndpoint =>
    endpointMap.get(id) ?? { id, name: id, nodeType: 'income_category', side: 'in', group: null }
  const hasTransfers = apiLinks.some(
    (link) => endpointFor(link.source).nodeType === 'cash' && endpointFor(link.target).nodeType === 'cash',
  )
  const groupIndex = buildGroupIndex(ledger, report, visibility, hasTransfers)
  const builder = createBuilder()

  // 失败态也保留可读的账户层与合计，方便把「哪一项对不上」写进 reason。
  const base: CashSankey = {
    status: 'ready',
    opening: 0,
    closing: 0,
    inflow: 0,
    outflow: 0,
    fee: 0,
    correction: 0,
    difference: 0,
    nodes: [],
    links: [],
    hiddenGroups: groupIndex.hiddenGroups,
    transferTotal: 0,
    accounts: [],
  }

  const invalid = (reason: string, extra?: Partial<CashSankey>): CashSankey => ({
    ...base,
    ...extra,
    status: 'invalid',
    reason,
  })

  const includedAccounts = new Set<string>()
  const addAccountNode = (accountId: string, name: string) => {
    const id = `acct:${accountId}`
    builder.addNode({ id, name, layer: 1, tone: 'neutral', amount: 0, children: [] })
    includedAccounts.add(accountId)
  }

  const addCategoryNode = (
    side: 'in' | 'out',
    id: string,
    name: string,
    hidden: boolean,
    tone?: Tone,
  ) => {
    const nodeId = hidden ? `${side === 'in' ? 'in' : 'out'}:hidden` : categoryKey(side, id)
    const node = builder.addNode({
      id: nodeId,
      name: hidden ? `其他（已隐藏 ${groupIndex.hiddenGroups} 组）` : name,
      layer: side === 'in' ? 0 : 2,
      tone: tone ?? (side === 'in' ? 'income' : 'expense'),
      amount: 0,
      children: [],
      hiddenCount: hidden ? groupIndex.hiddenGroups : undefined,
    })
    return { node, nodeId }
  }

  const categoryError: string[] = []

  const hiddenForRoot = (side: 'in' | 'out', rootId: string | undefined): boolean => {
    if (!rootId) return false
    return (side === 'in' ? groupIndex.hiddenInIds : groupIndex.hiddenOutIds).has(rootId)
  }

  /**
   * 分类 endpoint → 细图节点。直接用 endpoint 的真实分类 id（可能是叶子分类）建节点，
   * 保留二级分类信息供渐进式展开；分组元数据来自 endpoint.group（后端权威）。
   * 隐藏判断仍按根分类（与分组无关的下钻可见性逻辑），展示名取 endpoint.name。
   */
  const resolveApiCategory = (endpoint: SankeyEndpoint): { nodeId: string } => {
    const role = endpointRole(endpoint)
    const side = role.role === 'income' ? 'in' : 'out'
    if (role.synthetic) {
      // 合成位 / 非现金端点的 id 已是完整身份（in:ncs:… / out:nct:… / …:synthetic:…），
      // 不能再套 categoryKey，否则 finalizeGroups 按 endpoint.id 查不到 group，
      // 非现金账户就会退化成单成员节点，直接显示账户而非账户分类。
      const node = builder.addNode({
        id: endpoint.id,
        name: endpoint.name,
        layer: role.role === 'income' ? 0 : 2,
        tone: 'neutral',
        amount: 0,
        children: [],
      })
      return { nodeId: node.id }
    }
    const categoryId = role.base
    const root = rootOf(ledger, categoryId)
    return addCategoryNode(side, categoryId, endpoint.name, hiddenForRoot(side, root?.id ?? categoryId))
  }

  const hiddenNode = (side: 'in' | 'out') =>
    addCategoryNode(side, 'hidden', '其他', true, side === 'in' ? 'income' : 'expense').nodeId

  if (report.apiSankey) {
    // ── 后端逐账户分配 ───────────────────────────────────────────────────────
    // 账户身份直接来自 endpoint.id（acct:<accountId>）；仅合成节点（无真实 id）
    // 才按展示名在账本里定位，且同名仍拒绝猜测。
    const accountIdsByName = new Map<string, string[]>()
    for (const account of ledger.accounts) {
      const ids = accountIdsByName.get(account.name) ?? []
      ids.push(account.id)
      accountIdsByName.set(account.name, ids)
    }
    const accountIds = new Set(ledger.accounts.map((account) => account.id))
    const resolveAccountId = (endpoint: SankeyEndpoint): string | null => {
      const role = endpointRole(endpoint)
      if (!role.synthetic && accountIds.has(role.base)) return role.base
      if (role.synthetic) {
        const ids = accountIdsByName.get(endpoint.name)
        if (!ids || ids.length === 0) return null
        if (ids.length > 1) {
          categoryError.push(`账户「${endpoint.name}」同名且无法唯一定位`)
          return null
        }
        return ids[0]
      }
      return null
    }

    for (const link of apiLinks) {
      const amount = actualAmountOf(link)
      if (amount <= 0) continue
      const sourceEndpoint = endpointFor(link.source)
      const targetEndpoint = endpointFor(link.target)
      const source = endpointRole(sourceEndpoint)
      const target = endpointRole(targetEndpoint)

      if (source.role === 'account' && target.role === 'account') {
        const fromId = resolveAccountId(sourceEndpoint)
        const toId = resolveAccountId(targetEndpoint)
        if (!fromId || !toId) {
          categoryError.push(`账户「${!fromId ? sourceEndpoint.name : targetEndpoint.name}」无法在账本中定位`)
          continue
        }
        addAccountNode(fromId, sourceEndpoint.name)
        addAccountNode(toId, targetEndpoint.name)
        base.transferTotal += amount
        if (groupIndex.hideTransfers) {
          const hiddenOut = hiddenNode('out')
          const hiddenIn = hiddenNode('in')
          builder.addLink({
            sourceId: `acct:${fromId}`,
            targetId: hiddenOut,
            nodeId: hiddenOut,
            amount,
            tone: 'neutral',
            kind: 'flow',
            activity: null,
          })
          builder.addLink({
            sourceId: hiddenIn,
            targetId: `acct:${toId}`,
            nodeId: hiddenIn,
            amount,
            tone: 'neutral',
            kind: 'flow',
            activity: null,
          })
        } else {
          builder.addLink({
            sourceId: `acct:${fromId}`,
            targetId: `acct:${toId}`,
            nodeId: `acct:${fromId}`,
            amount,
            tone: 'neutral',
            kind: 'transfer',
            activity: null,
          })
        }
        continue
      }

      if (source.role === 'income' && target.role === 'account') {
        const accountId = resolveAccountId(targetEndpoint)
        if (!accountId) {
          categoryError.push(`账户「${targetEndpoint.name}」无法在账本中定位`)
          continue
        }
        addAccountNode(accountId, targetEndpoint.name)
        const node = resolveApiCategory(sourceEndpoint)
        builder.addLink({
          sourceId: node.nodeId,
          targetId: `acct:${accountId}`,
          nodeId: node.nodeId,
          amount,
          tone: 'income',
          kind: 'flow',
          activity: link.activity,
        })
        continue
      }

      if (source.role === 'account' && target.role === 'expense') {
        const accountId = resolveAccountId(sourceEndpoint)
        if (!accountId) {
          categoryError.push(`账户「${sourceEndpoint.name}」无法在账本中定位`)
          continue
        }
        addAccountNode(accountId, sourceEndpoint.name)
        const node = resolveApiCategory(targetEndpoint)
        builder.addLink({
          sourceId: `acct:${accountId}`,
          targetId: node.nodeId,
          nodeId: node.nodeId,
          amount,
          tone: 'expense',
          kind: 'flow',
          activity: link.activity,
        })
      }
    }

    // API 桑基不含对账修正；后端随报表带出平账流水，补一条独立修正流保持余额等式同口径。
    // 账户名来自 Ledger metadata；不再扫全量流水。
    for (const adjustment of report.adjustments ?? []) {
      if (adjustment.amount === 0) continue
      const account = ledger.accounts.find((item) => item.id === adjustment.accountId)
      if (!account || account.kind !== 'cash') continue
      addAccountNode(account.id, account.name)
      if (adjustment.amount > 0) {
        const side = 'in'
        const node = addCategoryNode(side, 'correction', '对账修正', hiddenForRoot(side, undefined), 'income')
        builder.addLink({
          sourceId: node.nodeId,
          targetId: `acct:${account.id}`,
          nodeId: node.nodeId,
          amount: adjustment.amount,
          tone: 'income',
          kind: 'flow',
          activity: null,
        })
        base.correction += adjustment.amount
      } else {
        const side = 'out'
        const node = addCategoryNode(side, 'correction', '对账修正', hiddenForRoot(side, undefined), 'expense')
        builder.addLink({
          sourceId: `acct:${account.id}`,
          targetId: node.nodeId,
          nodeId: node.nodeId,
          amount: -adjustment.amount,
          tone: 'expense',
          kind: 'flow',
          activity: null,
        })
        base.correction += -adjustment.amount
      }
    }
  }

  if (categoryError.length > 0) {
    return invalid(`桑基无法唯一定位：${categoryError[0]}。为避免把不同实体合并，本图已停画。`)
  }

  // ── 账户层与逐账户流量 ─────────────────────────────────────────────────
  const layer = accountLayer(ledger, includedAccounts, from, to)
  for (const runtime of layer.values()) {
    if (!builder.nodeMap.has(runtime.nodeId)) {
      // 没有流水但有余额的账户也要出现，才能承载期初 / 期末读数。
      builder.addNode({
        id: runtime.nodeId,
        name: runtime.account.name,
        layer: 1,
        tone: 'neutral',
        amount: 0,
        children: [],
        account: runtime.account,
      })
    }
  }
  // 账户层之外出现的账户（理论上不会）按 0 余额兜底。
  for (const accountId of includedAccounts) {
    const runtime = layer.get(accountId)
    if (!runtime) {
      const account = ledger.accounts.find((item) => item.id === accountId)
      if (!account) continue
      layer.set(accountId, {
        nodeId: `acct:${accountId}`,
        account: {
          id: account.id,
          name: account.name,
          opening: 0,
          closing: 0,
          inflow: 0,
          outflow: 0,
          transferIn: 0,
          transferOut: 0,
          difference: 0,
        },
      })
    }
  }

  const links = [...builder.linkMap.values()]
  const nodes = [...builder.nodeMap.values()]

  // 逐账户累计
  for (const link of links) {
    const source = nodes.find((node) => node.id === link.sourceId)
    const target = nodes.find((node) => node.id === link.targetId)
    if (!source || !target) continue
    const sourceAccount = source.layer === 1 ? layer.get(source.id.slice('acct:'.length)) : undefined
    const targetAccount = target.layer === 1 ? layer.get(target.id.slice('acct:'.length)) : undefined
    if (link.kind === 'transfer' && sourceAccount && targetAccount) {
      sourceAccount.account.transferOut += link.amount
      targetAccount.account.transferIn += link.amount
    } else {
      if (sourceAccount) sourceAccount.account.outflow += link.amount
      if (targetAccount) targetAccount.account.inflow += link.amount
    }
  }

  const accounts = [...layer.values()].map((runtime) => {
    const account = runtime.account
    account.difference =
      account.opening + account.inflow - account.outflow + account.transferIn - account.transferOut - account.closing
    return account
  })

  // 节点吞吐 = max(入, 出)；分类节点按单侧合计。
  for (const node of nodes) {
    if (node.layer === 1) {
      const account = layer.get(node.id.slice('acct:'.length))?.account
      if (!account) continue
      node.amount = Math.max(account.inflow + account.transferIn, account.outflow + account.transferOut)
      node.account = account
      node.children = accountChildren(node, builder.nodeMap, links)
    } else if (node.layer === 0) {
      node.amount = links.filter((link) => link.sourceId === node.id).reduce((sum, link) => sum + link.amount, 0)
      if (node.children.length === 0) {
        node.children = node.hiddenCount
          ? groupIndex.hiddenInChildren
          : groupIndex.inChildrenByRoot.get(nodeCategoryRootId(ledger, node)) ?? []
      }
    } else {
      node.amount = links.filter((link) => link.targetId === node.id).reduce((sum, link) => sum + link.amount, 0)
      if (node.children.length === 0) {
        node.children = node.hiddenCount
          ? groupIndex.hiddenOutChildren
          : groupIndex.outChildrenByRoot.get(nodeCategoryRootId(ledger, node)) ?? []
      }
    }
  }

  // 先回填活动再分组：排序键含活动类型，必须让同一组的成员继承组的行为一致。
  assignNodeActivities(nodes, links)
  finalizeGroups(nodes, endpointMap)

  const inflow = links
    .filter((link) => link.kind === 'flow' && nodes.find((node) => node.id === link.sourceId)?.layer === 0 && nodes.find((node) => node.id === link.targetId)?.layer === 1)
    .reduce((sum, link) => sum + link.amount, 0)
  const outflow = links
    .filter((link) => link.kind === 'flow' && nodes.find((node) => node.id === link.sourceId)?.layer === 1 && nodes.find((node) => node.id === link.targetId)?.layer === 2)
    .reduce((sum, link) => sum + link.amount, 0)

  const computedOpening = accounts.reduce((sum, account) => sum + account.opening, 0)
  const computedClosing = accounts.reduce((sum, account) => sum + account.closing, 0)
  const opening = report.openingCash !== undefined ? report.openingCash : computedOpening
  const closing = report.closingCash !== undefined ? report.closingCash : computedClosing

  const partial: CashSankey = {
    ...base,
    opening,
    closing,
    inflow,
    outflow,
    nodes,
    links,
    accounts,
  }

  const totalDifference = opening + inflow - outflow - closing
  partial.difference = totalDifference

  if (Math.abs(computedOpening - opening) > 1 || Math.abs(computedClosing - closing) > 1) {
    return {
      ...partial,
      status: 'invalid',
      reason: `现金流不守恒：逐账户期初 / 期末合计与报表现金不一致（期初差 ${money(computedOpening - opening)}，期末差 ${money(computedClosing - closing)}）。为避免误读，本图已停画。`,
    }
  }

  if (opening <= 0 || closing <= 0) {
    return {
      ...partial,
      status: 'invalid',
      reason: `期初或期末净额为负（期初 ${money(opening)}，期末 ${money(closing)}），三层桑基不适用；下方现金流表仍可查看。`,
    }
  }

  const accountBroken = assertAccountConservation(accounts)
  if (accountBroken) {
    return {
      ...partial,
      status: 'invalid',
      reason: `现金流不守恒：${accountBroken}。为避免误读，本图已停画。`,
    }
  }

  try {
    partial.difference = assertCashSankeyConservation(opening, inflow, outflow, closing)
  } catch {
    return {
      ...partial,
      status: 'invalid',
      reason: `现金流不守恒：期初 + 流入 − 流出 − 期末 = ${money(Math.abs(totalDifference))}。为避免误读，本图已停画。`,
    }
  }

  return partial
}

/**
 * 渐进式投影（纯函数）。把细图节点按展开集合折叠成组或保留成员，并重连 link。
 *
 * - 不修改任何合计字段（opening / closing / inflow / outflow / difference / accounts），
 *   守恒仍由细图 deriveCashSankey 保证；投影只改变「看到几个节点、怎么连线」。
 * - 组内互转（同一折叠组内的账户转账）折叠后成为自环，丢弃该连线；金额不丢，
 *   transferTotal 与逐账户等式都在细图统计，脚注照常显示转账总额。
 * - 展开只在原组内展开：组与成员共享 rank，成员按 memberIndex 排列，
 *   因此任意展开组合下其他节点的相对顺序都不变。
 */
export function projectCashSankey(
  data: CashSankey,
  expanded: ReadonlySet<string>,
): CashSankey {
  if (data.status !== 'ready') return data

  const groups = new Map<string, CashSankeyNode[]>()
  for (const node of data.nodes) {
    const key = node.groupId ?? `self:${node.id}`
    const list = groups.get(key) ?? []
    list.push(node)
    groups.set(key, list)
  }

  const redirect = new Map<string, string>()
  const displayNodes: CashSankeyNode[] = []
  for (const [groupId, members] of groups) {
    // 后端下发了 group 归属（groupId 非 self: 前缀）的**左右分类列**节点，无论成员
    // 多少都显示为一级组名：账户分类（投资 / 负债…）即使只有一个非现金账户，默认
    // 也应显示分类名，展开才看到账户名。中间账户列（layer 1）保留账户节点与读数；
    // self: 组是无分组归属的合成节点，保持原样。
    const hasGroup = !groupId.startsWith('self:')
    const foldSingle =
      hasGroup && members.length === 1 && members[0]!.layer !== 1
    // 可展开 = 真正有「一级 → 子级」层级可揭示：多成员组，或单成员但组名与成员名
    // 不同（账户分类 → 账户）。叶子一级分类后端也下发 group，但组名就是自身名，
    // 展开只会显示同一个节点，不算子类别，因此不可点击。
    const canExpand = hasGroup &&
      (members.length > 1 || members.some((member) => (member.groupName ?? member.name) !== member.name))
    const isExpanded = canExpand && expanded.has(groupId)
    if (isExpanded) {
      for (const member of members) {
        redirect.set(member.id, member.id)
        // 保留 expandable=true：成员仍可点击收起所在组。
        displayNodes.push({ ...member, isGroup: false, expandable: true })
      }
      continue
    }
    // 单成员且不折叠（合成节点 / 未分组账户 / 中间账户列）：原样保留账户读数等语义。
    if (members.length === 1 && !foldSingle) {
      redirect.set(members[0]!.id, members[0]!.id)
      displayNodes.push({ ...members[0]!, isGroup: false, expandable: false })
      continue
    }
    // 其余（多成员未展开，或分类列单成员带分组归属）：聚合成一级组节点。
    const ordered = members.slice().sort((left, right) => (left.memberIndex ?? 0) - (right.memberIndex ?? 0))
    const head = ordered[0]!
    const amount = members.reduce((sum, node) => sum + node.amount, 0)
    const children = members.flatMap((node) => node.children)
    // 组内活动统一才继承该色，混入多种活动退中性，避免组色误导为单一活动。
    const memberActivities = new Set(members.map((node) => node.activity ?? null))
    const groupActivity = memberActivities.size === 1 ? members[0]!.activity ?? null : null
    const groupNode: CashSankeyNode = {
      ...head,
      id: groupId,
      name: head.groupName ?? head.name,
      amount,
      children,
      isGroup: canExpand,
      expandable: canExpand,
      account: undefined,
      hiddenCount: undefined,
      activity: groupActivity,
    }
    for (const member of members) redirect.set(member.id, groupId)
    displayNodes.push(groupNode)
  }

  const linkMap = new Map<string, CashSankeyLink>()
  for (const link of data.links) {
    const sourceId = redirect.get(link.sourceId) ?? link.sourceId
    const targetId = redirect.get(link.targetId) ?? link.targetId
    // 折叠后两端落入同一节点：组内互转自环，不画（金额已在细图统计）。
    if (sourceId === targetId) continue
    const key = linkIdentity({ ...link, sourceId, targetId })
    const existing = linkMap.get(key)
    if (existing) {
      existing.amount += link.amount
      continue
    }
    const nodeId = redirect.get(link.nodeId) ?? link.nodeId
    linkMap.set(key, { ...link, id: key, sourceId, targetId, nodeId })
  }

  return { ...data, nodes: displayNodes, links: [...linkMap.values()] }
}
