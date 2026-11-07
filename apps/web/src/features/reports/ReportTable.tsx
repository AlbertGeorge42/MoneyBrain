/**
 * 报表表格与移动卡片行（HF 批次 3）
 *
 * PC 表格：固定 29px 行高、数字右对齐、合计行内嵌在表尾（末页不重复）；
 * 移动端按 platform-design 降级为卡片行，折叠热区仍 ≥ 44px。
 */
import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { DeviceMode } from '@/features/shared/types'
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

export interface CardRow {
  id: string
  label: string
  meta?: string
  hint?: string
  amount: ReactNode
  tone?: 'income' | 'expense' | 'neutral' | 'transfer'
  /** 0 = 一级分类 / 1 = 二级分类 / 2 = 分类下的账户。 */
  level?: 0 | 1 | 2
  share?: number
  barTone?: 'income' | 'expense' | 'accent'
  fold?: { expanded: boolean; onToggle: () => void }
  onOpen?: () => void
  /** 行内附加操作（如账户对账）；不影响整行点击。 */
  action?: ReactNode
}

function MetricLabel({ metric }: { metric: ReportMetric }) {
  return (
    <span className="mb-rp-metric-label">
      {metric.label}
      {metric.hint && <span className="mb-rp-metric-hint">{metric.hint}</span>}
      {metric.prediction && (
        <span
          className="mb-rp-metric-predict"
          title={metric.prediction.split}
          data-direction={metric.prediction.direction}
        >
          预测
        </span>
      )}
    </span>
  )
}

function MetricValue({ metric }: { metric: ReportMetric }) {
  return (
    <>
      <span className={`mb-rp-metric-value is-${metric.tone ?? 'neutral'}`}>{metric.value}</span>
      {metric.prediction && (
        <span className="mb-rp-metric-split">{metric.prediction.split}</span>
      )}
    </>
  )
}

export function MetricStrip({
  device,
  metrics,
  flat = false,
}: {
  device: DeviceMode
  metrics: ReportMetric[]
  flat?: boolean
}) {
  const [main, ...rest] = metrics
  if (flat) {
    return (
      <section className="mb-rp-metrics is-flat" data-device={device} aria-label="本期指标">
        {metrics.map((metric) => (
          <div className="mb-rp-metric" key={metric.label}>
            <MetricLabel metric={metric} />
            <MetricValue metric={metric} />
          </div>
        ))}
      </section>
    )
  }

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

export function ReportTable({
  device,
  title,
  desc,
  columns,
  rows,
  total,
  minRows = 0,
  note,
  variant = 'c3',
  ariaLabel,
  footInline = false,
  scrollable = false,
}: {
  device: DeviceMode
  title: string
  desc?: string
  columns: ReportColumn[]
  rows: ReportRow[]
  total?: ReactNode[]
  /** 并排两表的最小数据行数：按两表最大行数补齐，保证 tfoot 同 y。 */
  minRows?: number
  note?: string
  variant?: 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'tree'
  ariaLabel: string
  footInline?: boolean
  /** 移动端横向滚动 + 首列吸顶：用于列数多、无法卡片化的单表。 */
  scrollable?: boolean
}) {
  const empty = rows.length === 0
  // 只要有一行可折叠，就给所有一级行预留同样的折叠槽，避免「有箭头/无箭头」两套缩进。
  const foldable = rows.some((row) => row.fold)
  return (
    <section className={footInline ? 'mb-rp-card mb-rp-table-card is-inline' : 'mb-rp-card mb-rp-table-card'} data-device={device}>
      <div className="mb-rp-sec-head">
        <div>
          <h3 className="mb-rp-sec-title">{title}</h3>
          {desc && <p className="mb-rp-sec-desc">{desc}</p>}
        </div>
      </div>
      <div className="mb-rp-table-wrap">
        <table
          className={`mb-rp-table is-${variant}${scrollable ? ' is-scroll' : ''}${foldable ? ' is-foldable' : ''}`}
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
                              <button
                                type="button"
                                className="mb-rp-fold"
                                aria-expanded={row.fold.expanded}
                                aria-label={row.fold.expanded ? '收起子项' : '展开子项'}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  row.fold?.onToggle()
                                }}
                              >
                                {row.fold.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            ) : row.level ? null : (
                              // 子级行的 padding-left 已含折叠槽，再放占位会把缩进叠成 40px。
                              <span className="mb-rp-fold-space" aria-hidden="true" />
                            )}
                            <span className="mb-rp-row-first-label">{cell}</span>
                            {index === 0 && row.hint && <span className="mb-rp-row-hint">{row.hint}</span>}
                          </span>
                        ) : (
                          <>
                            {cell}
                            {index === 0 && row.hint && <span className="mb-rp-row-hint">{row.hint}</span>}
                          </>
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
            {Array.from({ length: empty ? 0 : Math.max(0, minRows - rows.length) }, (_, index) => (
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
    </section>
  )
}

export function ReportCardList({
  device,
  title,
  desc,
  rows,
  total,
  note,
  emptyText = '该期间没有数据',
}: {
  device: DeviceMode
  title: string
  desc?: string
  rows: CardRow[]
  total?: { label: string; value: ReactNode }
  note?: string
  emptyText?: string
}) {
  if (device === 'desktop') return null
  return (
    <section className="mb-rp-card mb-rp-cards">
      <div className="mb-rp-sec-head">
        <div>
          <h3 className="mb-rp-sec-title">{title}</h3>
          {desc && <p className="mb-rp-sec-desc">{desc}</p>}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="mb-rp-empty-line">{emptyText}</p>
      ) : (
        <div className="mb-rp-crow-list">
          {rows.map((row) => (
            <div
              key={row.id}
              className={`mb-rp-crow${row.level === 1 ? ' is-child' : row.level === 2 ? ' is-child-2' : ''}${row.onOpen ? ' is-interactive' : ''}`}
            >
              {row.fold && (
                <button
                  type="button"
                  className="mb-rp-crow-fold"
                  aria-expanded={row.fold.expanded}
                  aria-label={row.fold.expanded ? '收起子项' : '展开子项'}
                  onClick={row.fold.onToggle}
                >
                  {row.fold.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
              )}
              <button
                type="button"
                className="mb-rp-crow-main"
                disabled={!row.onOpen}
                onClick={row.onOpen}
              >
                <span className="mb-rp-crow-copy">
                  <span className="mb-rp-crow-label-wrap">
                    <span className="mb-rp-crow-label">{row.label}</span>
                    {row.hint && <span className="mb-rp-row-hint">{row.hint}</span>}
                  </span>
                  {row.meta && <span className="mb-rp-crow-meta">{row.meta}</span>}
                </span>
                <span className={`mb-rp-crow-amount is-${row.tone ?? 'neutral'}`}>{row.amount}</span>
              </button>
              {row.action}
              {row.share !== undefined && (
                <progress
                  className={`mb-rp-crow-bar is-${row.barTone ?? 'accent'}`}
                  value={Math.min(100, row.share)}
                  max={100}
                  aria-label={`占比 ${row.share.toFixed(1)}%`}
                />
              )}
            </div>
          ))}
        </div>
      )}
      {total && rows.length > 0 && (
        <div className="mb-rp-crow-total">
          <span>{total.label}</span>
          <span className="mb-rp-crow-amount">{total.value}</span>
        </div>
      )}
      {note && <p className="mb-rp-table-note">{note}</p>}
    </section>
  )
}
