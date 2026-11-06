/**
 * 报表数据模型（HF 批次 3）
 *
 * 四张报表共用同一套派生口径：时点看余额、期间看发生额。
 * 所有金额仍是整数分；展示层再经 formatCurrency。
 * 这里不放任何 UI 文案模板，表格与下钻只消费结构化结果。
 */
import { minor } from '@domain/index'
import { formatCurrency, formatPercent } from '@/utils/format'
import {
  accountKindLabel,
  deriveNetWorthTrend,
  getCategory,
  getCategoryRootId,
  refundOffsetSide,
  TODAY,
  type Ledger,
  type LedgerAccount,
  type LedgerCategory,
  type LedgerTransaction,
  type TrendPoint,
  type TxType,
} from '@/features/overview/model'
import { bucketKey, listBuckets, type Granularity } from './reportsTime'
import type { ReportRow } from './ReportTable'
import type { CashFlowReportData } from '@/services/api'

export interface ReportMetric {
  label: string
  value: string
  tone?: 'income' | 'expense' | 'neutral'
  /** 紧贴标签的极短口径标记，不新增说明行。 */
  hint?: string
}

export interface FlowTreeNode {
  id: string
  name: string
  amount: number
  count: number
  share: number
  level: 0 | 1
  children: FlowTreeNode[]
  /** 卡片合并「其他」时记录被并入的根分类，用于同口径下钻。 */
  mergedIds?: string[]
}

export interface FlowReport {
  income: number
  expense: number
  balance: number
  savingsRate: number
  incomeTrees: FlowTreeNode[]
  expenseTrees: FlowTreeNode[]
  series: { label: string; income: number; expense: number }[]
  metrics: ReportMetric[]
}

export interface BalanceRow {
  id: string
  name: string
  kind: string
  amount: number
}

export interface BalanceReport {
  point: string
  assets: BalanceRow[]
  liabilities: BalanceRow[]
  assetTotal: number
  liabilityTotal: number
  netWorth: number
  equity: number
  equityTotal: number
  /** 余额为 0、未在明细中列出的账户数（覆盖规则：只列余额 ≠ 0 的账户）。 */
  zeroAccountCount: number
  /** 正余额资产合计（资产构成的环内合计与投资占比的分母）。 */
  positiveAssetTotal: number
  /** 负余额资产合计（负数），未计入正余额口径。 */
  negativeAssetTotal: number
  negativeAssetCount: number
  composition: { id: string; name: string; amount: number; share: number }[]
  trend: TrendPoint[]
  metrics: ReportMetric[]
}

/**
 * 资产构成环：与资产负债表同一份 `groupMode` 决定切块口径。
 * - `account`：每个资产账户一块，点击落流水账户筛选；
 * - `kind`：按账户性质合并（储蓄 / 现金等价 / 投资 / 信用），点击打开该性质的账户抽屉。
 * 这里只产出环与图例共用的根节点；性质抽屉的账户明细仍来自 `report.assets`。
 */
export function buildAssetComposition(rows: BalanceRow[], mode: 'account' | 'kind'): FlowTreeNode[] {
  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  const shareOf = (amount: number) => (total > 0 ? (amount / total) * 100 : 0)
  if (mode === 'account') {
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      amount: row.amount,
      count: 1,
      share: shareOf(row.amount),
      level: 0 as const,
      children: [],
    }))
  }
  const buckets = new Map<string, { amount: number; count: number }>()
  for (const row of rows) {
    const group = buckets.get(row.kind) ?? { amount: 0, count: 0 }
    group.amount += row.amount
    group.count += 1
    buckets.set(row.kind, group)
  }
  return [...buckets.entries()]
    .map(([kind, group]) => ({
      id: `kind:${kind}`,
      name: kind,
      amount: group.amount,
      count: group.count,
      share: shareOf(group.amount),
      level: 0 as const,
      children: [],
    }))
    .sort((left, right) => right.amount - left.amount)
}

export interface CashChild {
  id: string
  label: string
  account: string
  amount: number
  tone: 'income' | 'expense' | 'transfer'
  /** 下钻到流水时按分类精确复现同一组（合并「其余」时取并集）。 */
  categoryId: string
}

