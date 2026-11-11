/**
 * 资产负债视图：指标条 + 净值走势 + 资产 / 负债单框双环 + 资产 / 负债双表（移动端卡片）。
 *
 * 表格与两张环图共用同一份「账户分类 → 账户」树：一级先给分类占比，
 * 点分类进入该分类下的账户，顺序沿用设置里的拖拽顺序，默认全部折叠。
 * 构成环与收支明细同款：一个图表框内左右两环，图表顺序为先走势图、再构成图。
 */
import { useMemo, useState } from 'react'
import { toggleFold, type FoldState } from '@/features/shared/foldState'
import { HfSegmented } from '@/features/shared/HfSegmented'
import { formatPercent } from '@/utils/format'
import type { LedgerAccountCategory } from '@/features/overview/model'
import type { DeviceMode } from '@/features/shared/types'
import { BalanceComposition, ReportLineChart } from './charts'
import { MetricStrip, ReportCardList, ReportTablePair, type ReportColumn } from './ReportTable'
import { chartGrid } from './reportsShared'
import { flattenTreeCards, flattenTreeRows, type TreeRenderOptions } from './reportRows'
import {
  buildBalanceGroups,
  buildBalanceTrees,
  currency,
  type BalanceReport,
  type FlowTreeNode,
} from './reportsModel'

const COLUMNS: ReportColumn[] = [
  { label: '分类 / 账户' },
  { label: '账户数', align: 'num' },
  { label: '金额', align: 'num' },
  { label: '占比', align: 'num' },
]

const childLegend = (trees: FlowTreeNode[]) =>
  trees.some((tree) => tree.children.length > 0) ? ' · † 子级已计入父级' : ''

const shareTotal = (trees: FlowTreeNode[]) =>
  trees.reduce((sum, tree) => sum + tree.share, 0)

const totalCells = (amount: number, trees: FlowTreeNode[]) => [
  '合计',
  '',
  currency(amount),
  formatPercent(shareTotal(trees), 1, false),
]

export function BalanceView({
  device,
  report,
  categories,
  side,
  onSide,
  from,
  to,
  onViewFlow,
  trendDesc = '近 12 个月',
}: {
  device: DeviceMode
  report: BalanceReport
  categories: readonly LedgerAccountCategory[] | undefined
  side: 'assets' | 'liabilities'
  onSide: (next: 'assets' | 'liabilities') => void
  from: string
  to: string
  onViewFlow: (options: { accountId: string; from: string; to: string }) => void
  /** 净值走势说明；预测区间传入窗口口径。 */
  trendDesc?: string
}) {
  const [expanded, setExpanded] = useState<FoldState>({})
  const toggleGroup = (id: string) => setExpanded((current) => toggleFold(current, id))
  const assetTrees = useMemo(
    () => buildBalanceTrees(buildBalanceGroups(report.assets, categories)),
    [report.assets, categories],
  )
  const liabilityTrees = useMemo(
    () => buildBalanceTrees(buildBalanceGroups(report.liabilities, categories)),
    [report.liabilities, categories],
  )

  // 环的一级是账户分类（环图内部下钻到账户）；只有二级账户行才落到流水筛选。
  const openAccount = (node: FlowTreeNode) => {
    if (node.level === 1 && node.id !== 'rest') {
      onViewFlow({ accountId: node.id, from, to })
    }
  }
  const options = (barTone: 'accent' | 'expense'): TreeRenderOptions => ({
    unit: '个',
    childLegend: true,
    barTone,
    tone: barTone === 'expense' ? 'expense' : undefined,
    onOpen: openAccount,
  })
  const assetOptions = options('accent')
  const liabilityOptions = options('expense')

  const assetRows = flattenTreeRows(assetTrees, expanded, toggleGroup, assetOptions)
  const liabilityRows = flattenTreeRows(liabilityTrees, expanded, toggleGroup, liabilityOptions)
  const assetCards = flattenTreeCards(assetTrees, expanded, toggleGroup, assetOptions)
  const liabilityCards = flattenTreeCards(liabilityTrees, expanded, toggleGroup, liabilityOptions)

  const trend = (
    <ReportLineChart
      device={device}
      title="净值走势"
      desc={trendDesc}
      points={report.trend.map((point) => ({ label: point.month, value: point.value }))}
      ariaLabel="净资产月度走势"
    />
  )

  const composition = (
    <BalanceComposition
      assetTrees={assetTrees}
      liabilityTrees={liabilityTrees}
      assetTotal={report.positiveAssetTotal}
      liabilityTotal={report.liabilityTotal}
      device={device}
      onOpen={openAccount}
      note={
        <p className="mb-rp-chart-note">
          两环均按账户分类先显示占比，点分类进入该分类下的账户，点账户落到该账户的流水。
          资产环仅含正余额账户
          {report.negativeAssetCount > 0
            ? `（已排除 ${report.negativeAssetCount} 个负余额账户 ${currency(report.negativeAssetTotal)}，资产合计 ${currency(report.assetTotal)}）`
            : ''}
          。
        </p>
      }
    />
  )

  return (
    <>
      <MetricStrip device={device} metrics={report.metrics} />
      {report.predictionNote && <p className="mb-rp-predict-note">{report.predictionNote}</p>}
      {chartGrid(device, <>{trend}{composition}</>)}
      {device === 'desktop' ? (
        <ReportTablePair
          left={{
            device,
            title: '资产',
            desc: `合计 ${currency(report.assetTotal)}${childLegend(assetTrees)}`,
            ariaLabel: '资产明细',
            columns: COLUMNS,
            rows: assetRows,
            variant: 'c4',
            total: totalCells(report.assetTotal, assetTrees),
          }}
          right={{
            device,
            title: '负债',
            desc: `合计 ${currency(report.liabilityTotal)}${childLegend(liabilityTrees)}`,
            ariaLabel: '负债明细',
            columns: COLUMNS,
            rows: liabilityRows,
            variant: 'c4',
            total: totalCells(report.liabilityTotal, liabilityTrees),
          }}
        />
      ) : (
        <>
          <HfSegmented
            variant="report"
            label="资产负债分段"
            value={side}
            options={[
              { id: 'assets', label: '资产' },
              { id: 'liabilities', label: '负债' },
            ]}
            onChange={onSide}
          />
          {side === 'assets' ? (
            <ReportCardList
              device={device}
              title="资产"
              desc={`总资产 ${currency(report.assetTotal)}`}
              rows={assetCards}
              total={{ label: '合计', value: currency(report.assetTotal) }}
            />
          ) : (
            <ReportCardList
              device={device}
              title="负债"
              desc={`负债合计 ${currency(report.liabilityTotal)}`}
              rows={liabilityCards}
              total={{ label: '合计', value: currency(report.liabilityTotal) }}
            />
          )}
        </>
      )}
    </>
  )
}
