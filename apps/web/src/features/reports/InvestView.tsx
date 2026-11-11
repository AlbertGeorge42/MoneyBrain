/**
 * 投资分析视图：指标条 + 净值走势 / 资产分布图 + 持仓明细表。
 * 顺序沿用后端（即设置中的账户 / 分类顺序）、走势固定近 6 期、目标比例固定显示；折叠列表默认收起。
 */
import { useState } from 'react'
import type { DeviceMode } from '@/features/shared/types'
import { formatPercent } from '@/utils/format'
import { isExpanded, toggleFold, type FoldState } from '@/features/shared/foldState'
import { AllocationBars, ChartCard, ReportLineChart } from './charts'
import { MetricStrip, ReportTable, type ReportRow } from './ReportTable'
import { chartGrid } from './reportsShared'
import { currency, signedCurrency, type InvestmentReport } from './reportsModel'
import { sliceSnapshots } from './reportSettings'

export function InvestView({
  device,
  report,
}: {
  device: DeviceMode
  report: InvestmentReport
}) {
  const [expanded, setExpanded] = useState<FoldState>({})
  // 不再按金额重排：账户与其下资产类型的顺序由设置决定。
  const holdings = report.holdings
  const trend = sliceSnapshots(report.trend)

  const rows: ReportRow[] = []
  for (const group of holdings) {
    const open = isExpanded(expanded, group.id)
    rows.push({
      id: group.id,
      cells: [
        group.name,
        currency(group.marketValue),
        currency(group.cost),
        signedCurrency(group.gain),
        formatPercent(group.rate, 2),
      ],
      fold: group.children.length > 0
        ? { expanded: open, onToggle: () => setExpanded((current) => toggleFold(current, group.id)) }
        : undefined,
      tone: group.gain >= 0 ? 'income' : 'expense',
    })
    if (open) {
      for (const child of group.children) {
        rows.push({
          id: child.id,
          level: 1,
          cells: [
            child.name,
            currency(child.marketValue),
            currency(child.cost),
            signedCurrency(child.gain),
            formatPercent(child.rate, 2),
          ],
          tone: child.gain >= 0 ? 'income' : 'expense',
        })
      }
    }
  }

  const totalRate = report.costTotal === 0 ? 0 : (report.gainTotal / report.costTotal) * 100

  return (
    <>
      <MetricStrip device={device} metrics={report.metrics} />
      {chartGrid(
        device,
        <>
          <ReportLineChart
            device={device}
            title="净值走势 · 近 6 期"
            points={trend.map((point) => ({ label: point.month, value: point.value }))}
            ariaLabel="投资净值走势"
          />
          <ChartCard title="资产分布">
            <AllocationBars rows={report.allocation} />
          </ChartCard>
        </>,
      )}
      <ReportTable
        device={device}
        title="持仓明细"
        desc={`总市值 ${currency(report.total)} · 成本 ${currency(report.costTotal)}`}
        ariaLabel="投资持仓明细"
        variant="c5"
        scrollable
        columns={[
          { label: '持仓' },
          { label: '市值', align: 'num' },
          { label: '成本', align: 'num', hint: '测算' },
          { label: '收益', align: 'num' },
          { label: '收益率', align: 'num' },
        ]}
        rows={rows}
        total={[
          '合计',
          currency(report.total),
          currency(report.costTotal),
          signedCurrency(report.gainTotal),
          formatPercent(totalRate, 2),
        ]}
      />
    </>
  )
}