export interface CashGroup {
  key: string
  name: string
  total: number
  count: number
  children: CashChild[]
}

export interface CashReport {
  period: { from: string; to: string }
  inflowGroups: CashGroup[]
  outflowGroups: CashGroup[]
  inflowTotal: number
  outflowTotal: number
  operatingNet: number
  investingNet: number
  financingNet: number
  closingCash: number
  /**
   * API 模式：后端三层桑基的节点 / link；种子模式为空，由桑基模型按流水推导。
   */
  apiSankey?: CashFlowReportData['sankey']
  /**
   * API 模式：后端口径的期初现金（现金等价账户）。
   * 种子模式没有该字段，桑基仍用全账户净额回放。
   */
  openingCash?: number
  /**
   * 后端现金流分组已包含对账修正与手续费；桑基不能再补一次，否则会重复计。
   */
  correctionsIncluded?: boolean
  /**
   * 毛流入 / 毛流出（按活动净值正负拆分）。退款冲减流入时，
   * 后端 `cashInflow` 是净流入，而桑基中间层按毛额画；两者差一笔冲减，
   * 用毛额才能保证「节点合计 = 桑基流入 / 流出」。
   */
  inflowGross?: number
  outflowGross?: number
  metrics: ReportMetric[]
  /** 三处口径对账所需明细；不改业务规则，只把差异显式列出。 */
  reconcile: {
    flowIncome: number
    flowExpense: number
    flowBalance: number
    adjustmentExpense: number
    transferFee: number
    difference: number
  }
}

export interface InvestmentAllocation {
  id: string
  name: string
  current: number
  ratio: number
  target: number
  deviation: number
  rebalance: number
}

export interface InvestmentSnapshot {
  date: string
  total: number
  net: number
  periodReturn: number | null
}

export interface InvestmentHolding {
  id: string
  name: string
  marketValue: number
  cost: number
  gain: number
  rate: number
}

export interface InvestmentHoldingGroup extends InvestmentHolding {
  children: InvestmentHolding[]
}

export interface InvestmentReport {
  total: number
  allocation: InvestmentAllocation[]
  snapshots: InvestmentSnapshot[]
  holdings: InvestmentHoldingGroup[]
  costTotal: number
  gainTotal: number
  cumulativeReturn: number
  xirr: number | null
  twr: number | null
  metrics: ReportMetric[]
  trend: TrendPoint[]
}

const CASH_GROUPS = ['经营', '投资', '筹资', '未分类', '账户间转账'] as const
const INVEST_WEIGHTS = { 股票: 0.53, 基金: 0.3, 债券: 0.17 } as const
const INVEST_TARGETS = { 股票: 0.55, 基金: 0.3, 债券: 0.15 } as const
const SNAPSHOT_TOTALS = [7_120_000, 7_480_000, 7_910_000, 8_080_000, 8_350_000] as const
const SNAPSHOT_NETS = [0, 120_000, 100_000, 0, 80_000, 0] as const
const SNAPSHOT_DATES = [
  '2026-05-31',
  '2026-06-30',
  '2026-07-31',
  '2026-08-31',
  '2026-09-30',
  TODAY,
] as const

function inRange(transaction: LedgerTransaction, from: string, to: string): boolean {
  return transaction.date >= from && transaction.date <= to
}

/**
 * 收支口径：退款不计收入，只冲减原交易一侧；未关联退款只影响余额。
 * 现金流口径（isCashInflow）是另一套：看真实现金移动，用于桑基守恒。
 */
function isIncomeSide(transaction: LedgerTransaction): boolean {
  return transaction.type === 'income'
}

function isCashInflow(transaction: LedgerTransaction): boolean {
  if (transaction.type === 'income') return true
  if (transaction.type === 'refund') return refundOffsetSide(transaction) !== 'income'
  return false
}

function isCashOutflow(transaction: LedgerTransaction): boolean {
  if (transaction.type === 'expense' || transaction.type === 'transfer') return true
  return transaction.type === 'refund' && refundOffsetSide(transaction) === 'income'
}

function adjustmentExpense(transaction: LedgerTransaction): number {
  return transaction.type === 'adjustment' && transaction.amount < 0 ? -transaction.amount : 0
}

