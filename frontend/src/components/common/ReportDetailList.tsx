 import React, { useState } from 'react'
import { Card, Empty, Skeleton } from 'antd'
import { DynamicIcon } from './DynamicIcon'
import PredictionPopover from './PredictionPopover'
import { formatCurrency } from '../../utils/format'

// ===== Types =====

export interface ReportTreeNode<M = Record<string, number | string | null>> {
  key: string
  name: string
  icon?: string | null
  children?: ReportTreeNode<M>[]
  metrics?: M
}

export interface PredictionConfig {
  displayMetric: string
  actualMetric: string
  predictedMetric: string
}

export interface ReportDetailColumn<M = Record<string, number | string | null>> {
  key: string
  metric: keyof M & string
  title?: string
  width?: number | string
  align?: 'left' | 'center' | 'right'
  format?: (value: M[keyof M], node: ReportTreeNode<M>) => React.ReactNode
  color?: string | ((value: M[keyof M], node: ReportTreeNode<M>) => string)
  prediction?: PredictionConfig
  render?: (value: M[keyof M], node: ReportTreeNode<M>) => React.ReactNode
}

export interface ReportDetailConfig<M = Record<string, number | string | null>> {
  columns: ReportDetailColumn<M>[]
  parentIcon?: string
  leafIcon?: string
  expandable?: boolean
  defaultExpandDepth?: number
  emptyText?: string
}

export interface ReportDetailListProps<M = Record<string, number | string | null>> {
  data: ReportTreeNode<M>[]
  config: ReportDetailConfig<M>
  loading?: boolean
  isFuture?: boolean
  useClickTrigger?: boolean
  defaultExpanded?: boolean
  className?: string
  title?: React.ReactNode
  extra?: React.ReactNode
}

// ===== Helpers =====

function resolveColor<M>(
  column: ReportDetailColumn<M>,
  value: unknown,
  node: ReportTreeNode<M>
): string | undefined {
  if (!column.color) return undefined
  return typeof column.color === 'function' ? column.color(value as M[keyof M], node) : column.color
}

// ===== ValueCell =====

function DetailValueCell<M>({
  column,
  node,
  isFuture,
  useClickTrigger,
}: {
  column: ReportDetailColumn<M>
  node: ReportTreeNode<M>
  isFuture?: boolean
  useClickTrigger?: boolean
}) {
  const raw = (node.metrics?.[column.metric] ?? null) as M[keyof M] | null

  if (column.render) {
    return <span className="report-detail-cell">{column.render(raw as M[keyof M], node)}</span>
  }

  const pred = column.prediction
  if (pred && isFuture) {
    const predicted = Number((node.metrics as Record<string, unknown>)?.[pred.predictedMetric] ?? 0)
    if (predicted !== 0) {
      const actual = Number((node.metrics as Record<string, unknown>)?.[pred.actualMetric] ?? 0)
      const displayRaw = (node.metrics as Record<string, unknown>)?.[pred.displayMetric] ?? actual + predicted
      const formatted = column.format ? column.format(displayRaw as M[keyof M], node) : formatCurrency(Number(displayRaw))
      const color = resolveColor(column, raw, node)

      return (
        <span className="report-detail-cell">
          <PredictionPopover actual={actual} predicted={predicted} useClickTrigger={!!useClickTrigger}>
            <span className="report-detail-cell__main" style={color ? { color } : undefined}>
              {formatted}
            </span>
          </PredictionPopover>
        </span>
      )
    }
  }

  const formatted = column.format ? column.format(raw as M[keyof M], node) : (raw != null ? formatCurrency(Number(raw)) : '--')
  const color = resolveColor(column, raw, node)

  return (
    <span className="report-detail-cell">
      <span className="report-detail-cell__main" style={color ? { color } : undefined}>
        {formatted}
      </span>
    </span>
  )
}

// ===== Node (recursive) =====

function DetailNode<M>({
  node,
  config,
  depth,
  isFuture,
  useClickTrigger,
  expandedKeys,
  onToggle,
}: {
  node: ReportTreeNode<M>
  config: ReportDetailConfig<M>
  depth: number
  isFuture?: boolean
  useClickTrigger?: boolean
  expandedKeys: Set<string>
  onToggle: (key: string) => void
}) {
  const hasChildren = node.children && node.children.length > 0
  const icon = node.icon ?? (hasChildren ? config.parentIcon : config.leafIcon)
  const isExpanded = expandedKeys.has(node.key)

  return (
    <div className="report-detail-node">
      <div className="report-detail-node__header">
        <span className="report-detail-node__name-area">
          {icon && <DynamicIcon name={icon} size={16} />}
          <span
            className={`report-detail-node__name${hasChildren ? ' report-detail-node__name--expandable' : ''}`}
            onClick={hasChildren ? () => onToggle(node.key) : undefined}
          >
            {node.name}
          </span>
        </span>
        <span className="report-detail-node__values">
          {config.columns.map(col => (
            <DetailValueCell
              key={col.key}
              column={col}
              node={node}
              isFuture={isFuture}
              useClickTrigger={useClickTrigger}
            />
          ))}
        </span>
      </div>
      {hasChildren && isExpanded && (
        <div className="report-detail-node__children">
          {node.children!.map(child => (
            <DetailNode
              key={child.key}
              node={child}
              config={config}
              depth={depth + 1}
              isFuture={isFuture}
              useClickTrigger={useClickTrigger}
              expandedKeys={expandedKeys}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ===== Container =====

function collectKeys<M>(nodes: ReportTreeNode<M>[], depth: number, maxDepth: number): string[] {
  if (depth >= maxDepth) return []
  const keys: string[] = []
  for (const n of nodes) {
    if (n.children && n.children.length > 0) {
      keys.push(n.key)
      keys.push(...collectKeys(n.children, depth + 1, maxDepth))
    }
  }
  return keys
}

export function ReportDetailList<M>({
  data,
  config,
  loading,
  isFuture,
  useClickTrigger,
  defaultExpanded,
  className,
  title,
  extra,
}: ReportDetailListProps<M>) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => {
    if (defaultExpanded) return new Set(collectKeys(data, 0, Infinity))
    const depth = config.defaultExpandDepth ?? 0
    return depth > 0 ? new Set(collectKeys(data, 0, depth)) : new Set()
  })

  const handleToggle = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const content = (() => {
    if (loading) {
      return (
        <div className="report-detail-list">
          {[1, 2, 3].map(i => (
            <div key={i} className="report-detail-node">
              <div className="report-detail-node__header">
                <Skeleton.Input active size="small" style={{ width: 120 }} />
                <Skeleton.Input active size="small" style={{ width: 80 }} />
              </div>
            </div>
          ))}
        </div>
      )
    }

    if (data.length === 0) {
      return (
        <div className="report-detail-list">
          <Empty description={config.emptyText ?? '暂无数据'} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      )
    }

    return (
      <div className={className ?? 'report-detail-list'}>
        {data.map(node => (
          <DetailNode
            key={node.key}
            node={node}
            config={config}
            depth={0}
            isFuture={isFuture}
            useClickTrigger={useClickTrigger}
            expandedKeys={expandedKeys}
            onToggle={handleToggle}
          />
        ))}
      </div>
    )
  })()

  if (!title) return content

  return (
    <Card className="surface-card report-section-card" title={title} extra={extra} size="small">
      {content}
    </Card>
  )
}

export default ReportDetailList
