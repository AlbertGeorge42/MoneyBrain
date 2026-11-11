/**
 * 现金流视图：指标条 + 桑基（仅 PC）+ 流入 / 流出双表（移动端横条与卡片）。
 * 活动分组固定全显示，表尾合计就是各组之和；点切块 / ribbon 落到同一节点抽屉。
 */
import { useState } from 'react'
import { HfButton } from '@/features/shared/HfButton'
import { HfSheet } from '@/features/shared/HfSheet'
import type { DeviceMode } from '@/features/shared/types'
import { isExpanded, type FoldState } from '@/features/shared/foldState'
import { CashSankeyChart } from './CashSankey'
import { ChartCard, CashFlowBars } from './charts'
import { MetricStrip, ReportCardList, ReportTablePair, type CardRow, type ReportColumn } from './ReportTable'
import { HfSegmented } from '@/features/shared/HfSegmented'
import { cashRowsFor, currency, type CashReport } from './reportsModel'
import { cashTotalOf } from './reportSettings'
import type { CashSankey, CashSankeyNode } from './cashSankeyModel'

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
  const groups = side === 'in' ? report.inflowGroups : report.outflowGroups
  // 左右两表共用一份展开状态：键必须带方向前缀，否则同名分组会串扰。
  const foldKey = (id: string) => `${side}:${id}`
  const cards: CardRow[] = []
  for (const group of groups) {
    const key = foldKey(group.key)
    const open = isExpanded(expanded, key)
    cards.push({
      id: key,
      label: group.name,
      meta: group.meta ?? `${group.count} 笔`,
      hint: group.predicted ? '预测' : undefined,
      amount: currency(group.total),
      tone: side === 'in' ? 'income' : 'expense',
      fold: group.children.length > 0 ? { expanded: open, onToggle: () => onFold(key) } : undefined,
    })
    if (open) {
      for (const child of group.children) {
        cards.push({
          id: foldKey(child.id),
          level: 1,
          label: child.label,
          meta: child.account,
          hint: child.predicted ? '预测' : undefined,
          amount: currency(child.amount),
          tone: side === 'in' ? 'income' : 'expense',
        })
      }
    }
  }

  const inflowRows = cashRowsFor('in', report.inflowGroups, expanded, onFold)
  const outflowRows = cashRowsFor('out', report.outflowGroups, expanded, onFold)
  const feeNote = report.reconcile.transferFee > 0
    ? ` · 手续费 ${currency(report.reconcile.transferFee)} 不计`
    : ''

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
              desc: `合计 ${currency(inflowTotal)}`,
              ariaLabel: '现金流入',
              columns: CASH_COLUMNS,
              rows: inflowRows,
              total: ['合计', '', currency(inflowTotal)],
            }}
            right={{
              device,
              title: '流出',
              desc: `合计 ${currency(outflowTotal)}${feeNote}`,
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
          <ReportCardList
            device={device}
            title={side === 'in' ? '流入' : '流出'}
            desc={
              side === 'in'
                ? `合计 ${currency(inflowTotal)}`
                : `合计 ${currency(outflowTotal)}${feeNote}`
            }
            rows={cards}
            total={{ label: '合计', value: currency(side === 'in' ? inflowTotal : outflowTotal) }}
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