function flowTrees(
  ledger: Ledger,
  transactions: LedgerTransaction[],
  side: 'income' | 'expense',
): FlowTreeNode[] {
  const allowed: TxType[] = side === 'income' ? ['income'] : ['expense']
  const roots = ledger.categories.filter((category) => !category.parentId && allowed.includes(category.type))
  const childrenOf = new Map<string, LedgerCategory[]>()
  for (const category of ledger.categories) {
    if (!category.parentId) continue
    const list = childrenOf.get(category.parentId) ?? []
    list.push(category)
    childrenOf.set(category.parentId, list)
  }

  const rootOf = (categoryId: string): string => {
    const category = getCategory(ledger, categoryId)
    if (!category) return categoryId
    if (!category.parentId) return category.id
    return getCategoryRootId(ledger, categoryId)
  }

  const own = new Map<string, { amount: number; count: number }>()
  for (const transaction of transactions) {
    const offset = refundOffsetSide(transaction)
    let amount = 0
    if (side === 'income') {
      if (transaction.type === 'income') amount = Math.abs(transaction.amount)
      else if (offset === 'income') amount = -Math.abs(transaction.amount)
      else continue
    } else {
      if (transaction.type === 'expense') amount = Math.abs(transaction.amount)
      else if (offset === 'expense') amount = -Math.abs(transaction.amount)
      else if (adjustmentExpense(transaction) > 0) amount = adjustmentExpense(transaction)
      else continue
    }
    const key = transaction.categoryId
    const entry = own.get(key) ?? { amount: 0, count: 0 }
    entry.amount += amount
    entry.count += 1
    own.set(key, entry)
  }

  const subtree = (categoryId: string): string[] => {
    const ids = [categoryId]
    const queue = [categoryId]
    while (queue.length) {
      const current = queue.shift() as string
      for (const child of childrenOf.get(current) ?? []) {
        ids.push(child.id)
        queue.push(child.id)
      }
    }
    return ids
  }

  const totals = new Map<string, { amount: number; count: number }>()
  for (const [categoryId, entry] of own) {
    const rootId = rootOf(categoryId)
    const total = totals.get(rootId) ?? { amount: 0, count: 0 }
    total.amount += entry.amount
    total.count += entry.count
    totals.set(rootId, total)
  }

  const total = [...totals.values()].reduce((sum, item) => sum + item.amount, 0)

  const nodeOf = (category: LedgerCategory, level: 0 | 1): FlowTreeNode => {
    const ids = subtree(category.id)
    const amount = ids.reduce((sum, id) => sum + (own.get(id)?.amount ?? 0), 0)
    const count = ids.reduce((sum, id) => sum + (own.get(id)?.count ?? 0), 0)
    const children = (childrenOf.get(category.id) ?? [])
      .map((child) => nodeOf(child, 1))
      .filter((child) => child.amount > 0)
      .sort((left, right) => right.amount - left.amount)
    return {
      id: category.id,
      name: category.name,
      amount,
      count,
      share: total === 0 ? 0 : (amount / total) * 100,
      level,
      children,
    }
  }

  const rootNodes = roots
    .map((category) => nodeOf(category, 0))
    .filter((node) => node.amount > 0)
    .sort((left, right) => right.amount - left.amount)

  // 交易分类可能缺少父级（历史数据），兜底并入「未分类」，避免报表出现空洞
  const knownRoots = new Set(roots.map((root) => root.id))
  const orphans = [...totals.keys()].filter((rootId) => !knownRoots.has(rootId))
  for (const orphanId of orphans) {
    const entry = totals.get(orphanId) ?? { amount: 0, count: 0 }
    rootNodes.push({
      id: orphanId,
      name: getCategory(ledger, orphanId)?.name ?? '未分类',
      amount: entry.amount,
      count: entry.count,
      share: total === 0 ? 0 : (entry.amount / total) * 100,
      level: 0,
      children: [],
    })
  }
  rootNodes.sort((left, right) => right.amount - left.amount)

  return rootNodes
}

