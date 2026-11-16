/**
 * 现金流视图：指标条 + 桑基（仅 PC）+ 流入 / 流出双表（PC 并排 / 移动横条 + 分段单表）。
 * 活动分组固定全显示，表尾合计就是各组之和；点切块 / ribbon 落到同一节点抽屉。
 */
import { useState } from 'react'
import { HfButton } from '@/features/shared/HfButton'
import { HfSheet } from '@/features/shared/HfSheet'
import type { DeviceMode } from '@/features/shared/types'
import type { FoldState } from '@/features/shared/foldState'
import { CashSankeyChart } from './CashSankey'
import { ChartCard, CashFlowBars, CompositionDonutSide } from './charts'
import { MetricStrip, ReportTable, ReportTablePair, type ReportColumn } from './ReportTable'
import { HfSegmented } from '@/features/shared/HfSegmented'
import type { DonutNode } from '@/features/shared/DonutChart'
import {
  cashRowsFor,
  currency,
  type CashGroup,
  type CashReport,
  type DrillTarget,
} from './reportsModel'
import { cashTotalOf } from './reportSettings'
import type { CashSankey, CashSankeyNode } from './cashSankeyModel'

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
      children: group.children
        .filter((child) => child.amount > 0)
        .map((child) => ({
          id: child.categoryId || child.id,
          name: child.label,
          amount: child.amount,
          count: 0,
          share: group.total > 0 ? (child.amount / group.total) * 100 : 0,
          level: 1,
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
  from,
  to,
  onViewFlow,
  rootOf,
  onDrill,
}: {
  device: DeviceMode
  report: CashReport
  sankey: CashSankey | null
  side: 'in' | 'out'
  onSide: (next: 'in' | 'out') => void
  expanded: FoldState
  onFold: (id: string) => void
  from: string
  to: string
  onViewFlow: (options: { categoryIds: string[]; from: string; to: string }) => void
  /** 流水页 txRoots 只认根分类：抽屉里的叶分类先展开到根。 */
  rootOf: (categoryId: string) => string
  onDrill: (target: DrillTarget) => void
}) {
  const [sankeyNode, setSankeyNode] = useState<CashSankeyNode | null>(null)
  // 点切块 / 每条 ribbon 都落到同一个节点抽屉：合计与该节点、图例字段一一对应。
  const openSankeyNode = (nodeId: string) => {
    const node = sankey?.nodes.find((item) => item.id === nodeId)
    if (node) setSankeyNode(node)
  }
  const sankeyCategories = sankeyNode
    ? [...new Set(sankeyNode.children.map((child) => child.categoryId).filter(Boolean).map(rootOf))]
    : []
  const inflowTotal = cashTotalOf(report.inflowGroups)
  const outflowTotal = cashTotalOf(report.outflowGroups)
  const inflowRows = cashRowsFor('in', report.inflowGroups, expanded, onFold)
  const outflowRows = cashRowsFor('out', report.outflowGroups, expanded, onFold)
  // 移动端分段单表：两段补齐到相同行数，切换标签时 tbody 行数与合计行位置不变、高度不跳变。
  const mobileMinRows = Math.max(inflowRows.length, outflowRows.length)
  const inflowNodes = cashDonutNodes(report.inflowGroups, 'in')
  const outflowNodes = cashDonutNodes(report.outflowGroups, 'out')
  // 环节点 id 与下钻分类的对应：活动分组键 → 其全部分类；分类键 → 自身。
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
              <CashSankeyChart data={sankey} onOpen={openSankeyNode} />
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
          <CashFlowBars
            inflowGroups={report.inflowGroups}
            outflowGroups={report.outflowGroups}
            inflowTotal={inflowTotal}
            outflowTotal={outflowTotal}
          />
          <HfSegmented
            variant="report"
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
                onDrill({
                  type: 'category',
                  title: node.name,
                  amount: node.amount,
                  childTitle: '分类',
                  children: node.children,
                  ids: categoryIds,
                  side: side === 'in' ? 'income' : 'expense',
                  canViewFlow: true,
                })
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
      <HfSheet
        variant="report"
        device={device}
        opened={sankeyNode !== null}
        onClose={() => setSankeyNode(null)}
        title={sankeyNode ? `${sankeyNode.name} · 现金流明细` : '现金流明细'}
        actions={
          <>
            <HfButton className="mb-rp-btn is-ghost" onClick={() => setSankeyNode(null)}>
              关闭
            </HfButton>
            {sankeyCategories.length > 0 && (
              <HfButton
                className="mb-rp-btn is-primary"
                onClick={() => {
                  onViewFlow({ categoryIds: sankeyCategories, from, to })
                  setSankeyNode(null)
                }}
              >
                在流水中查看
              </HfButton>
            )}
          </>
        }
      >
        {sankeyNode && (
          <div className="mb-rp-drill">
            <div className="mb-rp-drill-head">
              <span className="mb-rp-drill-label">
                {sankeyNode.layer === 1 ? '账户本期流动' : '本期分类合计'}
              </span>
              <span className="mb-rp-drill-amount is-neutral">{currency(sankeyNode.amount)}</span>
            </div>
            <h4 className="mb-rp-drill-title">
              {sankeyNode.children.length > 0 ? `${sankeyNode.children.length} 笔` : '无分组明细'}
            </h4>
            {sankeyNode.children.length === 0 ? (
              <p className="mb-rp-empty-line">该节点没有可下钻的分组流水</p>
            ) : (
              sankeyNode.children.map((child) => (
                <div className="mb-rp-drill-row" key={child.id}>
                  <div>
                    <span className="mb-rp-drill-tx-label">{child.label}</span>
                    <span className="mb-rp-drill-meta">{child.account}</span>
                  </div>
                  <span className={`mb-rp-drill-value is-${child.tone}`}>{currency(child.amount)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </HfSheet>
    </>
  )
}
