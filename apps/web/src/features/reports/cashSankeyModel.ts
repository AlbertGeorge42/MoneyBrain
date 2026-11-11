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
import { minor } from '@domain/index'
import { formatCurrency } from '@/utils/format'
import type { Ledger, LedgerAccount, LedgerTransaction } from '@/features/overview/model'
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

const ACCOUNT_SUFFIX = '_cash'
const INCOME_SUFFIX = '_income'
const EXPENSE_SUFFIX = '_expense'
const NON_CASH_SOURCE_SUFFIX = '_ncs'
const NON_CASH_TARGET_SUFFIX = '_nct'

function money(value: number): string {
  return formatCurrency(minor(Math.round(value)))
}

function inRange(transaction: { date: string }, from: string, to: string): boolean {
  return transaction.date >= from && transaction.date <= to
}

function dayLabel(point: string): string {
  const [year, month, day] = point.split('-')
  return `${Number(year)} 年 ${Number(month)} 月 ${Number(day)} 日`
}

function effectiveFee(transaction: LedgerTransaction): number {
  return Math.max(Number(transaction.fee ?? 0), 0)
}

/** 期初余额日期晚于期间起点的现金账户（2026-10 失败态的已知原因）。 */
function lateOpeningCashAccounts(ledger: Ledger, from: string): LedgerAccount[] {
  return ledger.accounts.filter((account) => {
    if (account.kind !== 'cash' || typeof account.initialBalanceDate !== 'string') return false
    // API 返回 ISO 时间串（2026-10-31T00:00:00.000Z），只取本地日历日部分比较。
    return account.initialBalanceDate.slice(0, 10) > from
  })
}

function lateOpeningCause(ledger: Ledger, from: string): string | null {
  const accounts = lateOpeningCashAccounts(ledger, from)
  if (accounts.length === 0) return null
  const names = accounts.slice(0, 2).map((account) => `「${account.name}」`).join('、')
  const suffix = accounts.length > 2 ? ` 等 ${accounts.length} 个账户` : ''
  const openingDates = new Set<string>()
  for (const account of accounts) {
    openingDates.add(dayLabel(String(account.initialBalanceDate).slice(0, 10)))
  }
  const dates = [...openingDates].join('、')
  return `账户${names}${suffix}的期初余额日期（${dates}）晚于本期起始日 ${dayLabel(from)}，期初余额在期中才生效，期初前的流水未计入期初余额`
}

/**
 * 时点余额（逐账户）。`accountBalancesAt` 回放转账时只还原本金、不还原手续费，
 * 而当前余额已扣过手续费，所以把锚点之后的手续费补回转出账户。
 */
function balancesAt(ledger: Ledger, point: string): Map<string, number> {
  const balances = accountBalancesAt(ledger, point)
  for (const transaction of ledger.transactions) {
    if (transaction.type !== 'transfer' || transaction.date <= point) continue
    const fee = effectiveFee(transaction)
    if (fee <= 0) continue
    balances.set(transaction.accountId, (balances.get(transaction.accountId) ?? 0) + fee)
  }
  return balances
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
    const key = `${link.sourceId}>${link.targetId}|${link.kind}`
    const existing = linkMap.get(key)
    if (existing) {
      existing.amount += link.amount
      return
    }
    linkMap.set(key, { ...link, id: key })
  }
  return { nodeMap, linkMap, addNode, addLink }
}

/** 后端桑基只给分类名；按根分类名 / 叶子分类名都解析回账本里的根分类 id。 */
function categoryNodeId(
  ledger: Ledger,
  report: CashReport,
  side: 'in' | 'out',
  name: string,
): { id: string; name: string; error?: string } {
  const type = side === 'in' ? 'income' : 'expense'
  const roots = ledger.categories.filter((category) => !category.parentId && category.type === type)
  const exact = roots.filter((category) => category.name === name)
  if (exact.length === 1) return { id: exact[0].id, name: exact[0].name }
  if (exact.length > 1) {
    return { id: `cat:${side}:${name}`, name, error: `分类「${name}」同名且无法唯一定位` }
  }
  const groups = side === 'in' ? report.inflowGroups : report.outflowGroups
  const ids = new Set<string>()
  for (const group of groups) {
    for (const child of group.children) {
      if (child.label !== name) continue
      const root = rootOf(ledger, child.categoryId)
      if (root) ids.add(root.id)
    }
  }
  if (ids.size === 1) {
    const id = [...ids][0]
    const root = rootOf(ledger, id)
    return { id, name: root?.name ?? name }
  }
  if (ids.size > 1) {
    return { id: `cat:${side}:${name}`, name, error: `分类「${name}」同名且无法唯一定位` }
  }
  return { id: `cat:${side}:${name}`, name }
}