export function deriveFlowReport(ledger: Ledger, from: string, to: string, gran: Granularity): FlowReport {
  const transactions = ledger.transactions.filter((transaction) => inRange(transaction, from, to))
  let income = 0
  let expense = 0
  for (const transaction of transactions) {
    const offset = refundOffsetSide(transaction)
    if (isIncomeSide(transaction)) income += Math.abs(transaction.amount)
    if (offset === 'income') income -= Math.abs(transaction.amount)
    if (transaction.type === 'expense') expense += Math.abs(transaction.amount)
    if (offset === 'expense') expense -= Math.abs(transaction.amount)
    expense += adjustmentExpense(transaction)
  }
  const balance = income - expense
  const savingsRate = income === 0 ? 0 : (balance / income) * 100

  const series = listBuckets(from, to, gran).map((bucket) => {
    let bucketIncome = 0
    let bucketExpense = 0
    for (const transaction of transactions) {
      if (bucketKey(transaction.date, gran) !== bucketKey(bucket.key, gran)) continue
      const offset = refundOffsetSide(transaction)
      if (isIncomeSide(transaction)) bucketIncome += Math.abs(transaction.amount)
      if (offset === 'income') bucketIncome -= Math.abs(transaction.amount)
      if (transaction.type === 'expense') bucketExpense += Math.abs(transaction.amount)
      if (offset === 'expense') bucketExpense -= Math.abs(transaction.amount)
      bucketExpense += adjustmentExpense(transaction)
    }
    return { label: bucket.label, income: bucketIncome, expense: bucketExpense }
  })

  return {
    income,
    expense,
    balance,
    savingsRate,
    incomeTrees: flowTrees(ledger, transactions, 'income'),
    expenseTrees: flowTrees(ledger, transactions, 'expense'),
    series,
    metrics: [
      {
        label: '本期结余',
        value: signedCurrency(balance),
        tone: balance >= 0 ? 'income' : 'expense',
      },
      { label: '本期收入', value: `+${currency(income)}`, tone: 'income' },
      { label: '本期支出', value: `−${currency(expense)}`, tone: 'expense' },
      { label: '储蓄率', value: formatPercent(savingsRate, 1, false) },
    ],
  }
}

export function accountBalancesAt(ledger: Ledger, point: string): Map<string, number> {
  const balances = new Map(ledger.accounts.map((account) => [account.id, account.balance]))
  // 当前余额是「全部交易之后」的快照；回放锚点之后的交易得到历史时点余额。
  for (const transaction of ledger.transactions) {
    if (transaction.date <= point) continue
    const amount = Math.abs(transaction.amount)
    if (transaction.type === 'expense') {
      balances.set(transaction.accountId, (balances.get(transaction.accountId) ?? 0) + amount)
    } else if (transaction.type === 'income') {
      balances.set(transaction.accountId, (balances.get(transaction.accountId) ?? 0) - amount)
    } else if (transaction.type === 'refund') {
      // 收入退款是钱退回去（余额减少）；支出退款与未关联退款是余额增加。
      const delta = refundOffsetSide(transaction) === 'income' ? amount : -amount
      balances.set(transaction.accountId, (balances.get(transaction.accountId) ?? 0) + delta)
    } else if (transaction.type === 'adjustment') {
      balances.set(transaction.accountId, (balances.get(transaction.accountId) ?? 0) - transaction.amount)
    } else if (transaction.type === 'transfer') {
      balances.set(transaction.accountId, (balances.get(transaction.accountId) ?? 0) + amount)
      if (transaction.toAccountId) {
        balances.set(transaction.toAccountId, (balances.get(transaction.toAccountId) ?? 0) - amount)
      }
    }
  }
  return balances
}

