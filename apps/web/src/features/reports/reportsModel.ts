/**
 * 报表数据模型（HF 批次 3）
 *
 * 四张报表共用同一套派生口径：时点看余额、期间看发生额。
 * 所有金额仍是整数分；展示层再经 formatCurrency。
 * 这里不放任何 UI 文案模板，表格与下钻只消费结构化结果。
 */
import { isExpanded, type FoldState } from '@/features/shared/foldState'
import { minor } from '@domain/index'
import { formatCurrency } from '@/utils/format'
import {
  getCategory,
  refundOffsetSide,
  type Ledger,
  type LedgerAccountCategory,
  type LedgerTransaction,
  type TrendPoint,
} from '@/features/overview/model'
import type { ReportRow } from './ReportTable'
import type { CashFlowReportData } from '@contracts/types'

/**
 * 预测拆解：金额 = 实际 + 预测。只在 predicted ≠ 0 时生成，
 * 界面用「预测」文字标签 + 「实际 … · 预测 …」拆解行区分两类数字，不只靠颜色。
 */
export interface MetricPrediction {
  actual: number
  /** 后端给出的单一预测部分；推演端点没有该字段时不填，由 split 直出分项。 */
  predicted?: number
  direction: 'income' | 'expense' | 'net'
  /** 直接可展示的拆解文案，例如「实际 +¥1,234 · 预测 +¥567」。 */
  split: string
}

export interface ReportMetric {
  label: string
  value: string
  tone?: 'income' | 'expense' | 'neutral'
  /** 紧贴标签的极短口径标记，不新增说明行。 */
  hint?: string
  /** 非空时：金额含预算预测，标签旁加「预测」文字标记并展示实际 / 预测拆解。 */
  prediction?: MetricPrediction
}

export interface FlowTreeNode {
  id: string
  name: string
  amount: number
  count: number
  share: number
  level: 0 | 1
  children: FlowTreeNode[]
  /** 金额中的预测部分；≠ 0 时行内标「预测」。 */
  predicted?: number
  /** 该分类没有任何预算来源；行内标「无预算」，不用 0 冒充。 */
  noBudget?: boolean
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
  /** 后端口径说明（含预算预测时给出）。 */
  predictionNote?: string
  /** 当前口径是否计入「不计收支」流水；表说明与开关保持一致。 */
  includeExcluded?: boolean
}

export interface BalanceRow {
  id: string
  name: string
  kind: string
  amount: number
  /** 金额中的预测部分；≠ 0 时行内标「预测」。 */
  predicted?: number
  /** 所属账户分类的真实 id；null / undefined = 未分组（种子账本没有账户分类）。 */
  categoryId?: string | null
}

/**
 * 资产负债两层：账户分类 → 账户。
 *
 * 每一行账户按它所属的分类归组，组内直接列账户；账本没有分类元数据
 * （种子账本 / 测试夹具）时按后端节点的分类名兜底，层级仍然成立。
 */
export interface BalanceGroup {
  id: string
  name: string
  amount: number
  /** 该分组金额中的预测部分；≠ 0 时行内标「预测」。 */
  predicted?: number
  /** 该分组下去重后的账户数（0 元账户按覆盖规则未列入，不计入）。 */
  accountCount: number
  accounts: BalanceRow[]
}

export interface BalanceReport {
  point: string
  assets: BalanceRow[]
  liabilities: BalanceRow[]
  assetTotal: number
  liabilityTotal: number
  netWorth: number
  /** 余额为 0、未在明细中列出的账户数（覆盖规则：只列余额 ≠ 0 的账户）。 */
  zeroAccountCount: number
  /** 正余额资产合计（资产构成的环内合计与投资占比的分母）。 */
  positiveAssetTotal: number
  /** 负余额资产合计（负数），未计入正余额口径。 */
  negativeAssetTotal: number
  negativeAssetCount: number
  trend: TrendPoint[]
  metrics: ReportMetric[]
  /** 后端口径说明（含预算预测时给出）。 */
  predictionNote?: string
}

/**
 * 资产负债两层分组：账户按自己的分类归组。
 *
 * 设置页把每个账户分类平铺成分组（不按父子层级折叠），报表必须同口径：
 * 账户归到它 `categoryId` 指向的分类本身，**不做二级归一到父级**——否则
 * 「资产」父分类下的「现金」「投资」会全被并进「资产」，设置里分的三组
 * 在表格与环图里只剩一组。
 *
 * 后端的 assetNodes 已按设置里的 sort 排好序，账本带 accountCategories 时
 * 用真实分类名，缺失时用节点分类名兜底。这里**不再按金额重排**：分类与
 * 账户的默认顺序完全由设置中的拖拽顺序决定。
 */
export function buildBalanceGroups(
  rows: BalanceRow[],
  categories?: readonly LedgerAccountCategory[],
): BalanceGroup[] {
  const byId = new Map(categories?.map((category) => [category.id, category]) ?? [])
  const roots = new Map<string, BalanceGroup>()

  const rootOf = (id: string, name: string): BalanceGroup => {
    const existing = roots.get(id)
    if (existing) return existing
    const created: BalanceGroup = {
      id,
      name,
      amount: 0,
      predicted: 0,
      accountCount: 0,
      accounts: [],
    }
    roots.set(id, created)
    return created
  }

  for (const row of rows) {
    const category = row.categoryId ? byId.get(row.categoryId) : undefined
    // 与设置页同口径：分类本身就是一层分组，子分类不再向父级归并。
    const root = rootOf(category?.id ?? `kind:${row.kind}`, category?.name ?? row.kind)
    root.accounts.push(row)
    root.amount += row.amount
    root.predicted = (root.predicted ?? 0) + (row.predicted ?? 0)
    root.accountCount += 1
  }

  return [...roots.values()]
}

