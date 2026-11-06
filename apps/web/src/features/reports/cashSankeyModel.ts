/**
 * 现金流桑基模型（批 C）
 *
 * 三层「期初 → 流入 / 流出组 → 期末」，口径 = 全账户净额：
 *   期初 + 流入 − 流出 = 期末        （单位：分，容差 ¥0.01）
 *
 * 账户间转账是账户内资金移动：不进入流入 / 流出、不画 link，也不增减净额；
 * 手续费是真实流出，单独成节点。配置隐藏分组时并入「其他（已隐藏 N 组）」保持守恒。
 */
import { minor } from '@domain/index'
import { formatCurrency } from '@/utils/format'
import type { Ledger } from '@/features/overview/model'
import { addDays } from './reportsTime'
import {
  accountBalancesAt,
  type CashChild,
  type CashGroup,
  type CashReport,
} from './reportsModel'

export interface CashSankeyNode {
  id: string
  name: string
  layer: 0 | 1 | 2
  tone: 'income' | 'expense' | 'neutral'
  amount: number
  children: CashChild[]
  hiddenCount?: number
}

export interface CashSankeyLink {
  id: string
  sourceId: string
  targetId: string
  /** 抽屉锚点：组节点 id。中间层内部补流（流入不足覆盖流出）时仍落到出流组。 */
  nodeId: string
  amount: number
  tone: 'income' | 'expense' | 'neutral'
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
  hiddenGroups: number
  /** 内部转移总额：不进入桑基，也不增减净额，只在文档与注释里说明。 */
  transferExcluded: number
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

/**
 * 全账户净额（含投资与信用账户）。
 *
 * `accountBalancesAt` 在回放转账时只还原本金、不还原手续费；而当前余额已扣过手续费，
 * 所以这里把锚点之后转账的手续费补回来。若该函数日后修复，需同步删掉这段补偿。
 */
function netAt(ledger: Ledger, point: string): number {
  const balances = accountBalancesAt(ledger, point)
  const fees = ledger.transactions
    .filter((transaction) => transaction.type === 'transfer' && transaction.date > point)
    .reduce((sum, transaction) => sum + Number(transaction.fee ?? 0), 0)
  const net = ledger.accounts.reduce(
    (sum, account) => sum + (balances.get(account.id) ?? account.balance),
    0,
  )
  return net + fees
}

function inRange(transaction: { date: string }, from: string, to: string): boolean {
  return transaction.date >= from && transaction.date <= to
}

/** 按权重把整数分拆成和精确等于总额的一组份额（最大余数法）。 */
function allocate(amount: number, weights: number[]): number[] {
  if (weights.length === 0) return []
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  if (totalWeight <= 0 || amount <= 0) return weights.map(() => 0)
  const raw = weights.map((weight) => (amount * weight) / totalWeight)
  const floors = raw.map((value) => Math.floor(value))
  let rest = amount - floors.reduce((sum, value) => sum + value, 0)
  const order = raw
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((left, right) => right.fraction - left.fraction)
  for (const entry of order) {
    if (rest <= 0) break
    floors[entry.index] += 1
    rest -= 1
  }
  return floors
}

function correctionChildren(ledger: Ledger, report: CashReport): CashChild[] {
  const accounts = new Map(ledger.accounts.map((account) => [account.id, account.name]))
  return ledger.transactions
    .filter(
      (transaction) =>
        transaction.type === 'adjustment' &&
        inRange(transaction, report.period.from, report.period.to) &&
        transaction.amount !== 0,
    )
    .map((transaction) => ({
      id: transaction.id,
      label: transaction.note || '对账修正',
      account: accounts.get(transaction.accountId) ?? transaction.accountId,
      amount: Math.abs(transaction.amount),
      tone: transaction.amount < 0 ? ('expense' as const) : ('income' as const),
      categoryId: transaction.categoryId,
    }))
}

/**
 * 现金流桑基（PC）：三层「期初 → 流入 / 流出组 → 期末」。
 *
 * - 口径 = 全账户净额；账户间转账是内部转移，不进入流入 / 流出，也不画 link；
 * - 手续费与对账修正各为独立出流节点，手续费来自转账记录、修正来自 adjustment；
 * - 配置隐藏某个活动分组时，该分组并入「其他（已隐藏 N 组）」而不是丢弃，
 *   否则会画出不守恒的图；隐藏数量会在图上注明。
 */
export function deriveCashSankey(
  ledger: Ledger,
  report: CashReport,
  visibility: Record<string, boolean>,
): CashSankey {
  const { from, to } = report.period
  // API 模式：后端口径已经包含现金等价账户内的全部修正与手续费，期初/期末也由后端给出；
  // 再按流水补计会重复，所以这里直接用显式期初/期末，修正与手续费补计为 0。
  const fromApi = report.correctionsIncluded === true
  const transactions = fromApi
    ? []
    : ledger.transactions.filter((transaction) => inRange(transaction, from, to))
  const correctionIncome = transactions
    .filter((transaction) => transaction.type === 'adjustment' && transaction.amount > 0)
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const correctionExpense = transactions
    .filter((transaction) => transaction.type === 'adjustment' && transaction.amount < 0)
    .reduce((sum, transaction) => sum + -transaction.amount, 0)
  const fee = fromApi ? 0 : report.reconcile.transferFee
  const transferExcluded = fromApi
    ? 0
    : report.outflowGroups.find((group) => group.name === '账户间转账')?.total ?? 0
  // 桑基逐节点按现金移动分组求和：流入/流出直接用组合计，账户间转账本金是内部转移，不画。
  // API 模式的中间层按活动净值正负拆成毛流入 / 毛流出；种子模式仍是组合计 + 修正。
  const inflow = fromApi
    ? (report.inflowGross ?? report.inflowTotal)
    : report.inflowTotal + correctionIncome
  const outflow = fromApi
    ? (report.outflowGross ?? report.outflowTotal)
    : report.outflowTotal - transferExcluded + fee + correctionExpense
  const opening = fromApi && report.openingCash !== undefined
    ? report.openingCash
    : netAt(ledger, addDays(from, -1))
  const closing = fromApi ? report.closingCash : netAt(ledger, to)

  const base: CashSankey = {
    status: 'ready',
    opening,
    closing,
    inflow,
    outflow,
    fee,
    correction: correctionExpense + correctionIncome,
    difference: 0,
    nodes: [],
    links: [],
    hiddenGroups: 0,
    transferExcluded,
  }

  try {
    base.difference = assertCashSankeyConservation(opening, inflow, outflow, closing)
  } catch {
    // 不静默画错图，也不让整页崩掉：落成可见失败态，差额如实写进 reason。
    base.difference = opening + inflow - outflow - closing
    return {
      ...base,
      status: 'invalid',
      reason: `现金流不守恒：期初 + 流入 − 流出 − 期末 = ${formatCurrency(minor(Math.abs(base.difference)))}。为避免误读，本图已停画。`,
    }
  }

  if (opening <= 0 || closing <= 0) {
    return {
      ...base,
      status: 'invalid',
      reason: '期初或期末净额为负（负债大于资产），三层桑基不适用；下方现金流表仍可查看。',
    }
  }

  const visible = (key: string) => visibility[key] !== false
  // 隐藏组数按「配置里被隐藏的活动分组」计，跨流入 / 流出只算一次；
  // 账户间转账虽不进桑基，但被隐藏时仍是用户隐藏的一个分组，一并计入。
  base.hiddenGroups = new Set(
    [...report.inflowGroups, ...report.outflowGroups]
      .filter((group) => group.total > 0 && !visible(group.key))
      .map((group) => group.key),
  ).size
  const inflowGroups = report.inflowGroups.filter((group) => group.total > 0)
  const outflowGroups = report.outflowGroups.filter((group) => group.name !== '账户间转账' && group.total > 0)
  const hiddenIn = inflowGroups.filter((group) => !visible(group.key))
  const hiddenOut = outflowGroups.filter((group) => !visible(group.key))
  const shownIn = inflowGroups.filter((group) => visible(group.key))
  const shownOut = outflowGroups.filter((group) => visible(group.key))

  const nodes: CashSankeyNode[] = [
    { id: 'opening', name: '期初', layer: 0, tone: 'neutral', amount: opening, children: [] },
  ]
  const links: CashSankeyLink[] = []

  const mergeHidden = (groups: CashGroup[]): CashGroup => ({
    key: 'hidden',
    name: `其他（已隐藏 ${base.hiddenGroups} 组）`,
    total: groups.reduce((sum, group) => sum + group.total, 0),
    count: groups.reduce((sum, group) => sum + group.count, 0),
    children: groups.flatMap((group) => group.children),
  })
  const inNodes = [
    ...shownIn.map((group) => ({ group, hidden: false })),
    ...(hiddenIn.length > 0 ? [{ group: mergeHidden(hiddenIn), hidden: true }] : []),
  ]
  const outNodes = [
    ...shownOut.map((group) => ({ group, hidden: false })),
    ...(hiddenOut.length > 0 ? [{ group: mergeHidden(hiddenOut), hidden: true }] : []),
  ]

  for (const entry of inNodes) {
    nodes.push({
      id: `in:${entry.group.key}`,
      name: entry.group.name,
      layer: 1,
      tone: 'income',
      amount: entry.group.total,
      children: entry.group.children,
      hiddenCount: entry.hidden ? hiddenIn.length : undefined,
    })
  }
  for (const entry of outNodes) {
    nodes.push({
      id: `out:${entry.group.key}`,
      name: entry.group.name,
      layer: 1,
      tone: 'expense',
      amount: entry.group.total,
      children: entry.group.children,
      hiddenCount: entry.hidden ? hiddenOut.length : undefined,
    })
  }
  if (fee > 0) {
    nodes.push({
      id: 'out:fee',
      name: '手续费',
      layer: 1,
      tone: 'expense',
      amount: fee,
      children: [
        {
          id: 'fee',
          label: '转账手续费',
          account: '—',
          amount: fee,
          tone: 'expense',
          categoryId: '',
        },
      ],
    })
  }
  if (correctionExpense > 0) {
    nodes.push({
      id: 'out:correction',
      name: '对账修正',
      layer: 1,
      tone: 'expense',
      amount: correctionExpense,
      children: correctionChildren(ledger, report).filter((child) => child.tone === 'expense'),
    })
  }
  if (correctionIncome > 0) {
    nodes.push({
      id: 'in:correction',
      name: '对账修正',
      layer: 1,
      tone: 'income',
      amount: correctionIncome,
      children: correctionChildren(ledger, report).filter((child) => child.tone === 'income'),
    })
  }
  nodes.push({ id: 'closing', name: '期末', layer: 2, tone: 'neutral', amount: closing, children: [] })

  const outTotal = nodes.filter((node) => node.layer === 1 && node.tone === 'expense').reduce((sum, node) => sum + node.amount, 0)
  const inTotal = nodes.filter((node) => node.layer === 1 && node.tone === 'income').reduce((sum, node) => sum + node.amount, 0)
  const residual = opening - outTotal

  if (residual >= 0) {
    for (const node of nodes.filter((item) => item.layer === 1 && item.tone === 'expense')) {
      links.push({
        id: `open-${node.id}`,
        sourceId: 'opening',
        targetId: node.id,
        nodeId: node.id,
        amount: node.amount,
        tone: 'expense',
      })
    }
    if (residual > 0) {
      links.push({
        id: 'open-close',
        sourceId: 'opening',
        targetId: 'closing',
        nodeId: 'closing',
        amount: residual,
        tone: 'neutral',
      })
    }
    for (const node of nodes.filter((item) => item.layer === 1 && item.tone === 'income')) {
      links.push({
        id: `in-close-${node.id}`,
        sourceId: node.id,
        targetId: 'closing',
        nodeId: node.id,
        amount: node.amount,
        tone: 'income',
      })
    }
  } else {
    // 期初不足以覆盖流出：期初全部用于流出，缺口由流入按占比分担，余下流入进入期末。
    const deficit = -residual
    const outList = nodes.filter((node) => node.layer === 1 && node.tone === 'expense')
    const openShares = allocate(opening, outList.map((node) => node.amount))
    const inflowList = nodes.filter((node) => node.layer === 1 && node.tone === 'income')
    for (let index = 0; index < outList.length; index += 1) {
      const node = outList[index]
      const openPart = openShares[index]
      if (openPart > 0) {
        links.push({
          id: `open-${node.id}`,
          sourceId: 'opening',
          targetId: node.id,
          nodeId: node.id,
          amount: openPart,
          tone: 'expense',
        })
      }
      const gap = node.amount - openPart
      if (gap <= 0) continue
      const shares = allocate(gap, inflowList.map((item) => item.amount))
      for (let inner = 0; inner < inflowList.length; inner += 1) {
        if (shares[inner] <= 0) continue
        links.push({
          id: `${inflowList[inner].id}-${node.id}`,
          sourceId: inflowList[inner].id,
          targetId: node.id,
          nodeId: node.id,
          amount: shares[inner],
          tone: 'expense',
        })
      }
    }
    const usedByInflow = new Map<string, number>()
    for (const link of links) {
      if (link.sourceId.startsWith('in:')) {
        usedByInflow.set(link.sourceId, (usedByInflow.get(link.sourceId) ?? 0) + link.amount)
      }
    }
    for (const node of inflowList) {
      const rest = node.amount - (usedByInflow.get(node.id) ?? 0)
      if (rest <= 0) continue
      links.push({
        id: `${node.id}-close`,
        sourceId: node.id,
        targetId: 'closing',
        nodeId: node.id,
        amount: rest,
        tone: 'income',
      })
    }
    if (deficit < 0) {
      // 不会发生；保留显式分支避免负值流入宽度。
      base.status = 'invalid'
      base.reason = '期初与流入之和小于流出，桑基无法保持守恒。'
    }
  }

  if (inTotal !== inflow || outTotal !== outflow) {
    // 分组合计与对账总额不等说明上游口径漂移，宁可停画也不画错图。
    const drift = Math.abs(inflow - inTotal) + Math.abs(outflow - outTotal)
    if (drift > 1) {
      base.status = 'invalid'
      base.reason = '现金流分组合计与对账总额不一致，桑基已停画。'
    }
  }

  return { ...base, nodes, links }
}
