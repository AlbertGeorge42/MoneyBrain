/**
 * 资产负债视图：指标条 + 资产构成环 + 净值走势 + 资产 / 负债双表（移动端卡片）。
 * 只消费已派生的 BalanceReport 与展示偏好，不发起任何请求。
 */
import { useMemo, useState } from 'react'
import { Card } from '@/features/shared/Card'
import { HfButton } from '@/features/shared/HfButton'
import { HfSheet } from '@/features/shared/HfSheet'
import type { LedgerAccountCategory } from '@/features/overview/model'
import type { DeviceMode } from '@/features/shared/types'
import { ChartCard, DonutChart, ReportLineChart, type DonutKind } from './charts'
import {
  MetricStrip,
  ReportCardList,
  ReportTable,
  type CardRow,
  type ReportColumn,
  type ReportRow,
} from './ReportTable'
import { chartGrid } from './reportsShared'
import { HfSegmented } from '@/features/shared/HfSegmented'
import { groupBalanceRows, type ReportViewSettings } from './reportSettings'
import {
  balanceGroupExpanded,
  buildAssetComposition,
  buildBalanceGroups,
  currency,
  type BalanceGroup,
  type BalanceReport,
  type BalanceRow,
  type FlowTreeNode,
} from './reportsModel'

export function BalanceView({
  device,
  report,
  settings,
  categories,
  side,
  onSide,
  from,
  to,
  onViewFlow,
}: {
  device: DeviceMode
  report: BalanceReport
  settings: ReportViewSettings['balance']
  categories: readonly LedgerAccountCategory[] | undefined
  side: 'assets' | 'liabilities'
  onSide: (next: 'assets' | 'liabilities') => void
  from: string
  to: string
  onViewFlow: (options: { accountId: string; from: string; to: string }) => void
}) {
  const shownAssets = groupBalanceRows(report.assets, settings.groupMode)
  const shownLiabilities = groupBalanceRows(report.liabilities, settings.groupMode)
  // 层级折叠是纯展示状态：默认全部展开，不改任何合计。
  const [foldedBalance, setFoldedBalance] = useState<Record<string, boolean>>({})
  const assetGroups = useMemo(
    () =>
      settings.groupMode === 'account' ? buildBalanceGroups(report.assets, categories) : null,
    [report.assets, categories, settings.groupMode],
  )
  const liabilityGroups = useMemo(
    () =>
      settings.groupMode === 'account' ? buildBalanceGroups(report.liabilities, categories) : null,
    [report.liabilities, categories, settings.groupMode],
  )
  const hierarchical = assetGroups !== null && liabilityGroups !== null
  const toggleGroup = (group: BalanceGroup) =>
    setFoldedBalance((current) => ({
      ...current,
      [group.id]: !balanceGroupExpanded(current, group),
    }))
  const [kindDetail, setKindDetail] = useState<BalanceRow['kind'] | null>(null)
  const assetNodes = useMemo(
    // 环只含正余额账户：负余额无法画成扇形，图注单独说明（合计 = 正余额资产合计）。
    () => buildAssetComposition(report.assets.filter((row) => row.amount > 0), settings.groupMode),
    [report.assets, settings.groupMode],
  )
  const kindAccounts = kindDetail
    ? report.assets.filter((row) => row.kind === kindDetail)
    : []
  // 环只画正余额账户；抽屉同时列出该性质的负余额账户，并在头部单独说明，不混入环内合计。
  const kindPositiveAccounts = kindAccounts.filter((row) => row.amount > 0)
  const kindNegativeAccounts = kindAccounts.filter((row) => row.amount < 0)
  const kindAmount = kindPositiveAccounts.reduce((sum, row) => sum + row.amount, 0)
  const kindNegativeAmount = kindNegativeAccounts.reduce((sum, row) => sum + row.amount, 0)

  const openAssetNode = (node: FlowTreeNode, kind: DonutKind) => {
    if (kind !== 'asset') return
    if (settings.groupMode === 'kind') {
      // 环按性质切块时，点性质先落到该性质的账户抽屉（图例合计 = 抽屉合计）。
      setKindDetail(node.name)
      return
    }
    // 按账户切块时，点账户直接落到流水的账户筛选。
    onViewFlow({ accountId: node.id, from, to })
  }
  // 按性质汇总后性质列不再单列；面板里该开关同步禁用并给出原因。
  const showKind = settings.showKindColumn && settings.groupMode === 'account' && !hierarchical
  const cellsOf = (row: { name: string; kind: string; amount: number }) =>
    showKind ? [row.name, row.kind, currency(row.amount)] : [row.name, currency(row.amount)]
  const assetColumns: ReportColumn[] = hierarchical
    ? [
        { label: '分类 / 账户' },
        { label: '账户数', align: 'num' },
        { label: '金额', align: 'num' },
      ]
    : showKind
      ? [{ label: '账户' }, { label: '性质' }, { label: '金额', align: 'num' }]
      : [{ label: '账户' }, { label: '金额', align: 'num' }]
  const totalCells = (label: string, amount: number) =>
    hierarchical || showKind ? [label, '', currency(amount)] : [label, currency(amount)]
  const groupCells = (name: string, count: number | null, amount: number) => [
    name,
    count === null ? '' : `${count}`,
    currency(amount),
  ]

  const hierarchyRowsOf = (groups: BalanceGroup[]): ReportRow[] => {
    const rows: ReportRow[] = []
    for (const root of groups) {
      const expanded = balanceGroupExpanded(foldedBalance, root)
      rows.push({
        id: root.id,
        cells: groupCells(root.name, root.accountCount, root.amount),
        hint: root.predicted ? '预测' : undefined,
        fold: root.accounts.length
          ? { expanded, onToggle: () => toggleGroup(root) }
          : undefined,
      })
      if (!expanded) continue
      for (const account of root.accounts) {
        rows.push({
          id: account.id,
          level: 1,
          cells: groupCells(account.name, null, account.amount),
          hint: account.predicted ? '预测' : undefined,
        })
      }
    }
    return rows
  }

  const assetRows: ReportRow[] = assetGroups
    ? hierarchyRowsOf(assetGroups)
    : shownAssets.map((row) => ({
        id: row.id,
        cells: cellsOf(row),
        hint: row.predicted ? '预测' : undefined,
      }))
  const liabilityRows: ReportRow[] = liabilityGroups
    ? hierarchyRowsOf(liabilityGroups)
    : shownLiabilities.map((row) => ({
        id: row.id,
        cells: cellsOf(row),
        hint: row.predicted ? '预测' : undefined,
      }))

  const balanceMinRows = Math.max(assetRows.length, liabilityRows.length)

  const shareOf = (amount: number, total: number) =>
    amount > 0 && total > 0 ? (amount / total) * 100 : 0
  const hierarchyCardsOf = (
    groups: BalanceGroup[],
    tone: 'accent' | 'expense',
    total: number,
  ): CardRow[] => {
    const cards: CardRow[] = []
    for (const root of groups) {
      const expanded = balanceGroupExpanded(foldedBalance, root)
      cards.push({
        id: root.id,
        label: root.name,
        meta: `${root.accountCount} 个账户`,
        amount: currency(root.amount),
        tone: tone === 'expense' ? ('expense' as const) : undefined,
        barTone: tone,
        share: shareOf(root.amount, total),
        fold: root.accounts.length
          ? { expanded, onToggle: () => toggleGroup(root) }
          : undefined,
      })
      if (!expanded) continue
      for (const account of root.accounts) {
        cards.push({
          id: account.id,
          level: 1,
          label: account.name,
          amount: currency(account.amount),
          tone: tone === 'expense' ? ('expense' as const) : undefined,
        })
      }
    }
    return cards
  }

  const assetCards: CardRow[] = assetGroups
    ? hierarchyCardsOf(assetGroups, 'accent', report.positiveAssetTotal)
    : shownAssets.map((row) => ({
        id: row.id,
        label: row.name,
        meta: showKind ? row.kind : undefined,
        amount: currency(row.amount),
        barTone: 'accent',
        share: shareOf(row.amount, report.positiveAssetTotal),
      }))
  const liabilityCards: CardRow[] = liabilityGroups
    ? hierarchyCardsOf(liabilityGroups, 'expense', report.liabilityTotal)
    : shownLiabilities.map((row) => ({
        id: row.id,
        label: row.name,
        meta: showKind ? row.kind : undefined,
        amount: currency(row.amount),
        tone: 'expense' as const,
        barTone: 'expense' as const,
        share: shareOf(row.amount, report.liabilityTotal),
      }))

  const composition = (
    <ChartCard title="资产构成">
      <DonutChart
        nodes={assetNodes}
        total={report.assetTotal}
        device={device}
        kind="asset"
        title="资产构成"
        emptyText="暂无资产账户"
        onOpen={openAssetNode}
      />
      <p className="mb-rp-chart-note">
        {settings.groupMode === 'kind'
          ? '按性质汇总：环只含正余额账户，点切块或图例查看该性质的账户'
          : '按账户：环只含正余额账户，点扇形落到该账户的流水'}
        。环内合计 {currency(report.positiveAssetTotal)}（仅含正余额账户）
        {report.negativeAssetCount > 0
          ? `；已排除 ${report.negativeAssetCount} 个负余额账户 ${currency(report.negativeAssetTotal)}，资产合计 ${currency(report.assetTotal)}`
          : ''}
        。
      </p>
    </ChartCard>
  )

  const trend = (
    <ReportLineChart
      device={device}
      title="净值走势"
      desc="近 12 个月"
      points={report.trend.map((point) => ({ label: point.month, value: point.value }))}
      ariaLabel="净资产月度走势"
    />
  )

  return (
    <>
      <MetricStrip device={device} metrics={report.metrics} />
      {report.predictionNote && <p className="mb-rp-predict-note">{report.predictionNote}</p>}
      {chartGrid(device, <>{composition}{trend}</>)}
      {device === 'desktop' ? (
        <div className="mb-rp-cols">
          <ReportTable
            device={device}
            title="资产"
            ariaLabel="资产明细"
            columns={assetColumns}
            rows={assetRows}
            minRows={balanceMinRows}
            variant={hierarchical ? 'tree' : 'c3'}
            total={totalCells('合计', report.assetTotal)}
          />
          <ReportTable
            device={device}
            title="负债"
            ariaLabel="负债明细"
            columns={assetColumns}
            rows={liabilityRows}
            minRows={balanceMinRows}
            variant={hierarchical ? 'tree' : 'c3'}
            total={totalCells('合计', report.liabilityTotal)}
          />
        </div>
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
      <Card variant="report" className="mb-rp-networth" aria-label="净资产">
        <div className="mb-rp-networth-copy">
          <span className="mb-rp-networth-label">净资产</span>
          <span className="mb-rp-networth-hint">
            资产合计 {currency(report.assetTotal)} − 负债合计 {currency(report.liabilityTotal)}，
            不属于负债
          </span>
        </div>
        <span className="mb-rp-networth-value">{currency(report.netWorth)}</span>
      </Card>
      <p className="mb-rp-chart-note">
        账户覆盖：资产与负债都只列余额 ≠ 0 的账户（负余额保留）；另有 {report.zeroAccountCount} 个
        0 元账户未列出。资产合计 {currency(report.assetTotal)} = 正余额 {currency(report.positiveAssetTotal)} + 负余额{' '}
        {currency(report.negativeAssetTotal)}。负债合计不含权益，净资产单独列示；折叠只改变可见行，不影响任何合计。
      </p>
      <HfSheet
        variant="report"
        device={device}
        opened={kindDetail !== null}
        onClose={() => setKindDetail(null)}
        title={kindDetail ? `${kindDetail} · 账户明细` : '账户明细'}
      >
        {kindDetail && (
          <div className="mb-rp-drill">
            <div className="mb-rp-drill-head">
              <span className="mb-rp-drill-label">{kindDetail}正余额合计</span>
              <span className="mb-rp-drill-amount is-neutral">{currency(kindAmount)}</span>
            </div>
            {kindNegativeAccounts.length > 0 && (
              <p className="mb-rp-chart-note">
                另有 {kindNegativeAccounts.length} 个负余额账户 {currency(kindNegativeAmount)}，不计入环内合计。
              </p>
            )}
            <h4 className="mb-rp-drill-title">{kindAccounts.length} 个账户</h4>
            {kindAccounts.map((row) => (
              <HfButton
                className="mb-rp-drill-row is-action"
                key={row.id}
                onClick={() => {
                  onViewFlow({ accountId: row.id, from, to })
                  setKindDetail(null)
                }}
              >
                <span>{row.name}</span>
                <span className="mb-rp-drill-value">{currency(row.amount)}</span>
              </HfButton>
            ))}
            <p className="mb-rp-chart-note">点账户落到流水，按该账户筛选；合计与图例一致。</p>
          </div>
        )}
      </HfSheet>
    </>
  )
}