function nodeRole(
  name: string,
  declared: Map<string, 'income' | 'expense' | 'account'>,
): { role: 'income' | 'expense' | 'account'; base: string; synthetic: boolean } {
  const role = declared.get(name)
  if (role === 'account') return { role, base: stripSuffix(name), synthetic: false }
  if (role === 'income') {
    return { role, base: stripSuffix(name), synthetic: name.endsWith(NON_CASH_SOURCE_SUFFIX) }
  }
  if (role === 'expense') {
    return { role, base: stripSuffix(name), synthetic: name.endsWith(NON_CASH_TARGET_SUFFIX) }
  }
  if (name.endsWith(EXPENSE_SUFFIX)) {
    return { role: 'expense', base: name.slice(0, -EXPENSE_SUFFIX.length), synthetic: false }
  }
  if (name.endsWith(INCOME_SUFFIX)) {
    return { role: 'income', base: name.slice(0, -INCOME_SUFFIX.length), synthetic: false }
  }
  if (name.endsWith(ACCOUNT_SUFFIX)) {
    return { role: 'account', base: name.slice(0, -ACCOUNT_SUFFIX.length), synthetic: false }
  }
  if (name.endsWith(NON_CASH_SOURCE_SUFFIX)) {
    return { role: 'income', base: name.slice(0, -NON_CASH_SOURCE_SUFFIX.length), synthetic: true }
  }
  if (name.endsWith(NON_CASH_TARGET_SUFFIX)) {
    return { role: 'expense', base: name.slice(0, -NON_CASH_TARGET_SUFFIX.length), synthetic: true }
  }
  // 兜底：按来源理解，避免未识别节点被丢弃导致图不完整。
  return { role: 'income', base: name, synthetic: true }
}

