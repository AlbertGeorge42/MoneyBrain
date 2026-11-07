/**
 * 投资分析视图：指标条 + 净值走势 / 资产分布图 + 持仓明细表。
 * 排序与快照期数只改显示，不重算金额。
 */
import { useState } from 'react'
import type { DeviceMode } from '@/features/shared/types'
import { formatPercent } from '@/utils/format'
import { AllocationBars, ChartCard, ReportLineChart } from './charts'
import { MetricStrip, ReportTable, type ReportRow } from './ReportTable'
import { chartGrid } from './reportsShared'
import { currency, signedCurrency, type InvestmentReport } from './reportsModel'
import { sliceSnapshots, sortHoldingRows, type ReportViewSettings } from './reportSettings'

export function InvestView({
  device,
  report,
  settings,
}: {
  device: DeviceMode
  report: InvestmentReport
  settings: ReportViewSettings['invest']
}) {
  const [folded, setFolded] = useState<Record<string, boolean>>({})
  // 排序只改显示行序：先排账户，再排账户下的资产类型。
  const holdings = sortHoldingRows(report.holdings, settings.sortBy).map((group) => ({
    ...group,
    children: sortHoldingRows(group.children, settings.sortBy),
  }))
  const trend = sliceSnapshots(report.trend, settings.snapshotCount)

  const rows: ReportRow[] = []
  for (const group of holdings) {
    const expanded = folded[group.id] !== false
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
        ? {
            expanded,
            onToggle: () =>
              setFolded((current) => ({ ...current, [group.id]: current[group.id] === false })),
          }
        : undefined,
      tone: group.gain >= 0 ? 'income' : 'expense',
    })
    if (expanded) {
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

  const trendChart = (
    <ReportLineChart
      device={device}
      title={`净值走势 · 近 ${settings.snapshotCount} 期`}
      points={trend.map((point) => ({ label: point.month, value: point.value }))}
      ariaLabel="投资净值走势"
    />
  )
  const allocationChart = (
    <ChartCard title="资产分布">
      <AllocationBars rows={report.allocation} showTarget={settings.showTarget} />
    </ChartCard>
  )

  return (
    <>
      <MetricStrip device={device} metrics={report.metrics} />
      {chartGrid(device, <>{trendChart}{allocationChart}</>)}
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
