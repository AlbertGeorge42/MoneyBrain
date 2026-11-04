import { useMemo, useState } from 'react'
import { UnstyledButton } from '@mantine/core'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ErrorState } from '../transactions/TransactionStates'
import type { DataState, DeviceMode } from '../transactions/types'
import { ReportDrilldown } from './ReportDrilldown'
import { ReportTable } from './ReportTable'
import { ReportsEmptyState, ReportsLoadingState } from './ReportsStates'
import {
  REPORT_PERIODS,
  type ReportGranularity,
  type ReportRow,
  type ReportView,
} from './reports-mock'
import { findRow, flatRows } from './report-utils'

type ReportsScreenProps = {
  device: DeviceMode
  dataState: DataState
  onRecord: () => void
  onRetry: () => void
}

const VIEWS: Array<{ id: ReportView; label: string }> = [
  { id: 'flows', label: '收支明细' },
  { id: 'balance', label: '资产负债' },
]

const GRANULARITIES: Array<{ id: ReportGranularity; label: string }> = [
  { id: 'month', label: '月' },
  { id: 'year', label: '年' },
]

type DetailState = { tableId: string; rowId: string }

export function ReportsScreen({ device, dataState, onRecord, onRetry }: ReportsScreenProps) {
  const [view, setView] = useState<ReportView>('flows')
  const [granularity, setGranularity] = useState<ReportGranularity>('month')
  const [periodIndex, setPeriodIndex] = useState(REPORT_PERIODS.month.length - 1)
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const [mobileTable, setMobileTable] = useState(0)
  const [detail, setDetail] = useState<DetailState | null>(null)

  const periods = REPORT_PERIODS[granularity]
  const period = periods[Math.min(periodIndex, periods.length - 1)]
  const viewData = view === 'flows' ? period.flows : period.balance
  const tables = viewData.tables

  const tableRowCounts = useMemo(
    () => tables.map((table) => flatRows(table.rows, folded, table.id).length),
    [folded, tables],
  )
  const padTo = Math.max(...tableRowCounts)

  const detailTable = detail ? tables.find((table) => table.id === detail.tableId) ?? null : null
  const detailRow = detailTable && detail ? findRow(detailTable.rows, detail.rowId) : null

  const switchView = (next: ReportView) => {
    setView(next)
    setDetail(null)
    setMobileTable(0)
  }

  const switchGranularity = (next: ReportGranularity) => {
    setGranularity(next)
    setPeriodIndex(REPORT_PERIODS[next].length - 1)
    setDetail(null)
    setMobileTable(0)
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

  const openRow = (tableId: string, row: ReportRow) => {
    setDetail({ tableId, rowId: row.id })
  }

  const header = device === 'pc' ? (
    <header className="hf-page-header">
      <div>
        <h1 className="mb-title-5">报表</h1>
        <p className="mb-text-1">{period.asOf} · 数据来自本期记录</p>
      </div>
    </header>
  ) : null

  const toolbar = (
    <div className="rep-toolbar">
      <div className="rep-view-tabs" role="group" aria-label="报表视图">
        {VIEWS.map((item) => (
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

  const metrics = (
    <div className="rep-metric-strip" aria-label="本期指标">
      <div className="rep-metric-main">
        <span className="mb-text-0">{viewData.metrics.main.label}</span>
        <span className="rep-metric-value mb-num" data-tone={viewData.metrics.main.tone}>
          {viewData.metrics.main.value}
        </span>
      </div>
      <div className="rep-metric-grid">
        {viewData.metrics.cells.map((cell) => (
          <div key={cell.label} className="rep-metric-cell">
            <span className="mb-text-0">{cell.label}</span>
            <span className="rep-metric-cell-value mb-num" data-tone={cell.tone}>{cell.value}</span>
            {cell.hint && <span className="rep-metric-hint">{cell.hint}</span>}
          </div>
        ))}
      </div>
    </div>
  )

  const tableNote = (
    <p className="mb-text-0 rep-table-note">
      合计口径：父项金额为子项之和；折叠不改变合计；占比相对本表合计。
    </p>
  )

  const tableArea = dataState === 'ready' ? (
    <>
      {metrics}
      {device === 'mobile' ? (
        <>
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
          <div className="rep-tables rep-tables--single">
            <ReportTable
              table={tables[mobileTable]}
              periodLabel={period.label}
              device={device}
              folded={folded}
              onToggleFold={toggleFold}
              onOpenRow={(row) => openRow(tables[mobileTable].id, row)}
            />
          </div>
        </>
      ) : (
        <div className="rep-tables">
          {tables.map((table) => (
            <ReportTable
              key={table.id}
              table={table}
              periodLabel={period.label}
              device={device}
              folded={folded}
              padTo={padTo}
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
        onClose={() => setDetail(null)}
      />
    </main>
  )
}
