import { formatPercent } from '@/utils/format'
import type { ReportRow } from './ReportTable'
import { currency, type FlowTreeNode } from './reportsModel'

/**
 * 收支树 → 表格行。
 * 父级金额已含子级，折叠展开后子级只是拆分展示：行内后缀标注「†」，
 * 含义由表说明位的「† 子级已计入父级」图例承载，避免用户把可见行相加当成合计
 * （1024 下首列仅 101px，放不下五字标记）。
 */
export function flattenFlowRows(
  nodes: FlowTreeNode[],
  folded: Record<string, boolean>,
  onFold: (id: string) => void,
  onOpen: (node: FlowTreeNode) => void,
): ReportRow[] {
  const rows: ReportRow[] = []
  for (const node of nodes) {
    const expanded = folded[node.id] !== false
    rows.push({
      id: node.id,
      cells: [
        node.name,
        `${node.count} 笔`,
        currency(node.amount),
        formatPercent(node.share, 1, false),
      ],
      fold: node.children.length > 0 ? { expanded, onToggle: () => onFold(node.id) } : undefined,
      onOpen: () => onOpen(node),
    })
    if (expanded) {
      for (const child of node.children) {
        rows.push({
          id: child.id,
          level: 1,
          cells: [child.name, `${child.count} 笔`, currency(child.amount), formatPercent(child.share, 1, false)],
          hint: '†',
          onOpen: () => onOpen(child),
        })
      }
    }
  }
  return rows
}