export function deriveBalanceReport(ledger: Ledger, point: string): BalanceReport {
  const balances = accountBalancesAt(ledger, point)
  const accounts: (LedgerAccount & { pointBalance: number })[] = ledger.accounts.map((account) => ({
    ...account,
    pointBalance: balances.get(account.id) ?? account.balance,
  }))
  const assets = accounts
    .filter((account) => account.pointBalance > 0)
    .map((account) => ({
      id: account.id,
      name: account.name,
      kind: accountKindLabel(account.kind),
      amount: account.pointBalance,
    }))
  const liabilities = accounts
    .filter((account) => account.pointBalance < 0)
    .map((account) => ({
      id: account.id,
      name: account.name,
      kind: accountKindLabel(account.kind),
      amount: -account.pointBalance,
    }))
  const assetTotal = assets.reduce((sum, row) => sum + row.amount, 0)
  const liabilityTotal = liabilities.reduce((sum, row) => sum + row.amount, 0)
  const netWorth = assetTotal - liabilityTotal

  const kindTotals = new Map<string, number>()
  for (const account of accounts) {
    if (account.pointBalance <= 0) continue
    kindTotals.set(account.kind, (kindTotals.get(account.kind) ?? 0) + account.pointBalance)
  }
  const composition = [...kindTotals.entries()]
    .map(([kind, amount]) => ({
      id: kind,
      name: accountKindLabel(kind as LedgerAccount['kind']),
      amount,
      share: assetTotal === 0 ? 0 : (amount / assetTotal) * 100,
    }))
    .sort((left, right) => right.amount - left.amount)

  return {
    point,
    assets,
    liabilities,
    assetTotal,
    liabilityTotal,
    netWorth,
    equity: netWorth,
    equityTotal: liabilityTotal + netWorth,
    composition,
    trend: deriveNetWorthTrend(netWorth),
    metrics: [
      { label: '净资产', value: currency(netWorth) },
      { label: '总资产', value: currency(assetTotal) },
      { label: '总负债', value: currency(liabilityTotal), tone: liabilityTotal > 0 ? 'expense' : 'neutral' },
      {
        label: '流动资产',
        value: currency(
          accounts
            .filter((account) => account.kind === 'cash' && account.pointBalance > 0)
            .reduce((sum, account) => sum + account.pointBalance, 0),
        ),
      },
    ],
  }
}

function cashGroupOf(categoryId: string, type: TxType, ledger: Ledger): (typeof CASH_GROUPS)[number] {
  if (type === 'transfer') return '账户间转账'
  const category = getCategory(ledger, categoryId)
  if (!category) return '未分类'
  if (category.name === '理财收益' || category.name === '投资') return '投资'
  if (category.name === '筹资' || category.name === '借款') return '筹资'
  return '经营'
}

function groupCash(
  ledger: Ledger,
  transactions: LedgerTransaction[],
  direction: 'in' | 'out',
): CashGroup[] {
  const groups = new Map<string, CashGroup>()
  for (const transaction of transactions) {
    const groupName = cashGroupOf(transaction.categoryId, transaction.type, ledger)
    const group = groups.get(groupName) ?? { key: groupName, name: groupName, total: 0, count: 0, children: [] }
    const amount = Math.abs(transaction.amount)
    group.total += amount
    group.count += 1
    group.children.push({
      id: transaction.id,
      label: `${getCategory(ledger, transaction.categoryId)?.name ?? '未分类'}${transaction.note ? ` · ${transaction.note}` : ''}`,
      account: ledger.accounts.find((account) => account.id === transaction.accountId)?.name ?? '—',
      amount,
      tone:
        direction === 'in' ? 'income' : transaction.type === 'transfer' ? 'transfer' : 'expense',
      categoryId: transaction.categoryId,
    })
    groups.set(groupName, group)
  }
  return CASH_GROUPS.filter((name) => groups.has(name)).map((name) => groups.get(name) as CashGroup)
}

/** 现金流左右两表的行：键带方向前缀，两表共用一份 folded 也不串扰。 */
export function cashRowsFor(
  side: 'in' | 'out',
  groups: CashGroup[],
  folded: Record<string, boolean>,
  onFold: (id: string) => void,
): ReportRow[] {
  const foldKey = (id: string) => `${side}:${id}`
  const rows: ReportRow[] = []
  for (const group of groups) {
    const key = foldKey(group.key)
    const expanded = folded[key] !== false
    rows.push({
      id: key,
      cells: [group.name, `${group.count} 笔`, currency(group.total)],
      fold: group.children.length > 0 ? { expanded, onToggle: () => onFold(key) } : undefined,
    })
    if (expanded) {
      for (const child of group.children) {
        rows.push({
          id: foldKey(child.id),
          level: 1,
          cells: [child.label, child.account, currency(child.amount)],
          tone: child.tone,
        })
      }
    }
  }
  return rows
}

