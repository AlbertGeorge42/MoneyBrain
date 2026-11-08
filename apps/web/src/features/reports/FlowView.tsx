/**
 * 收支明细视图：指标条 + 收支走势 / 构成图 + 收入 / 支出双表。
 * 折叠与下钻状态由页面持有，这里只按当前口径派生可见行。
 * 「含不计收支交易」是数据范围，入口在报表设置，回显在页面控件行标记，本视图不再重复说明。
 */
import type { DeviceMode } from '@/features/shared/types'
import { CompositionBars, ReportBarChart, type DonutKind } from './charts'
import { MetricStrip, ReportCardList, ReportTable, type CardRow, type ReportColumn } from './ReportTable'
import { chartGrid } from './reportsShared'
import { HfSegmented } from '@/features/shared/HfSegmented'
import { flattenFlowCards, flattenFlowRows } from './reportRows'
import { currency, type FlowReport, type FlowTreeNode } from './reportsModel'
import type { ReportViewSettings } from './reportSettings'

export function FlowView({
  device,
  report,
  settings,
  side,
  onSide,
  folded,
  onFold,
  onDrill,
  colorUniverse,
}: {
  device: DeviceMode
  report: FlowReport
  settings: ReportViewSettings['flow']
  side: 'income' | 'expense'
  onSide: (next: 'income' | 'expense') => void
  folded: Record<string, boolean>
  onFold: (id: string) => void
  onDrill: (node: FlowTreeNode, kind: DonutKind) => void
  colorUniverse?: { income?: readonly string[]; expense?: readonly string[] }
}) {
  const rowColumns = { showCount: settings.showCountColumn, showShare: settings.showShareColumn }
  const incomeRows = flattenFlowRows(
    report.incomeTrees,
    folded,
    onFold,
    (node) => onDrill(node, 'income'),
    rowColumns,
  )
  const expenseRows = flattenFlowRows(
    report.expenseTrees,
    folded,
    onFold,
    (node) => onDrill(node, 'expense'),
    rowColumns,
  )
  const incomeCards: CardRow[] = flattenFlowCards(
    report.incomeTrees,
    folded,
    onFold,
    'income',
    (node) => onDrill(node, 'income'),
    rowColumns,
  )
  const expenseCards: CardRow[] = flattenFlowCards(
    report.expenseTrees,
    folded,
    onFold,
    'expense',
    (node) => onDrill(node, 'expense'),
    rowColumns,
  )
  const flowColumns: ReportColumn[] = [
    { label: '分类' },
    ...(settings.showCountColumn ? [{ label: '笔数' }] : []),
    { label: '金额', align: 'num' as const },
    ...(settings.showShareColumn ? [{ label: '占比', align: 'num' as const }] : []),
  ]
  const flowTotal = (amount: number) => [
    '合计',
    ...(settings.showCountColumn ? [''] : []),
    currency(amount),
    ...(settings.showShareColumn ? ['100.0%'] : []),
  ]
  const flowVariant = flowColumns.length === 4 ? 'c4' : 'c3'
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
            namedCount={settings.namedCategories}
            colorUniverse={colorUniverse}
          />
        </>,
      )}
      {device === 'desktop' ? (
        <div className="mb-rp-cols">
          <ReportTable
            device={device}
            title="收入构成"
            desc={`合计 ${currency(report.income)}${childLegend(report.incomeTrees)}`}
            ariaLabel="收入构成"
            variant={flowVariant}
            columns={flowColumns}
            rows={incomeRows}
            minRows={Math.max(incomeRows.length, expenseRows.length)}
            total={flowTotal(report.income)}
          />
          <ReportTable
            device={device}
            title="支出构成"
            desc={`合计 ${currency(report.expense)}${childLegend(report.expenseTrees)}`}
            ariaLabel="支出构成"
            variant={flowVariant}
            columns={flowColumns}
            rows={expenseRows}
            minRows={Math.max(incomeRows.length, expenseRows.length)}
            total={flowTotal(report.expense)}
          />
        </div>
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
