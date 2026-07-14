 import React, { useState } from 'react'
import { Card, Empty, Skeleton } from 'antd'
import { ArrowDownRight, ArrowUpRight, ChevronRight } from 'lucide-react'
import CategoryIcon from './CategoryIcon'
import PredictionPopover from './PredictionPopover'
import { formatCurrency, formatPercent } from '../../utils/format'

// ===== Types =====

export interface ReportTreeNode<M = Record<string, number | string | null>> {
  key: string
  name: string
  icon?: string | null
  /** AntD 13 个官方色名（pink/red/.../gold），由用户为账户/分类设置 */
  iconColor?: string | null
  children?: ReportTreeNode<M>[]
  metrics?: M
}

export interface PredictionConfig {
  displayMetric: string
  actualMetric: string
  predictedMetric: string
}

export interface TrendConfig<M = Record<string, number | string | null>> {
  /** 环比数值的 metric key（数值单位为百分比，如 5.2 表示 +5.2%） */
  metric: keyof M & string
  /** 自定义格式化函数，默认使用 formatPercent(value, 1, false) */
  format?: (value: number) => string
  /** 正值是否"有利"（默认 true）。
   *  - true：正值显示绿色，负值显示红色（适用于资产/收入等）
   *  - false：正值显示红色，负值显示绿色（适用于支出等"越少越好"） */
  positiveIsGood?: boolean
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
  trend?: TrendConfig<M>
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

function resolveTrend<M>(column: ReportDetailColumn<M>, node: ReportTreeNode<M>): {
  value: number
  formatted: string
  isPositive: boolean
  isGood: boolean
} | null {
  if (!column.trend) return null
  const raw = (node.metrics as Record<string, unknown> | undefined)?.[column.trend.metric]
  if (raw == null || raw === 0) return null
  const value = Number(raw)
  if (Number.isNaN(value)) return null
  const positiveIsGood = column.trend.positiveIsGood ?? true
  const formatted = column.trend.format ? column.trend.format(value) : formatPercent(value, 1, false)
  return {
    value,
    formatted,
    isPositive: value > 0,
    isGood: positiveIsGood ? value > 0 : value < 0,
  }
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
      const trend = resolveTrend(column, node)

      return (
        <span className="report-detail-cell">
          {trend && (
            <span className={`report-detail-trend${trend.isGood ? ' report-detail-trend--good' : ' report-detail-trend--bad'}`}>
              {trend.isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              <span className="report-detail-trend__value">{trend.formatted}</span>
            </span>
          )}
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
  const trend = resolveTrend(column, node)

  return (
    <span className="report-detail-cell">
      {trend && (
        <span className={`report-detail-trend${trend.isGood ? ' report-detail-trend--good' : ' report-detail-trend--bad'}`}>
          {trend.isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          <span className="report-detail-trend__value">{trend.formatted}</span>
        </span>
      )}
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
  const isTopLevel = depth === 0
  const icon = node.icon ?? (hasChildren ? config.parentIcon : config.leafIcon)
  const isExpanded = expandedKeys.has(node.key)
  // 一级（顶层）类别统一使用大图标；二级（子级）缩小以建立视觉层级
  const iconSize = isTopLevel ? 32 : 22
  const innerIconSize = isTopLevel ? 18 : 13
  // 行级 class 始终按"是否一级"判定，确保一级类别字体加粗/颜色变深不依赖是否有子级数据
  const rowClass = [
    'report-detail-row',
    isTopLevel ? 'report-detail-row--parent' : 'report-detail-row--leaf',
    isExpanded ? 'report-detail-row--expanded' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const handleToggle = () => {
    if (hasChildren) onToggle(node.key)
  }

  return (
    <>
      <div
        className={rowClass}
        // 子级 paddingLeft：13px = 5px图标半径补偿 + 8px行自身padding，使一二级图标圆心对齐；之后每层缩进 16px
        style={depth > 0 ? { paddingLeft: `${13 + (depth - 1) * 16}px` } : undefined}
      >
        <span className="report-detail-row__name-area">
          {hasChildren ? (
            <span
              className="report-detail-row__chevron"
              role="button"
              tabIndex={0}
              aria-label={isExpanded ? '折叠' : '展开'}
              onClick={handleToggle}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleToggle()
                }
              }}
            >
              <ChevronRight size={14} />
            </span>
          ) : (
            <span className="report-detail-row__chevron-spacer" aria-hidden />
          )}
          {icon && (
            <CategoryIcon
              name={icon}
              color={node.iconColor ?? undefined}
              size={iconSize}
              iconSize={innerIconSize}
            />
          )}
          <span
            className={`report-detail-row__name${hasChildren ? ' report-detail-row__name--expandable' : ''}`}
            onClick={hasChildren ? handleToggle : undefined}
          >
            {node.name}
          </span>
        </span>
        <span className="report-detail-row__values">
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
      {hasChildren && isExpanded && node.children!.map(child => (
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
    </>
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
            <div key={i} className="report-detail-row report-detail-row--skeleton">
              <span className="report-detail-row__name-area">
                <Skeleton.Input active size="small" style={{ width: 120 }} />
              </span>
              <span className="report-detail-row__values">
                <Skeleton.Input active size="small" style={{ width: 80 }} />
              </span>
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