export function deriveCashReport(ledger: Ledger, from: string, to: string): CashReport {
  const transactions = ledger.transactions.filter((transaction) => inRange(transaction, from, to))
  // 现金流表看真实现金移动：支出退款/未关联退款是流入，收入退款是流出。
  const inflow = transactions.filter(isCashInflow)
  const outflow = transactions.filter(isCashOutflow)
  const inflowGroups = groupCash(ledger, inflow, 'in')
  const outflowGroups = groupCash(ledger, outflow, 'out')
  const inflowTotal = inflowGroups.reduce((sum, group) => sum + group.total, 0)
  const outflowTotal = outflowGroups.reduce((sum, group) => sum + group.total, 0)

  const netOf = (name: (typeof CASH_GROUPS)[number]) => {
    const inSum = inflowGroups.find((group) => group.name === name)?.total ?? 0
    const outSum = outflowGroups.find((group) => group.name === name)?.total ?? 0
    return inSum - outSum
  }

  const balances = accountBalancesAt(ledger, to)
  const closingCash = ledger.accounts
    .filter((account) => account.kind === 'cash')
    .reduce((sum, account) => sum + (balances.get(account.id) ?? account.balance), 0)

  // 与收支明细对账：调整只计支出侧、手续费两边净额都不计，差异必须显式可见。
  const flowIncome = transactions.reduce((sum, transaction) => {
    if (isIncomeSide(transaction)) return sum + Math.abs(transaction.amount)
    if (refundOffsetSide(transaction) === 'income') return sum - Math.abs(transaction.amount)
    return sum
  }, 0)
  const flowExpense = transactions.reduce((sum, transaction) => {
    let amount = transaction.type === 'expense' ? Math.abs(transaction.amount) : 0
    if (refundOffsetSide(transaction) === 'expense') amount -= Math.abs(transaction.amount)
    return sum + amount + adjustmentExpense(transaction)
  }, 0)
  const adjustmentTotal = transactions.reduce(
    (sum, transaction) => sum + adjustmentExpense(transaction),
    0,
  )
  const transferFee = transactions
    .filter((transaction) => transaction.type === 'transfer')
    .reduce((sum, transaction) => sum + Number(transaction.fee ?? 0), 0)
  const flowBalance = flowIncome - flowExpense
  const operatingNet = netOf('经营')

  return {
    period: { from, to },
    inflowGroups,
    outflowGroups,
    inflowTotal,
    outflowTotal,
    operatingNet,
    investingNet: netOf('投资'),
    financingNet: netOf('筹资'),
    closingCash,
    reconcile: {
      flowIncome,
      flowExpense,
      flowBalance,
      adjustmentExpense: adjustmentTotal,
      transferFee,
      difference: operatingNet - flowBalance,
    },
    metrics: [
      { label: '期末现金总量', value: currency(closingCash) },
      {
        label: '经营净额',
        value: signedCurrency(netOf('经营')),
        tone: netOf('经营') >= 0 ? 'income' : 'expense',
        // 与收支明细结余的差额来自对账修正；只用金额角标说明，不恢复对账表。
        hint: adjustmentTotal > 0 ? `不含修正 ${currency(adjustmentTotal)}` : undefined,
      },
      { label: '投资净额', value: signedCurrency(netOf('投资')), tone: netOf('投资') >= 0 ? 'income' : 'expense' },
      { label: '筹资净额', value: signedCurrency(netOf('筹资')), tone: netOf('筹资') >= 0 ? 'income' : 'expense' },
    ],
  }
}

function xnpv(rate: number, flows: { date: string; amount: number }[]): number {
  if (!flows.length) return 0
  const start = Date.parse(`${flows[0].date}T00:00:00Z`)
  return flows.reduce((sum, flow) => {
    const days = (Date.parse(`${flow.date}T00:00:00Z`) - start) / 86_400_000
    return sum + flow.amount / Math.pow(1 + rate, days / 365)
  }, 0)
}

/** XIRR：牛顿迭代；无解返回 null（界面显示「—」而不是编一个数）。 */
export function xirr(flows: { date: string; amount: number }[]): number | null {
  if (flows.length < 2) return null
  const positive = flows.some((flow) => flow.amount > 0)
  const negative = flows.some((flow) => flow.amount < 0)
  if (!positive || !negative) return null
  let rate = 0.1
  for (let index = 0; index < 60; index += 1) {
    const value = xnpv(rate, flows)
    const derivative = (xnpv(rate + 0.0001, flows) - xnpv(rate - 0.0001, flows)) / 0.0002
    if (!Number.isFinite(value) || !Number.isFinite(derivative) || derivative === 0) return null
    const next = rate - value / derivative
    if (!Number.isFinite(next)) return null
    if (Math.abs(next - rate) < 0.000001) return next
    rate = next
  }
  return rate
}