function stripSuffix(name: string): string {
  for (const suffix of [EXPENSE_SUFFIX, INCOME_SUFFIX, ACCOUNT_SUFFIX, NON_CASH_SOURCE_SUFFIX, NON_CASH_TARGET_SUFFIX]) {
    if (name.endsWith(suffix)) return name.slice(0, -suffix.length)
  }
  return name
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
  const openingBalances = balancesAt(ledger, addDays(from, -1))
  const closingBalances = balancesAt(ledger, to)
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

  const declared = new Map<string, 'income' | 'expense' | 'account'>()
  for (const node of apiSankey.nodes) {
    const role =
      node.category === 'cash'
        ? ('account' as const)
        : node.category === 'income_category' || node.category === 'non_cash_source'
          ? ('income' as const)
          : node.category === 'expense_category' || node.category === 'non_cash_target'
            ? ('expense' as const)
            : null
    if (role) declared.set(node.name, role)
  }

  const idOf = (name: string): string => {
    const role = nodeRole(name, declared)
    if (role.role === 'account') return `acct:${name}`
    return `${role.role === 'income' ? 'in' : 'out'}:${role.base}`
  }
  const nodeMap = new Map<string, CashSankeyNode>()
  const ensureNode = (name: string): CashSankeyNode => {
    const role = nodeRole(name, declared)
    const id = idOf(name)
    const existing = nodeMap.get(id)
    if (existing) return existing
    const node: CashSankeyNode = {
      id,
      name: role.base,
      layer: role.role === 'account' ? 1 : role.role === 'income' ? 0 : 2,
      tone: role.role === 'account' ? 'neutral' : role.role,
      amount: 0,
      children: [],
    }
    nodeMap.set(id, node)
    return node
  }

  const links: CashSankeyLink[] = []
  let transferTotal = 0
  for (const link of apiSankey.links) {
    if (link.value <= 0) continue
    const source = nodeRole(link.source, declared)
    const target = nodeRole(link.target, declared)
    const sourceId = ensureNode(link.source).id
    const targetId = ensureNode(link.target).id
    const kind = source.role === 'account' && target.role === 'account' ? ('transfer' as const) : ('flow' as const)
    if (kind === 'transfer') transferTotal += link.value
    links.push({
      id: `${sourceId}>${targetId}|${kind}`,
      sourceId,
      targetId,
      nodeId: source.role === 'income' ? sourceId : target.role === 'expense' ? targetId : sourceId,
      amount: link.value,
      tone: source.role === 'income' ? 'income' : target.role === 'expense' ? 'expense' : 'neutral',
      kind,
    })
  }

  const nodes = [...nodeMap.values()]
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
        const key = root?.name ?? child.categoryId
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
      node.children = inChildren.get(node.name) ?? []
    } else {
      node.amount = links.filter((link) => link.targetId === node.id).reduce((sum, link) => sum + link.amount, 0)
      node.children = outChildren.get(node.name) ?? []
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
  const apiLinks = report.apiSankey?.links ?? []
  const hasTransfers = apiLinks.some(
    (link) => link.source.endsWith(ACCOUNT_SUFFIX) && link.target.endsWith(ACCOUNT_SUFFIX),
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

  const resolveApiCategory = (
    side: 'in' | 'out',
    name: string,
    synthetic: boolean,
  ): { nodeId: string } => {
    if (synthetic) {
      const prefix = side === 'in' ? 'in:ncs' : 'out:nct'
      return addCategoryNode(side, `${prefix}:${name}`, name, false, 'neutral')
    }
    const resolved = categoryNodeId(ledger, report, side, name)
    if (resolved.error) categoryError.push(resolved.error)
    return addCategoryNode(side, resolved.id, resolved.name, hiddenForRoot(side, resolved.id))
  }

  const hiddenNode = (side: 'in' | 'out') =>
    addCategoryNode(side, 'hidden', '其他', true, side === 'in' ? 'income' : 'expense').nodeId

  if (report.apiSankey) {
    // ── 后端逐账户分配 ───────────────────────────────────────────────────────
    const accountIdsByName = new Map<string, string[]>()
    for (const account of ledger.accounts) {
      const ids = accountIdsByName.get(account.name) ?? []
      ids.push(account.id)
      accountIdsByName.set(account.name, ids)
    }
    const resolveAccountId = (name: string): string | null => {
      const ids = accountIdsByName.get(name)
      if (!ids || ids.length === 0) return null
      if (ids.length > 1) {
        categoryError.push(`账户「${name}」同名且无法唯一定位`)
        return null
      }
      return ids[0]
    }

    const declared = new Map<string, 'income' | 'expense' | 'account'>()
    for (const node of report.apiSankey.nodes) {
      const role =
        node.category === 'cash'
          ? ('account' as const)
          : node.category === 'income_category' || node.category === 'non_cash_source'
            ? ('income' as const)
            : node.category === 'expense_category' || node.category === 'non_cash_target'
              ? ('expense' as const)
              : null
      if (role) declared.set(node.name, role)
    }

    for (const link of apiLinks) {
      const amount = actualAmountOf(link)
      if (amount <= 0) continue
      const source = nodeRole(link.source, declared)
      const target = nodeRole(link.target, declared)

      if (source.role === 'account' && target.role === 'account') {
        const fromId = resolveAccountId(source.base)
        const toId = resolveAccountId(target.base)
        if (!fromId || !toId) {
          categoryError.push(`账户「${!fromId ? source.base : target.base}」无法在账本中定位`)
          continue
        }
        addAccountNode(fromId, source.base)
        addAccountNode(toId, target.base)
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
          })
          builder.addLink({
            sourceId: hiddenIn,
            targetId: `acct:${toId}`,
            nodeId: hiddenIn,
            amount,
            tone: 'neutral',
            kind: 'flow',
          })
        } else {
          builder.addLink({
            sourceId: `acct:${fromId}`,
            targetId: `acct:${toId}`,
            nodeId: `acct:${fromId}`,
            amount,
            tone: 'neutral',
            kind: 'transfer',
          })
        }
        continue
      }

      if (source.role === 'income' && target.role === 'account') {
        const accountId = resolveAccountId(target.base)
        if (!accountId) {
          categoryError.push(`账户「${target.base}」无法在账本中定位`)
          continue
        }
        addAccountNode(accountId, target.base)
        const node = resolveApiCategory('in', source.base, source.synthetic)
        builder.addLink({
          sourceId: node.nodeId,
          targetId: `acct:${accountId}`,
          nodeId: node.nodeId,
          amount,
          tone: 'income',
          kind: 'flow',
        })
        continue
      }

      if (source.role === 'account' && target.role === 'expense') {
        const accountId = resolveAccountId(source.base)
        if (!accountId) {
          categoryError.push(`账户「${source.base}」无法在账本中定位`)
          continue
        }
        addAccountNode(accountId, source.base)
        const node = resolveApiCategory('out', target.base, target.synthetic)
        builder.addLink({
          sourceId: `acct:${accountId}`,
          targetId: node.nodeId,
          nodeId: node.nodeId,
          amount,
          tone: 'expense',
          kind: 'flow',
        })
      }
    }

    // API 桑基不含对账修正；用账本补一条独立修正流，保持与余额等式同口径。
    for (const transaction of ledger.transactions) {
      if (transaction.type !== 'adjustment' || !inRange(transaction, from, to) || transaction.amount === 0) continue
      const account = ledger.accounts.find((item) => item.id === transaction.accountId)
      if (!account || account.kind !== 'cash') continue
      addAccountNode(account.id, account.name)
      const root = rootOf(ledger, transaction.categoryId)
      if (transaction.amount > 0) {
        const side = 'in'
        const node = addCategoryNode(side, 'correction', '对账修正', hiddenForRoot(side, root?.id), 'income')
        builder.addLink({
          sourceId: node.nodeId,
          targetId: `acct:${account.id}`,
          nodeId: node.nodeId,
          amount: transaction.amount,
          tone: 'income',
          kind: 'flow',
        })
        base.correction += transaction.amount
      } else {
        const side = 'out'
        const node = addCategoryNode(side, 'correction', '对账修正', hiddenForRoot(side, root?.id), 'expense')
        builder.addLink({
          sourceId: `acct:${account.id}`,
          targetId: node.nodeId,
          nodeId: node.nodeId,
          amount: -transaction.amount,
          tone: 'expense',
          kind: 'flow',
        })
        base.correction += -transaction.amount
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
          : groupIndex.inChildrenByRoot.get(node.id.slice(3)) ?? []
      }
    } else {
      node.amount = links.filter((link) => link.targetId === node.id).reduce((sum, link) => sum + link.amount, 0)
      if (node.children.length === 0) {
        node.children = node.hiddenCount
          ? groupIndex.hiddenOutChildren
          : groupIndex.outChildrenByRoot.get(node.id.slice(4)) ?? []
      }
    }
  }

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
    const cause = lateOpeningCause(ledger, from)
    return {
      ...partial,
      status: 'invalid',
      reason: cause
        ? `现金流不守恒：${cause}（逐账户期初合计 ${money(computedOpening)}，后端期初 ${money(opening)}；期初 + 流入 − 流出 − 期末 = ${money(Math.abs(totalDifference))}）。为避免误读，本图已停画；请先调整账户期初余额日期。`
        : `现金流不守恒：逐账户期初 / 期末合计与报表现金不一致（期初差 ${money(computedOpening - opening)}，期末差 ${money(computedClosing - closing)}）。为避免误读，本图已停画。`,
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
    const cause = lateOpeningCause(ledger, from)
    const amount = money(Math.abs(totalDifference))
    return {
      ...partial,
      status: 'invalid',
      reason: cause
        ? `现金流不守恒：${cause}（期初 + 流入 − 流出 − 期末 = ${amount}）。为避免误读，本图已停画；请先调整账户期初余额日期。`
        : `现金流不守恒：期初 + 流入 − 流出 − 期末 = ${amount}。为避免误读，本图已停画。`,
    }
  }

  return partial
}
