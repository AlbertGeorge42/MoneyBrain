/**
 * 现金流视图：指标条 + 桑基（三层）+ 流入 / 流出双表（PC 并排 / 移动分段单表）。
 * 活动分组固定全显示，表尾合计就是各组之和；点切块 / 环节点 / 表格行都落到同一个分类抽屉。
 */
import type { DeviceMode } from '@/features/shared/types'
import type { FoldState } from '@/features/shared/foldState'
import { CashSankeyChart } from './CashSankey'
import { ChartCard, CompositionDonutSide } from './charts'
import { MetricStrip, ReportTable, ReportTablePair, type ReportColumn } from './ReportTable'
import { Segmented } from '@/features/shared/Segmented'
import type { DonutNode } from '@/features/shared/DonutChart'
import {
  cashDrillTarget,
  cashRowsFor,
  currency,
  type CashGroup,
  type CashReport,
  type DrillTarget,
} from './reportsModel'
import { cashTotalOf } from './reportSettings'
import type { CashSankey } from './cashSankeyModel'

/** 现金流活动分组 → 环节点：一级是活动分组，二级是分类；node id 用 categoryId，便于下钻。 */
function cashDonutNodes(groups: CashGroup[], side: 'in' | 'out'): DonutNode[] {
  const total = cashTotalOf(groups)
  return groups
    .filter((group) => group.total > 0)
    .map((group) => ({
      id: `${side}:${group.key}`,
      name: group.name,
      amount: group.total,
      count: group.count,
      share: total > 0 ? (group.total / total) * 100 : 0,
      level: 0,
      predicted: group.predicted,
      children: group.children
        .filter((child) => child.amount > 0)
        .map((child) => ({
          id: child.categoryId || child.id,
          name: child.label,
          amount: child.amount,
          count: 0,
          share: group.total > 0 ? (child.amount / group.total) * 100 : 0,
          level: 1,
          predicted: child.predicted,
          children: [],
        })),
    }))
}

/** 环节点 → 下钻分类集合：分组用其全部分类，「其余」用被并入节点的分类并集。 */
function categoryIdsOfNode(node: DonutNode, idToCategoryIds: Map<string, string[]>): string[] {
  const ids = node.mergedIds?.length ? node.mergedIds : [node.id]
  return [...new Set(ids.flatMap((id) => idToCategoryIds.get(id) ?? []))]
}

const CASH_COLUMNS: ReportColumn[] = [
  { label: '分组 / 交易' },
  { label: '账户 / 笔数' },
  { label: '金额', align: 'num' },
]

export function CashView({
  device,
  report,
  sankey,
  side,
  onSide,
  expanded,
  onFold,
  onDrill,
}: {
  device: DeviceMode
  report: CashReport
  sankey: CashSankey | null
  side: 'in' | 'out'
  onSide: (next: 'in' | 'out') => void
  expanded: FoldState
  onFold: (id: string) => void
  onDrill: (target: DrillTarget) => void
}) {
  const inflowTotal = cashTotalOf(report.inflowGroups)
  const outflowTotal = cashTotalOf(report.outflowGroups)
  const inflowRows = cashRowsFor('in', report.inflowGroups, expanded, onFold, onDrill)
  const outflowRows = cashRowsFor('out', report.outflowGroups, expanded, onFold, onDrill)
  // 移动端分段单表：两段补齐到相同行数，切换标签时 tbody 行数与合计行位置不变、高度不跳变。
  const mobileMinRows = Math.max(inflowRows.length, outflowRows.length)
  const inflowNodes = cashDonutNodes(report.inflowGroups, 'in')
  const outflowNodes = cashDonutNodes(report.outflowGroups, 'out')
  // 环节点 id 与下钻分类的对应：活动分组键 → 其全部分类；分类键 → 自身。
  // 表格行直接持 CashChild.categoryId，不走这张表；两者都喂同一个 cashDrillTarget。
  const categoryIdsByNode = new Map<string, string[]>()
  for (const [side, groups] of [
    ['in', report.inflowGroups],
    ['out', report.outflowGroups],
  ] as const) {
    for (const group of groups) {
      const ids = group.children.map((child) => child.categoryId).filter(Boolean)
      categoryIdsByNode.set(`${side}:${group.key}`, ids)
      for (const child of group.children) {
        if (child.categoryId) categoryIdsByNode.set(child.categoryId, [child.categoryId])
      }
    }
  }
  return (
    <>
      <MetricStrip device={device} metrics={report.metrics} />
      {report.predictionNote && <p className="mb-rp-predict-note">{report.predictionNote}</p>}
      {device === 'desktop' ? (
        <>
          {sankey && (
            <ChartCard title="现金流流向" desc="收入分类 → 账户 → 支出分类 · 期初 / 期末逐账户读数">
              <CashSankeyChart data={sankey} device={device} />
            </ChartCard>
          )}
          <ReportTablePair
            left={{
              device,
              title: '流入',
              ariaLabel: '现金流入',
              columns: CASH_COLUMNS,
              rows: inflowRows,
              total: ['合计', '', currency(inflowTotal)],
            }}
            right={{
              device,
              title: '流出',
              ariaLabel: '现金流出',
              columns: CASH_COLUMNS,
              rows: outflowRows,
              total: ['合计', '', currency(outflowTotal)],
            }}
          />
        </>
      ) : (
        <>
          {sankey && (
            <ChartCard title="现金流流向">
              <CashSankeyChart data={sankey} device={device} />
            </ChartCard>
          )}
          <Segmented
            size="lg"
            fill
            bordered
            label="现金流分段"
            value={side}
            options={[
              { id: 'in', label: '流入' },
              { id: 'out', label: '流出' },
            ]}
            onChange={onSide}
          />
          <ChartCard title="现金流入 / 流出构成">
            <CompositionDonutSide
              title={side === 'in' ? '流入构成' : '流出构成'}
              kind={side === 'in' ? 'income' : 'expense'}
              nodes={side === 'in' ? inflowNodes : outflowNodes}
              total={side === 'in' ? inflowTotal : outflowTotal}
              emptyText={side === 'in' ? '该期间没有流入' : '该期间没有流出'}
              device={device}
              onOpen={(node) => {
                const categoryIds = categoryIdsOfNode(node, categoryIdsByNode)
                if (categoryIds.length === 0) return
                onDrill(
                  cashDrillTarget({
                    title: node.name,
                    amount: node.amount,
                    predicted: node.predicted,
                    side,
                    ids: categoryIds,
                    children: node.children.map((child) => ({
                      id: child.id,
                      name: child.name,
                      amount: child.amount,
                      count: child.count,
                      predicted: child.predicted,
                    })),
                  }),
                )
              }}
            />
          </ChartCard>
          <ReportTable
            device={device}
            title={side === 'in' ? '流入' : '流出'}
            ariaLabel={side === 'in' ? '现金流入' : '现金流出'}
            columns={CASH_COLUMNS}
            rows={side === 'in' ? inflowRows : outflowRows}
            minRows={mobileMinRows}
            total={['合计', '', currency(side === 'in' ? inflowTotal : outflowTotal)]}
          />
        </>
      )}
    </>
  )
}
