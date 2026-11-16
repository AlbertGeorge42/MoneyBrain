/**
 * 收支明细视图：指标条 + 收支走势 / 构成图 + 支出 / 收入双表（左支出右收入，与移动端分段同序）。
 * 展开状态由页面持有，这里只按固定四列派生可见行；数据范围回显在页面控件行标记。
 */
import type { FoldState } from '@/features/shared/foldState'
import type { DeviceMode } from '@/features/shared/types'
import { CompositionBars, ReportBarChart, type DonutKind } from './charts'
import {
  MetricStrip,
  ReportTable,
  ReportTablePair,
  type ReportColumn,
} from './ReportTable'
import { chartGrid } from './reportsShared'
import { HfSegmented } from '@/features/shared/HfSegmented'
import { flattenTreeRows } from './reportRows'
import { currency, type FlowReport, type FlowTreeNode } from './reportsModel'

const FLOW_COLUMNS: ReportColumn[] = [
  { label: '分类' },
  { label: '笔数' },
  { label: '金额', align: 'num' },
  { label: '占比', align: 'num' },
]

const flowTotal = (amount: number) => ['合计', '', currency(amount), '100.0%']

export function FlowView({
  device,
  report,
  side,
  onSide,
  expanded,
  onFold,
  onDrill,
  colorUniverse,
}: {
  device: DeviceMode
  report: FlowReport
  side: 'income' | 'expense'
  onSide: (next: 'income' | 'expense') => void
  expanded: FoldState
  onFold: (id: string) => void
  onDrill: (node: FlowTreeNode, kind: DonutKind) => void
  colorUniverse?: { income?: readonly string[]; expense?: readonly string[] }
}) {
  const flowOptions = (kind: 'income' | 'expense') => ({
    unit: '笔',
    onOpen: (node: FlowTreeNode) => onDrill(node, kind),
  })
  const incomeRows = flattenTreeRows(report.incomeTrees, expanded, onFold, flowOptions('income'))
  const expenseRows = flattenTreeRows(report.expenseTrees, expanded, onFold, flowOptions('expense'))
  // 移动端分段单表：两段补齐到相同行数，切换标签时 tbody 行数与合计行位置不变、高度不跳变。
  const mobileMinRows = Math.max(incomeRows.length, expenseRows.length)

  return (
    <>
      <MetricStrip device={device} metrics={report.metrics} />
      {report.predictionNote && <p className="mb-rp-predict-note">{report.predictionNote}</p>}
      {chartGrid(
        device,
        <>
          <ReportBarChart
            device={device}
            title="收支走势"
            series={report.series}
            ariaLabel="本期收支走势"
          />
          <CompositionBars
            incomeTrees={report.incomeTrees}
            expenseTrees={report.expenseTrees}
            incomeTotal={report.income}
            expenseTotal={report.expense}
            device={device}
            onOpen={onDrill}
            colorUniverse={colorUniverse}
          />
        </>,
      )}
      {device === 'desktop' ? (
        <ReportTablePair
          // 与移动端分段、构成环同序：支出在左、收入在右。
          left={{
            device,
            title: '支出构成',
            ariaLabel: '支出构成',
            variant: 'c4',
            columns: FLOW_COLUMNS,
            rows: expenseRows,
            total: flowTotal(report.expense),
          }}
          right={{
            device,
            title: '收入构成',
            ariaLabel: '收入构成',
            variant: 'c4',
            columns: FLOW_COLUMNS,
            rows: incomeRows,
            total: flowTotal(report.income),
          }}
        />
      ) : (
        <>
          <HfSegmented
            variant="report"
            label="收支分段"
            value={side}
            options={[
              { id: 'expense', label: '支出' },
              { id: 'income', label: '收入' },
            ]}
            onChange={onSide}
          />
          <ReportTable
            device={device}
            title={side === 'expense' ? '支出构成' : '收入构成'}
            ariaLabel={side === 'expense' ? '支出构成' : '收入构成'}
            columns={FLOW_COLUMNS}
            rows={side === 'expense' ? expenseRows : incomeRows}
            minRows={mobileMinRows}
            variant="c4"
            total={flowTotal(side === 'expense' ? report.expense : report.income)}
          />
        </>
      )}
    </>
  )
}
