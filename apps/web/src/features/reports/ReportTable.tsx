/**
 * 报表明细表格（双端同一套行）
 *
 * 固定 29px 行高、数字右对齐、合计行内嵌在表尾（末页不重复）。
 * PC 用 ReportTablePair 左右并排；移动端分段单表、所有列一屏内显示不横滑，
 * 折叠按钮的 44px 热区在两端一致。
 */
import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Card } from '@/features/shared/Card'
import { Button } from '@/features/shared/Button'
import type { DeviceMode } from '@/features/shared/types'
import { PredictionBadge, ReportRowHint } from './prediction'
import type { ReportMetric } from './reportsModel'

export interface ReportColumn {
  label: string
  align?: 'num'
  /** 列头角标：紧贴列名的极短标记（如「测算」），说明该列口径。 */
  hint?: string
}

export interface ReportRow {
  id: string
  cells: ReactNode[]
  /** 0 = 一级分类 / 1 = 二级分类 / 2 = 分类下的账户。 */
  level?: 0 | 1 | 2
  fold?: { expanded: boolean; onToggle: () => void }
  onOpen?: () => void
  tone?: 'income' | 'expense' | 'neutral' | 'transfer'
  /** 行内后缀：紧贴首列名称的极短标记，不新增行。 */
  hint?: string
}

function MetricLabel({ metric }: { metric: ReportMetric }) {
  return (
    <span className="mb-rp-metric-label">
      {metric.label}
      {metric.hint && <span className="mb-rp-metric-hint">{metric.hint}</span>}
      {metric.prediction && <PredictionBadge kind="prediction" title={metric.prediction.split} />}
    </span>
  )
}

function MetricValue({ metric }: { metric: ReportMetric }) {
  return (
    <>
      <span className={`mb-rp-metric-value --${metric.tone ?? 'neutral'}`}>{metric.value}</span>
      {metric.prediction && (
        <span className="mb-rp-metric-split">{metric.prediction.split}</span>
      )}
    </>
  )
}

export function MetricStrip({
  device,
  metrics,
}: {
  device: DeviceMode
  metrics: ReportMetric[]
}) {
  const [main, ...rest] = metrics
  return (
    <section className="mb-rp-metrics" data-device={device} aria-label="本期指标">
      {main && (
        <div className="mb-rp-metric is-main">
          <MetricLabel metric={main} />
          <MetricValue metric={main} />
        </div>
      )}
      {rest.map((metric) => (
        <div className="mb-rp-metric" key={metric.label}>
          <MetricLabel metric={metric} />
          <MetricValue metric={metric} />
        </div>
      ))}
    </section>
  )
}

export interface ReportTableProps {
  device: DeviceMode
  title: string
  columns: ReportColumn[]
  rows: ReportRow[]
  total?: ReactNode[]
  /** 最小数据行数：按待切换/并排的两表最大行数补齐，保证 tfoot 位置固定、切换或并排时高度不跳变。 */
  minRows?: number
  note?: string
  variant?: 'c2' | 'c3' | 'c4' | 'c5' | 'c6'
  ariaLabel: string
}

export function ReportTable({
  device,
  title,
  columns,
  rows,
  total,
  minRows = 0,
  note,
  variant = 'c3',
  ariaLabel,
}: ReportTableProps) {
  const empty = rows.length === 0
  // 只要有一行可折叠，就给所有一级行预留同样的折叠槽，避免「有箭头/无箭头」两套缩进。
  const foldable = rows.some((row) => row.fold)
  return (
    <Card variant="report" className="mb-rp-table-card" data-device={device}>
      <div className="mb-rp-sec-head">
        <div>
          <h3 className="mb-rp-sec-title">{title}</h3>
        </div>
      </div>
      <div className="mb-rp-table-wrap">
        <table
          className={`mb-rp-table --${variant}${foldable ? ' is-foldable' : ''}`}
          aria-label={ariaLabel}
        >
          <colgroup>
            {columns.map((column, index) => (
              <col key={column.label + index} className={column.align === 'num' ? 'mb-rp-col-num' : 'mb-rp-col-main'} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.label + (column.align ?? '')}
                  className={column.align === 'num' ? 'is-num' : undefined}
                  scope="col"
                >
                  {column.label}
                  {column.hint && <span className="mb-rp-col-hint">{column.hint}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {empty ? (
              <tr>
                <td className="mb-rp-table-empty" colSpan={columns.length}>
                  该期间没有数据
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const interactive = Boolean(row.onOpen)
                return (
                  <tr
                    key={row.id}
                    className={`${row.level === 1 ? 'is-child' : row.level === 2 ? 'is-child-2' : ''}${interactive ? ' is-interactive' : ''}`}
                    data-tone={row.tone ?? undefined}
                    tabIndex={interactive ? 0 : undefined}
                    onClick={row.onOpen}
                    onKeyDown={
                      interactive
                        ? (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              row.onOpen?.()
                            }
                          }
                        : undefined
                    }
                  >
                    {row.cells.map((cell, index) => (
                      <td key={`${row.id}-${index}`} className={columns[index]?.align === 'num' ? 'is-num' : undefined}>
                        {index === 0 && foldable ? (
                          <span className="mb-rp-row-first">
                            {row.fold ? (
                              <Button
                                className="mb-rp-fold"
                                aria-expanded={row.fold.expanded}
                                aria-label={row.fold.expanded ? '收起子项' : '展开子项'}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  row.fold?.onToggle()
                                }}
                              >
                                {row.fold.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </Button>
                            ) : row.level ? null : (
                              // 子级行的 padding-left 已含折叠槽，再放占位会把缩进叠成 40px。
                              <span className="mb-rp-fold-space" aria-hidden="true" />
                            )}
                            <span className="mb-rp-row-first-label">{cell}</span>
                            {index === 0 && row.hint && <ReportRowHint hint={row.hint} />}
                          </span>
                        ) : (
                          <>
                            {cell}
                            {index === 0 && row.hint && <ReportRowHint hint={row.hint} />}
                          </>
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
            {Array.from({ length: Math.max(0, minRows - (empty ? 1 : rows.length)) }, (_, index) => (
              <tr key={`pad-${index}`} className="is-pad" aria-hidden="true" tabIndex={-1}>
                {columns.map((column) => (
                  <td key={column.label}>&nbsp;</td>
                ))}
              </tr>
            ))}
          </tbody>
          {total && (
            <tfoot>
              <tr className="is-total">
                {total.map((cell, index) => (
                  <td key={`total-${index}`} className={columns[index]?.align === 'num' ? 'is-num' : undefined}>
                    {cell}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {note && <p className="mb-rp-table-note">{note}</p>}
    </Card>
  )
}

/**
 * PC 左右双表：两张表统一补齐到较多者的行数，合计行才会落在同一水平线。
 * 三张报表（资产负债 / 收支明细 / 现金流）都从这里出，不再各自算 minRows。
 */
export function ReportTablePair({
  left,
  right,
}: {
  left: Omit<ReportTableProps, 'minRows'>
  right: Omit<ReportTableProps, 'minRows'>
}) {
  const minRows = Math.max(left.rows.length, right.rows.length)
  return (
    <div className="mb-rp-cols">
      <ReportTable {...left} minRows={minRows} />
      <ReportTable {...right} minRows={minRows} />
    </div>
  )
}
