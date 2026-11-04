import { useMemo, useState } from 'react'
import { UnstyledButton } from '@mantine/core'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ColorScheme } from '../../styles/theme/tokens'
import { ErrorState } from '../transactions/TransactionStates'
import type { DataState, DeviceMode, Transaction, TransactionFilters } from '../transactions/types'
import { ReportCharts } from './ReportCharts'
import { ReportDrilldown } from './ReportDrilldown'
import { ReportTable } from './ReportTable'
import { ReportsEmptyState, ReportsLoadingState } from './ReportsStates'
import {
  REPORT_PERIODS,
  type ReportGranularity,
  type ReportPeriod,
  type ReportRow,
  type ReportView,
} from './reports-mock'
import { findRow, flatRows, sortRows, type ReportSort } from './report-utils'

type ReportsScreenProps = {
  device: DeviceMode
  scheme: ColorScheme
  dataState: DataState
  items: Transaction[]
  periods?: Record<ReportGranularity, ReportPeriod[]>
  /** 生产可用视图；未接入的视图不显示入口。 */
  views?: ReportView[]
  /** 生产数据：文案不再标注「预览示例」。 */
  production?: boolean
  onRecord: () => void
  onRetry: () => void
  onOpenTransactions: (filters: Partial<TransactionFilters>) => void
}

const VIEWS: Array<{ id: ReportView; label: string }> = [
  { id: 'flows', label: '收支明细' },
  { id: 'balance', label: '资产负债' },
  { id: 'cash', label: '现金流' },
  { id: 'investment', label: '投资分析' },
]

const GRANULARITIES: Array<{ id: ReportGranularity; label: string }> = [
  { id: 'month', label: '月' },
  { id: 'year', label: '年' },
]

type DetailState = { tableId: string; rowId: string }

