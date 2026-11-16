/**
 * 分类树 → 表格行：收支树与资产负债树共用同一套折叠、占比与口径，
 * 双端（PC 并排双表 / 移动分段单表）消费同一份 ReportRow。
 *
 * 父级金额已含子级，展开后子级只是拆分展示；无预算 / 预测等口径以文字标记
 * 直接附在行尾。列集合固定为「名称 / 数量 / 金额 / 占比」，不再由设置切换。
 */
import { isExpanded, type FoldState } from '@/features/shared/foldState'
import { formatPercent } from '@/utils/format'
import type { ReportRow } from './ReportTable'
import { currency, type FlowTreeNode } from './reportsModel'

export interface TreeRenderOptions {
  /** 第二列计数单位：收支树「笔」，资产负债树「个」。 */
  unit: string
  onOpen?: (node: FlowTreeNode) => void
}

const cellsOf = (node: FlowTreeNode, unit: string) => [
  node.name,
  `${node.count} ${unit}`,
  currency(node.amount),
  formatPercent(node.share, 1, false),
]

const hintOf = (node: FlowTreeNode) =>
  node.noBudget ? '无预算' : node.predicted ? '预测' : undefined

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
      hint: hintOf(node),
    })
    if (open) {
      for (const child of node.children) {
        rows.push({
          id: child.id,
          level: 1,
          cells: cellsOf(child, options.unit),
          hint: hintOf(child),
          onOpen: options.onOpen ? () => options.onOpen?.(child) : undefined,
        })
      }
    }
  }
  return rows
}
