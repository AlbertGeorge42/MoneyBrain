/**
 * 分类树 → 表格行 / 移动卡片行：收支树与资产负债树共用同一套折叠、占比与口径。
 *
 * 父级金额已含子级，展开后子级只是拆分展示：行内后缀标注「†」，
 * 含义由表说明位的「† 子级已计入父级」图例承载，避免用户把可见行相加当成合计。
 * 列集合固定为「名称 / 数量 / 金额 / 占比」，不再由设置切换。
 */
import { isExpanded, type FoldState } from '@/features/shared/foldState'
import { formatPercent } from '@/utils/format'
import type { CardRow, ReportRow } from './ReportTable'
import { currency, type FlowTreeNode } from './reportsModel'

export interface TreeRenderOptions {
  /** 第二列计数单位：收支树「笔」，资产负债树「个」。 */
  unit: string
  onOpen?: (node: FlowTreeNode) => void
  /** 子级行是否挂「†」；父级金额已含子级时开启。 */
  childLegend?: boolean
  /** 仅移动卡片：金额色调与进度条色调。 */
  tone?: 'income' | 'expense'
  barTone?: 'income' | 'expense' | 'accent'
  /** 仅移动卡片：收支金额带 + / −，资产负债余额不带。 */
  signed?: boolean
}

const cellsOf = (node: FlowTreeNode, unit: string) => [
  node.name,
  `${node.count} ${unit}`,
  currency(node.amount),
  formatPercent(node.share, 1, false),
]

const metaOf = (node: FlowTreeNode, unit: string) =>
  `${node.count} ${unit} · ${formatPercent(node.share, 1, false)}`

const parentHint = (node: FlowTreeNode) =>
  node.noBudget ? '无预算' : node.predicted ? '预测' : undefined

const childHint = (node: FlowTreeNode, options: TreeRenderOptions) => {
  if (node.noBudget) return '† 无预算'
  if (node.predicted) return options.childLegend ? '† 预测' : '预测'
  return options.childLegend ? '†' : undefined
}

const amountOf = (node: FlowTreeNode, options: TreeRenderOptions) =>
  options.signed
    ? `${options.tone === 'income' ? '+' : '−'}${currency(node.amount)}`
    : currency(node.amount)

export function flattenTreeRows(
  nodes: FlowTreeNode[],
  expanded: FoldState,
  onFold: (id: string) => void,
  options: TreeRenderOptions,
): ReportRow[] {
  const rows: ReportRow[] = []
  for (const node of nodes) {
    const open = isExpanded(expanded, node.id)
    const onOpen = options.onOpen ? () => options.onOpen?.(node) : undefined
    rows.push({
      id: node.id,
      cells: cellsOf(node, options.unit),
      fold: node.children.length > 0 ? { expanded: open, onToggle: () => onFold(node.id) } : undefined,
      onOpen,
      hint: parentHint(node),
    })
    if (open) {
      for (const child of node.children) {
        rows.push({
          id: child.id,
          level: 1,
          cells: cellsOf(child, options.unit),
          hint: childHint(child, options),
          onOpen: options.onOpen ? () => options.onOpen?.(child) : undefined,
        })
      }
    }
  }
  return rows
}

export function flattenTreeCards(
  nodes: FlowTreeNode[],
  expanded: FoldState,
  onFold: (id: string) => void,
  options: TreeRenderOptions,
): CardRow[] {
  const rows: CardRow[] = []
  for (const node of nodes) {
    const open = isExpanded(expanded, node.id)
    const onOpen = options.onOpen ? () => options.onOpen?.(node) : undefined
    rows.push({
      id: node.id,
      label: node.name,
      meta: metaOf(node, options.unit),
      hint: parentHint(node),
      amount: amountOf(node, options),
      tone: options.tone,
      share: node.share,
      barTone: options.barTone,
      fold: node.children.length > 0 ? { expanded: open, onToggle: () => onFold(node.id) } : undefined,
      onOpen,
    })
    if (open) {
      for (const child of node.children) {
        rows.push({
          id: child.id,
          level: 1,
          label: child.name,
          meta: metaOf(child, options.unit),
          hint: childHint(child, options),
          amount: amountOf(child, options),
          tone: options.tone,
          share: child.share,
          barTone: options.barTone,
          onOpen: options.onOpen ? () => options.onOpen?.(child) : undefined,
        })
      }
    }
  }
  return rows
}
