import { formatPercent } from '@/utils/format'
import type { CardRow, ReportRow } from './ReportTable'
import { currency, type FlowTreeNode } from './reportsModel'

/**
 * 收支树 → 表格行。
 * 父级金额已含子级，折叠展开后子级只是拆分展示：行内后缀标注「†」，
 * 含义由表说明位的「† 子级已计入父级」图例承载，避免用户把可见行相加当成合计
 * （1024 下首列仅 101px，放不下五字标记）。
 */
export interface FlowRowColumns {
  showCount?: boolean
  showShare?: boolean
}

export function flattenFlowRows(
  nodes: FlowTreeNode[],
  folded: Record<string, boolean>,
  onFold: (id: string) => void,
  onOpen: (node: FlowTreeNode) => void,
  columns: FlowRowColumns = {},
): ReportRow[] {
  const showCount = columns.showCount !== false
  const showShare = columns.showShare !== false
  const cellsOf = (node: FlowTreeNode) => [
    node.name,
    ...(showCount ? [`${node.count} 笔`] : []),
    currency(node.amount),
    ...(showShare ? [formatPercent(node.share, 1, false)] : []),
  ]
  const rows: ReportRow[] = []
  for (const node of nodes) {
    const expanded = folded[node.id] !== false
    rows.push({
      id: node.id,
      cells: cellsOf(node),
      fold: node.children.length > 0 ? { expanded, onToggle: () => onFold(node.id) } : undefined,
      onOpen: () => onOpen(node),
      // 行内文字标记，避免只用颜色 / 虚线表达「这行含预测」。
      hint: node.predicted ? '预测' : undefined,
    })
    if (expanded) {
      for (const child of node.children) {
        rows.push({
          id: child.id,
          level: 1,
          cells: cellsOf(child),
          hint: child.predicted ? '† 预测' : '†',
          onOpen: () => onOpen(child),
        })
      }
    }
  }
  return rows
}

/**
 * 收支树 → 移动端卡片行：与表格行同一份折叠状态与口径，只是把单元格换成分行排版。
 */
export function flattenFlowCards(
  nodes: FlowTreeNode[],
  folded: Record<string, boolean>,
  onFold: (id: string) => void,
  tone: 'income' | 'expense',
  onOpen: (node: FlowTreeNode) => void,
  columns: { showCount?: boolean; showShare?: boolean } = {},
): CardRow[] {
  const showCount = columns.showCount !== false
  const showShare = columns.showShare !== false
  const metaOf = (node: FlowTreeNode) =>
    [
      showCount ? `${node.count} 笔` : null,
      showShare ? formatPercent(node.share, 1, false) : null,
    ]
      .filter(Boolean)
      .join(' · ') || undefined
  const rows: CardRow[] = []
  for (const node of nodes) {
    const expanded = folded[node.id] !== false
    rows.push({
      id: node.id,
      label: node.name,
      meta: metaOf(node),
      hint: node.predicted ? '预测' : undefined,
      amount: `${tone === 'income' ? '+' : '−'}${currency(node.amount)}`,
      tone,
      share: node.share,
      barTone: tone,
      fold: node.children.length > 0 ? { expanded, onToggle: () => onFold(node.id) } : undefined,
      onOpen: () => onOpen(node),
    })
    if (expanded) {
      for (const child of node.children) {
        rows.push({
          id: child.id,
          level: 1,
          label: child.name,
          meta: metaOf(child),
          hint: child.predicted ? '† 预测' : '†',
          amount: `${tone === 'income' ? '+' : '−'}${currency(child.amount)}`,
          tone,
          share: child.share,
          barTone: tone,
        })
      }
    }
  }
  return rows
}