export function ReportsScreen({
  device,
  scheme,
  dataState,
  items,
  periods: periodData = REPORT_PERIODS,
  views: availableViews,
  production = false,
  onRecord,
  onRetry,
  onOpenTransactions,
}: ReportsScreenProps) {
  const [view, setView] = useState<ReportView>('flows')
  const [granularity, setGranularity] = useState<ReportGranularity>('month')
  const [periodIndex, setPeriodIndex] = useState(REPORT_PERIODS.month.length - 1)
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const [mobileTable, setMobileTable] = useState(0)
  const [sort, setSort] = useState<ReportSort | null>(null)
  const [detail, setDetail] = useState<DetailState | null>(null)

  const viewTabs = availableViews
    ? VIEWS.filter((item) => availableViews.includes(item.id))
    : VIEWS
  const periods = periodData[granularity].length > 0
    ? periodData[granularity]
    : REPORT_PERIODS[granularity]
  const period = periods[Math.min(periodIndex, periods.length - 1)]
  const viewData = period.views[view]
  const tables = viewData.tables

  const displayTables = useMemo(
    () => tables.map((table) =>
      sort && table.kind === 'investment' ? { ...table, rows: sortRows(table.rows, sort) } : table),
    [tables, sort],
  )

  const tableRowCounts = useMemo(
    () => displayTables.map((table) => flatRows(table.rows, folded, table.id).length),
    [displayTables, folded],
  )
  const padTo = Math.max(...tableRowCounts)

  const detailTable = detail ? displayTables.find((table) => table.id === detail.tableId) ?? null : null
  const detailRow = detailTable && detail ? findRow(detailTable.rows, detail.rowId) : null

  const switchView = (next: ReportView) => {
    setView(next)
    setDetail(null)
    setMobileTable(0)
    setSort(null)
  }

  const switchGranularity = (next: ReportGranularity) => {
    setGranularity(next)
    setPeriodIndex(periodData[next].length - 1)
    setDetail(null)
    setMobileTable(0)
    setSort(null)
  }

  const stepPeriod = (delta: -1 | 1) => {
    setPeriodIndex((current) => Math.min(Math.max(current + delta, 0), periods.length - 1))
    setDetail(null)
  }

  const toggleFold = (key: string) => {
    setFolded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleSort = (key: ReportSort['key']) => {
    setSort((current) => {
      if (!current || current.key !== key) return { key, direction: 'desc' }
      if (current.direction === 'desc') return { key, direction: 'asc' }
      return null
    })
  }

  const openRow = (tableId: string, row: ReportRow) => {
    setDetail({ tableId, rowId: row.id })
  }

  const header = device === 'pc' ? (
    <header className="hf-page-header">
      <div>
        <h1 className="mb-title-5">报表</h1>
        <p className="mb-text-1">
          {period.asOf} · {production ? '数据取自当前账本' : '预览示例数据 · 相关流水取自当前账本'}
        </p>
      </div>
    </header>
  ) : null

  const toolbar = (
    <div className="rep-toolbar">
      <div className="rep-view-tabs" role="group" aria-label="报表视图">
        {viewTabs.map((item) => (
          <UnstyledButton
            key={item.id}
            className="rep-view-tab"
            data-active={view === item.id}
            aria-pressed={view === item.id}
            onClick={() => switchView(item.id)}
          >
            {item.label}
          </UnstyledButton>
        ))}
      </div>

      <div className="rep-timebar">
        <UnstyledButton
          className="rep-period-btn"
          aria-label="上一期"
          disabled={periodIndex === 0}
          onClick={() => stepPeriod(-1)}
        >
          <ChevronLeft aria-hidden />
        </UnstyledButton>
        <span className="rep-period-value mb-num" aria-live="polite">{period.label}</span>
        <UnstyledButton
          className="rep-period-btn"
          aria-label="下一期"
          disabled={periodIndex >= periods.length - 1}
          onClick={() => stepPeriod(1)}
        >
          <ChevronRight aria-hidden />
        </UnstyledButton>
        <div className="rep-granularity" role="group" aria-label="时间粒度">
          {GRANULARITIES.map((item) => (
            <UnstyledButton
              key={item.id}
              className="rep-granularity-btn"
              data-active={granularity === item.id}
              aria-pressed={granularity === item.id}
              onClick={() => switchGranularity(item.id)}
            >
              {item.label}
            </UnstyledButton>
          ))}
        </div>
      </div>
    </div>
  )

  const metricCell = (metric: typeof viewData.metrics.main) => (
    <div key={metric.label} className="rep-metric-cell">
      <span className="mb-text-0">{metric.label}</span>
      <span className="rep-metric-cell-value mb-num" data-tone={metric.tone}>{metric.value}</span>
      {metric.hint && <span className="rep-metric-hint">{metric.hint}</span>}
    </div>
  )

  const metrics = viewData.metricsLayout === 'flat' ? (
    <div className="rep-metric-strip rep-metric-strip--flat" aria-label="本期指标">
      {[viewData.metrics.main, ...viewData.metrics.cells].map((metric) => metricCell(metric))}
    </div>
  ) : (
    <div className="rep-metric-strip" aria-label="本期指标">
      <div className="rep-metric-main">
        <span className="mb-text-0">{viewData.metrics.main.label}</span>
        <span className="rep-metric-value mb-num" data-tone={viewData.metrics.main.tone}>
          {viewData.metrics.main.value}
        </span>
      </div>
      <div className="rep-metric-grid">
        {viewData.metrics.cells.map((cell) => metricCell(cell))}
      </div>
    </div>
  )

  const tableNote = (
    <p className="mb-text-0 rep-table-note">
      合计口径：父项金额为子项之和；折叠不改变合计；占比相对本表合计。
      {production ? '' : '报表金额为预览示例。'}
    </p>
  )

  const tableArea = dataState === 'ready' ? (
    <>
      {metrics}
      <ReportCharts view={viewData} device={device} scheme={scheme} />
      {device === 'mobile' ? (
        <>
          {tables.length > 1 && (
            <div className="rep-table-switch" role="group" aria-label="切换表格">
              {tables.map((table, index) => (
                <UnstyledButton
                  key={table.id}
                  className="rep-table-switch-btn"
                  data-active={mobileTable === index}
                  aria-pressed={mobileTable === index}
                  onClick={() => setMobileTable(index)}
                >
                  {table.title}
                </UnstyledButton>
              ))}
            </div>
          )}
          <div className="rep-tables rep-tables--single">
            <ReportTable
              table={displayTables[mobileTable] ?? displayTables[0]}
              periodLabel={period.label}
              device={device}
              folded={folded}
              sort={sort}
              onSort={toggleSort}
              onToggleFold={toggleFold}
              onOpenRow={(row) => openRow(displayTables[mobileTable]?.id ?? displayTables[0].id, row)}
            />
          </div>
        </>
      ) : (
        <div className="rep-tables">
          {displayTables.map((table) => (
            <ReportTable
              key={table.id}
              table={table}
              periodLabel={period.label}
              device={device}
              folded={folded}
              padTo={padTo}
              sort={sort}
              onSort={toggleSort}
              onToggleFold={toggleFold}
              onOpenRow={(row) => openRow(table.id, row)}
            />
          ))}
        </div>
      )}
      {tableNote}
    </>
  ) : dataState === 'error' ? (
    <ErrorState onRetry={onRetry} />
  ) : dataState === 'loading' ? (
    <ReportsLoadingState />
  ) : (
    <ReportsEmptyState onRecord={onRecord} />
  )

  return (
    <main className="rep-page" data-device={device}>
      {header}
      {toolbar}
      {tableArea}
      <ReportDrilldown
        open={Boolean(detailRow)}
        device={device}
        period={period}
        table={detailTable}
        row={detailRow}
        items={items}
        onClose={() => setDetail(null)}
        onOpenTransactions={onOpenTransactions}
      />
    </main>
  )
}
