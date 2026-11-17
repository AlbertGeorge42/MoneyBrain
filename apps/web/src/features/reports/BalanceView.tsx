/**
 * 资产负债视图：指标条 + 净值走势 + 资产 / 负债单框双环 + 资产 / 负债双表（PC 并排 / 移动分段单表）。
 *
 * 表格与两张环图共用同一份「账户分类 → 账户」树：一级先给分类占比，
 * 点分类进入该分类下的账户，顺序沿用设置里的拖拽顺序，默认全部折叠。
 * 构成环与收支明细同款：一个图表框内左右两环，图表顺序为先走势图、再构成图。
 */
import { useMemo, useState } from 'react'
import { toggleFold, type FoldState } from '@/features/shared/foldState'
import { Segmented } from '@/features/shared/Segmented'
import { formatPercent } from '@/utils/format'
import type { LedgerAccountCategory } from '@/features/overview/model'
import type { DeviceMode } from '@/features/shared/types'
import {
  BalanceComposition,
  ChartCard,
  CompositionDonutSide,
  ReportLineChart,
} from './charts'
import { MetricStrip, ReportTable, ReportTablePair, type ReportColumn } from './ReportTable'
import { chartGrid } from './reportsShared'
import { flattenTreeRows, type TreeRenderOptions } from './reportRows'
import {
  buildBalanceGroups,
  buildBalanceTrees,
  currency,
  type BalanceReport,
  type DrillTarget,
  type FlowTreeNode,
} from './reportsModel'

const COLUMNS: ReportColumn[] = [
  { label: '分类 / 账户' },
  { label: '账户数', align: 'num' },
  { label: '金额', align: 'num' },
  { label: '占比', align: 'num' },
]

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
  onDrill,
  trendDesc = '近 12 个月',
}: {
  device: DeviceMode
  report: BalanceReport
  categories: readonly LedgerAccountCategory[] | undefined
  side: 'assets' | 'liabilities'
  onSide: (next: 'assets' | 'liabilities') => void
  onDrill: (target: DrillTarget) => void
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

  // 环的一级是账户分类（环图内部下钻到账户）。点账户 / 其余账户都开抽屉，
  // 抽屉内直接展示相关流水并可继续编辑，不再跳流水页。
  const openAccount = (node: FlowTreeNode) => {
    if (node.level !== 1 && node.id !== 'rest') return
    const ids = node.id === 'rest' && node.mergedIds ? node.mergedIds : [node.id]
    onDrill({
      type: 'account',
      title: node.name,
      amount: node.amount,
      childTitle: '账户',
      children: node.children,
      ids,
    })
  }
  const options: TreeRenderOptions = {
    unit: '个',
    onOpen: openAccount,
  }

  const assetRows = flattenTreeRows(assetTrees, expanded, toggleGroup, options)
  const liabilityRows = flattenTreeRows(liabilityTrees, expanded, toggleGroup, options)
  // 移动端分段单表：两段补齐到相同行数，切换标签时 tbody 行数与合计行位置不变、高度不跳变。
  const mobileMinRows = Math.max(assetRows.length, liabilityRows.length)

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
      {/* PC 双环留在图表区（走势在上、构成在下）；移动端构成环移到分段下、表格上。 */}
      {chartGrid(device, <>{trend}{device === 'desktop' && composition}</>)}
      {device === 'desktop' ? (
        <ReportTablePair
          left={{
            device,
            title: '资产',
            ariaLabel: '资产明细',
            columns: COLUMNS,
            rows: assetRows,
            variant: 'c4',
            total: totalCells(report.assetTotal, assetTrees),
          }}
          right={{
            device,
            title: '负债',
            ariaLabel: '负债明细',
            columns: COLUMNS,
            rows: liabilityRows,
            variant: 'c4',
            total: totalCells(report.liabilityTotal, liabilityTrees),
          }}
        />
      ) : (
        <>
          <Segmented
            size="lg"
            fill
            bordered
            label="资产负债分段"
            value={side}
            options={[
              { id: 'assets', label: '资产' },
              { id: 'liabilities', label: '负债' },
            ]}
            onChange={onSide}
          />
          <ChartCard title="资产 / 负债构成">
            <CompositionDonutSide
              title={side === 'assets' ? '资产构成' : '负债构成'}
              kind={side === 'assets' ? 'asset' : 'liability'}
              nodes={side === 'assets' ? assetTrees : liabilityTrees}
              total={side === 'assets' ? report.positiveAssetTotal : report.liabilityTotal}
              emptyText={side === 'assets' ? '暂无正余额资产' : '暂无负债账户'}
              device={device}
              onOpen={openAccount}
            />
          </ChartCard>
          {side === 'assets' ? (
            <ReportTable
              device={device}
              title="资产"
              ariaLabel="资产明细"
              columns={COLUMNS}
              rows={assetRows}
              minRows={mobileMinRows}
              variant="c4"
              total={totalCells(report.assetTotal, assetTrees)}
            />
          ) : (
            <ReportTable
              device={device}
              title="负债"
              ariaLabel="负债明细"
              columns={COLUMNS}
              rows={liabilityRows}
              minRows={mobileMinRows}
              variant="c4"
              total={totalCells(report.liabilityTotal, liabilityTrees)}
            />
          )}
        </>
      )}
    </>
  )
}