function investmentAccounts(ledger: Ledger): LedgerAccount[] {
  return ledger.accounts.filter((account) => account.kind === 'investment')
}

export function deriveInvestmentReport(ledger: Ledger): InvestmentReport {
  const accounts = investmentAccounts(ledger)
  const total = accounts.reduce((sum, account) => sum + account.balance, 0)
  const classes = (Object.keys(INVEST_WEIGHTS) as (keyof typeof INVEST_WEIGHTS)[]).map((name) => {
    const current = Math.round(total * INVEST_WEIGHTS[name])
    const target = INVEST_TARGETS[name]
    const ratio = total === 0 ? 0 : (current / total) * 100
    const targetAmount = target * total
    return {
      id: name,
      name,
      current,
      ratio,
      target: target * 100,
      deviation: ratio - target * 100,
      rebalance: targetAmount - current,
    }
  })

  const latest = SNAPSHOT_TOTALS.length ? total : 0
  const totals = [...SNAPSHOT_TOTALS, latest]
  const snapshots: InvestmentSnapshot[] = SNAPSHOT_DATES.map((date, index) => {
    const periodTotal = totals[index] ?? 0
    const previous = index > 0 ? totals[index - 1] : null
    const net = SNAPSHOT_NETS[index] ?? 0
    return {
      date,
      total: periodTotal,
      net,
      periodReturn:
        previous && previous > 0 ? ((periodTotal - net) / previous - 1) * 100 : null,
    }
  })

  const netIn = SNAPSHOT_NETS.slice(1).reduce<number>((sum, value) => sum + Math.max(0, value), 0)
  const netOut = SNAPSHOT_NETS.slice(1).reduce<number>((sum, value) => sum + Math.max(0, -value), 0)
  const investedCapital = totals[0] + netIn - netOut
  const cumulative = latest - investedCapital
  const cumulativeReturn = investedCapital === 0 ? 0 : (cumulative / investedCapital) * 100

  const flows = [
    { date: SNAPSHOT_DATES[0], amount: -totals[0] },
    ...SNAPSHOT_NETS.slice(1, -1)
      .map((net, index) => ({ date: SNAPSHOT_DATES[index + 1], amount: -net }))
      .filter((flow) => flow.amount !== 0),
    { date: SNAPSHOT_DATES[SNAPSHOT_DATES.length - 1], amount: latest },
  ]
  const xirrRate = xirr(flows)
  const periodFactor = snapshots.slice(1).reduce((product, snapshot) => {
    const rate = snapshot.periodReturn
    return rate === null ? product : product * (1 + rate / 100)
  }, 1)
  const spanDays = Math.max(
    1,
    (Date.parse(`${SNAPSHOT_DATES[SNAPSHOT_DATES.length - 1]}T00:00:00Z`) -
      Date.parse(`${SNAPSHOT_DATES[0]}T00:00:00Z`)) /
      86_400_000,
  )
  const twr = (Math.pow(periodFactor, 365 / spanDays) - 1) * 100

  const holdingNames = Object.keys(INVEST_WEIGHTS) as (keyof typeof INVEST_WEIGHTS)[]
  const holdings: InvestmentHoldingGroup[] = accounts.map((account) => {
    const ratio = 1 + cumulativeReturn / 100
    const accountCost = ratio <= 0 ? account.balance : Math.round(account.balance / ratio)
    const children = holdingNames.map((name) => {
      const marketValue = Math.round(account.balance * INVEST_WEIGHTS[name])
      const cost = Math.round(accountCost * INVEST_TARGETS[name])
      const gain = marketValue - cost
      return {
        id: `${account.id}-${name}`,
        name,
        marketValue,
        cost,
        gain,
        rate: cost === 0 ? 0 : (gain / cost) * 100,
      }
    })
    const marketValue = children.reduce((sum, row) => sum + row.marketValue, 0)
    const cost = children.reduce((sum, row) => sum + row.cost, 0)
    const gain = marketValue - cost
    return {
      id: account.id,
      name: account.name,
      marketValue,
      cost,
      gain,
      rate: cost === 0 ? 0 : (gain / cost) * 100,
      children,
    }
  })
  const costTotal = holdings.reduce((sum, row) => sum + row.cost, 0)
  const gainTotal = holdings.reduce((sum, row) => sum + row.gain, 0)

  return {
    total,
    allocation: classes,
    snapshots,
    holdings,
    costTotal,
    gainTotal,
    cumulativeReturn,
    xirr: xirrRate === null ? null : xirrRate * 100,
    twr,
    metrics: [
      {
        label: '期末市值',
        value: currency(latest),
      },
      { label: '累计收益率', value: formatPercent(cumulativeReturn, 2), tone: cumulativeReturn >= 0 ? 'income' : 'expense' },
      { label: 'XIRR', value: xirrRate === null ? '—' : formatPercent(xirrRate * 100, 2) },
      { label: 'TWR', value: formatPercent(twr, 2) },
    ],
    trend: snapshots.map((snapshot) => ({ month: snapshot.date.slice(0, 7), value: snapshot.total })),
  }
}

