/**
 * 收支明细视图：指标条 + 收支走势 / 构成图 + 收入 / 支出双表。
 * 展开状态由页面持有，这里只按固定四列派生可见行；数据范围回显在页面控件行标记。
 */
import type { FoldState } from '@/features/shared/foldState'
import type { DeviceMode } from '@/features/shared/types'
import { CompositionBars, ReportBarChart, type DonutKind } from './charts'
import {
  MetricStrip,
  ReportCardList,
  ReportTablePair,
  type ReportColumn,
} from './ReportTable'
import { chartGrid } from './reportsShared'
import { HfSegmented } from '@/features/shared/HfSegmented'
import { flattenTreeCards, flattenTreeRows } from './reportRows'
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
    childLegend: true,
    signed: true,
    tone: kind,
    barTone: kind,
    onOpen: (node: FlowTreeNode) => onDrill(node, kind),
  })
  const incomeRows = flattenTreeRows(report.incomeTrees, expanded, onFold, flowOptions('income'))
  const expenseRows = flattenTreeRows(report.expenseTrees, expanded, onFold, flowOptions('expense'))
  const incomeCards = flattenTreeCards(report.incomeTrees, expanded, onFold, flowOptions('income'))
  const expenseCards = flattenTreeCards(report.expenseTrees, expanded, onFold, flowOptions('expense'))
  // 子级行只挂「†」，含义放在已有合计说明位，不新增行。
  const childLegend = (nodes: FlowTreeNode[]) =>
    nodes.some((node) => node.children.length > 0) ? ' · † 子级已计入父级' : ''

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
          left={{
            device,
            title: '收入构成',
            desc: `合计 ${currency(report.income)}${childLegend(report.incomeTrees)}`,
            ariaLabel: '收入构成',
            variant: 'c4',
            columns: FLOW_COLUMNS,
            rows: incomeRows,
            total: flowTotal(report.income),
          }}
          right={{
            device,
            title: '支出构成',
            desc: `合计 ${currency(report.expense)}${childLegend(report.expenseTrees)}`,
            ariaLabel: '支出构成',
            variant: 'c4',
            columns: FLOW_COLUMNS,
            rows: expenseRows,
            total: flowTotal(report.expense),
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
          <ReportCardList
            device={device}
            title={side === 'expense' ? '支出构成' : '收入构成'}
            desc={`合计 ${currency(side === 'expense' ? report.expense : report.income)}${childLegend(
              side === 'expense' ? report.expenseTrees : report.incomeTrees,
            )}`}
            rows={side === 'expense' ? expenseCards : incomeCards}
            total={{
              label: '合计',
              value: currency(side === 'expense' ? report.expense : report.income),
            }}
          />
        </>
      )}
    </>
  )
}