/** 层级自检：组内账户之和 = 分组小计，金额与账户数都对齐。 */
export function balanceGroupBalanced(group: BalanceGroup): boolean {
  const childAmount = group.accounts.reduce((sum, row) => sum + row.amount, 0)
  return childAmount === group.amount && group.accounts.length === group.accountCount
}

/**
 * 「账户分类 → 账户」树：表格、移动卡片与构成环共用同一份派生结果。
 *
 * 一级是分类（先显示该分类占比），二级是该分类下的账户；环图点分类即可下钻到账户。
 * 占比分母只取正余额，负余额账户仍留在表格里，避免出现负的扇形。
 */
export function buildBalanceTrees(groups: BalanceGroup[]): FlowTreeNode[] {
  const total = groups.reduce((sum, group) => sum + Math.max(0, group.amount), 0)
  const shareOf = (amount: number) =>
    total > 0 ? (Math.max(0, amount) / total) * 100 : 0
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    amount: group.amount,
    count: group.accountCount,
    share: shareOf(group.amount),
    level: 0 as const,
    predicted: group.predicted,
    children: group.accounts.map((account) => ({
      id: account.id,
      name: account.name,
      amount: account.amount,
      count: 1,
      share: shareOf(account.amount),
      level: 1 as const,
      predicted: account.predicted,
      children: [],
    })),
  }))
}

export interface CashChild {
  id: string
  label: string
  account: string
  amount: number
  /** 金额中的预测部分；≠ 0 时行内标「预测」。 */
  predicted?: number
  tone: 'income' | 'expense' | 'transfer'
  /** 下钻到流水时按分类精确复现同一组（合并「其余」时取并集）。 */
  categoryId: string
}

export interface CashGroup {
  key: string
  name: string
  total: number
  /** 分组金额中的预测部分；≠ 0 时行内标「预测」。 */
  predicted?: number
  /** 第二列说明；预测区间没有流水笔数时用「N 个分类」等口径。 */
  meta?: string
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
   * 预测区间的窗口级桑基：后端已把三来源合成到 link，
   * 不再用账本回放校验期初 / 期末（预测事件不在账本流水里）。
   */
  projectionMode?: boolean
  /**
   * 毛流入 / 毛流出（按活动净值正负拆分）。退款冲减流入时，
   * 后端 `cashInflow` 是净流入，而桑基中间层按毛额画；两者差一笔冲减，
   * 用毛额才能保证「节点合计 = 桑基流入 / 流出」。
   */
  inflowGross?: number
  outflowGross?: number
  metrics: ReportMetric[]
  /** 后端口径说明（含预算预测时给出）。 */
  predictionNote?: string
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

function inRange(transaction: LedgerTransaction, from: string, to: string): boolean {
  return transaction.date >= from && transaction.date <= to
}

/**
 * 收支口径：退款不计收入，只冲减原交易一侧；未关联退款只影响余额。
 */
function isIncomeSide(transaction: LedgerTransaction): boolean {
  return transaction.type === 'income'
}

function adjustmentExpense(transaction: LedgerTransaction): number {
  return transaction.type === 'adjustment' && transaction.amount < 0 ? -transaction.amount : 0
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

/** 现金流左右两表的行：键带方向前缀，两表共用一份展开状态也不串扰。 */
export function cashRowsFor(
  side: 'in' | 'out',
  groups: CashGroup[],
  expanded: FoldState,
  onFold: (id: string) => void,
): ReportRow[] {
  const foldKey = (id: string) => `${side}:${id}`
  const rows: ReportRow[] = []
  for (const group of groups) {
    const key = foldKey(group.key)
    const open = isExpanded(expanded, key)
    rows.push({
      id: key,
      cells: [group.name, group.meta ?? `${group.count} 笔`, currency(group.total)],
      hint: group.predicted ? '预测' : undefined,
      fold: group.children.length > 0 ? { expanded: open, onToggle: () => onFold(key) } : undefined,
    })
    if (open) {
      for (const child of group.children) {
        rows.push({
          id: foldKey(child.id),
          level: 1,
          cells: [child.label, child.account, currency(child.amount)],
          hint: child.predicted ? '预测' : undefined,
          tone: child.tone,
        })
      }
    }
  }
  return rows
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
    /** 退款冲减：金额保留真实负号，展示层据此标注「退款」。 */
    refund: boolean
  }[]
}

/** 下钻只展开当期口径：二级类别 + 相关流水，不重复完整流水页。 */
export function buildDrill(
  ledger: Ledger,
  node: FlowTreeNode,
  kind: 'income' | 'expense',
  from: string,
  to: string,
  includeExcluded = false,
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
      // 与报表合计同一口径：开关关闭时「不计收支」流水不进下钻。
      if (!includeExcluded && transaction.excludeFromIncomeExpense) return false
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
      refund: transaction.type === 'refund',
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