export interface DrillData {
  title: string
  amount: number
  tone: 'income' | 'expense'
  children: { id: string; name: string; amount: number; count: number }[]
  transactions: {
    id: string
    date: string
    label: string
    account: string
    amount: number
    tone: 'income' | 'expense'
  }[]
}

/** 下钻只展开当期口径：二级类别 + 相关流水，不重复完整流水页。 */
export function buildDrill(
  ledger: Ledger,
  node: FlowTreeNode,
  kind: 'income' | 'expense',
  from: string,
  to: string,
): DrillData {
  // 合并「其他」卡片必须与下钻用同一组根分类，点击行的金额才对得上。
  const rootIds = node.id === 'rest' && node.mergedIds ? node.mergedIds : [node.id]
  const subtree = new Set<string>()
  const collect = (id: string) => {
    subtree.add(id)
    ledger.categories.filter((category) => category.parentId === id).forEach((child) => collect(child.id))
  }
  rootIds.forEach(collect)
  const transactions = ledger.transactions
    .filter((transaction) => {
      if (!inRange(transaction, from, to)) return false
      if (!subtree.has(transaction.categoryId)) return false
      if (kind === 'income') return isIncomeSide(transaction) || refundOffsetSide(transaction) === 'income'
      return transaction.type === 'expense' ||
        refundOffsetSide(transaction) === 'expense' ||
        adjustmentExpense(transaction) > 0
    })
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 4)

  return {
    title: node.name,
    amount: node.amount,
    tone: kind === 'income' ? 'income' : 'expense',
    children: node.children.map((child) => ({
      id: child.id,
      name: child.name,
      amount: child.amount,
      count: child.count,
    })),
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      date: transaction.date,
      label: `${getCategory(ledger, transaction.categoryId)?.name ?? '未分类'}${transaction.note ? ` · ${transaction.note}` : ''}`,
      account: ledger.accounts.find((account) => account.id === transaction.accountId)?.name ?? '—',
      amount:
        refundOffsetSide(transaction) === kind
          ? -Math.abs(transaction.amount)
          : transaction.type === 'expense'
            ? Math.abs(transaction.amount)
            : adjustmentExpense(transaction) > 0
              ? adjustmentExpense(transaction)
              : Math.abs(transaction.amount),
      tone: kind,
    })),
  }
}

export function currency(value: number): string {
  return formatCurrency(minor(value))
}

export function signedCurrency(value: number): string {
  return formatCurrency(minor(value), { showSign: true })
}

/**
 * 柱高下限钳制：负值 / 非有限值一律给 0。SVG 对负高度只报 warning 不绘制，
 * 零数据或异常金额时先在这里截断，保证控制台没有「negative value is not valid」。
 */
export function barHeight(value: number, max: number, plotH: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || !Number.isFinite(plotH)) return 0
  if (max <= 0 || plotH <= 0) return 0
  return Math.max(0, (value / max) * plotH)
}
