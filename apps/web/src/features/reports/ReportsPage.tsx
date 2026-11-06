/**
 * 报表页（HF 批次 3）
 *
 * 四视图共用一条时间条与一套指标条：资产负债看时点，收支 / 现金流 / 投资看期间。
 * PC 双列表格、移动卡片行；结构以 concept-design 的报表章节为准，视觉只用 design-tokens。
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { FolderInput, ScanLine } from 'lucide-react'
import { Drawer } from '@mantine/core'
import { useLedger } from '@/features/overview/ledgerStore'
import { TODAY, getCategoryRootId } from '@/features/overview/model'
import { ErrorPanel, LoadingSkeleton } from '@/features/shared/StateViews'
import type { DataState, DeviceMode } from '@/features/shared/types'
import { formatPercent } from '@/utils/format'
import {
  AllocationBars,
  CashFlowBars,
  ChartCard,
  CompositionBars,
  DonutChart,
  ReportBarChart,
  ReportLineChart,
  type DonutKind,
} from './charts'
import { MetricStrip, ReportCardList, ReportTable, type CardRow, type ReportColumn, type ReportRow } from './ReportTable'
import { flattenFlowRows } from './reportRows'
import { ReportConfigPanel } from './ReportSettingsPanel'
import {
  cashGroupPresence,
  cashTotalOf,
  defaultReportSettings,
  groupBalanceRows,
  loadReportSettings,
  saveReportSettings,
  sliceSnapshots,
  sortHoldingRows,
  visibleCashGroups,
  type ReportViewSettings,
} from './reportSettings'
import {
  buildAssetComposition,
  buildDrill,
  cashRowsFor,
  currency,
  deriveBalanceReport,
  deriveCashReport,
  deriveFlowReport,
  deriveInvestmentReport,
  signedCurrency,
  type BalanceReport,
  type BalanceRow,
  type CashReport,
  type DrillData,
  type FlowTreeNode,
  type FlowReport,
  type InvestmentReport,
} from './reportsModel'
import { CashSankeyChart } from './CashSankey'
import { deriveCashSankey, type CashSankey, type CashSankeyNode } from './cashSankeyModel'
import {
  clampAsOfPoint,
  monthStart,
  type ReportTab,
  type ReportTime,
} from './reportsTime'
import { TimeBar } from './TimeBar'
import './reports.css'

const TABS: readonly { id: ReportTab; label: string }[] = [
  { id: 'balance', label: '资产负债' },
  { id: 'flow', label: '收支明细' },
  { id: 'cash', label: '现金流' },
  { id: 'invest', label: '投资分析' },
]

interface ToastState {
  message: string
}

interface DrillState {
  node: FlowTreeNode
  kind: 'income' | 'expense'
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly { id: T; label: string }[]
  onChange: (next: T) => void
}) {
  return (
    <div className="mb-rp-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={option.id === value ? 'mb-rp-seg-btn is-active' : 'mb-rp-seg-btn'}
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function PageHead({
  device,
  tab,
  onTab,
}: {
  device: DeviceMode
  tab: ReportTab
  onTab: (next: ReportTab) => void
}) {
  if (device === 'mobile') {
    return (
      <div className="mb-rp-mobile-head">
        <div className="mb-rp-tabs is-mobile" role="tablist" aria-label="报表视图">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === tab}
              className={item.id === tab ? 'mb-rp-tab is-active' : 'mb-rp-tab'}
              onClick={() => onTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-rp-page-head">
      <div className="mb-rp-page-copy">
        <h1 className="mb-rp-page-title">报表</h1>
      </div>
      <div className="mb-rp-tabs" role="tablist" aria-label="报表视图">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === tab}
            className={item.id === tab ? 'mb-rp-tab is-active' : 'mb-rp-tab'}
            onClick={() => onTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function ReportsEmpty({ onImport }: { onImport: () => void }) {
  return (
    <section className="mb-rp-card mb-rp-empty">
      <div className="mb-rp-empty-mark" aria-hidden="true">
        <ScanLine size={28} strokeWidth={1.8} />
      </div>
      <h2 className="mb-rp-empty-title">还没有可分析的流水</h2>
      <p className="mb-rp-empty-desc">
        报表从账本里取数：先记一笔收支，或导入银行 / 支付宝账单，四张报表会自动生成。
      </p>
      <button type="button" className="mb-rp-btn is-primary" onClick={onImport}>
        <FolderInput size={16} />
        导入账单
      </button>
    </section>
  )
}

function chartGrid(device: DeviceMode, charts: ReactNode) {
  if (device === 'mobile') return <div className="mb-rp-chart-scroll">{charts}</div>
  return <div className="mb-rp-chart-grid">{charts}</div>
}

export function ReportsPage({
  device,
  dataState,
  settingsOpen,
  onSettingsToggle,
  onRetry,
  onImport,
  onViewFlow,
}: {
  device: DeviceMode
  dataState: DataState
  settingsOpen: boolean
  onSettingsToggle: () => void
  onRetry: () => void
  onImport: () => void
  onViewFlow: (options: {
    categoryId?: string
    categoryIds?: string[]
    accountId?: string
    from: string
    to: string
  }) => void
}) {
  const { ledger } = useLedger()
  const [tab, setTab] = useState<ReportTab>('balance')
  const [time, setTime] = useState<ReportTime>({
    gran: 'month',
    point: TODAY,
    from: monthStart(TODAY),
    to: TODAY,
    preset: 'thisMonth',
  })
  const [toast, setToast] = useState<ToastState | null>(null)
  const [drill, setDrill] = useState<DrillState | null>(null)
  const [foldedFlow, setFoldedFlow] = useState<Record<string, boolean>>({})
  const [foldedCash, setFoldedCash] = useState<Record<string, boolean>>({})
  const [flowSide, setFlowSide] = useState<'income' | 'expense'>('expense')
  const [cashSide, setCashSide] = useState<'in' | 'out'>('in')
  const [balanceSide, setBalanceSide] = useState<'assets' | 'liabilities'>('assets')
  // 展示偏好只落 localStorage；面板里的切换先改 draft，页面即时按 draft 重算。
  const [viewSettings, setViewSettings] = useState<ReportViewSettings>(() => loadReportSettings())
  const [configTab, setConfigTab] = useState<ReportTab | null>(null)
  const [draftSettings, setDraftSettings] = useState<ReportViewSettings | null>(null)
  const effectiveSettings = draftSettings ?? viewSettings

  // 时点不超过数据截止日：月末/年末锚点在本月会被截到 asOf，避免出现 10-31 晚于 10-28。
  const balancePoint = clampAsOfPoint(time.point, TODAY)
  const balance = useMemo(
    () => deriveBalanceReport(ledger, balancePoint),
    [ledger, balancePoint],
  )
  const flow = useMemo(
    () => deriveFlowReport(ledger, time.from, time.to, time.gran),
    [ledger, time.from, time.to, time.gran],
  )
  const cash = useMemo(() => deriveCashReport(ledger, time.from, time.to), [ledger, time.from, time.to])
  // 桑基只在 PC 渲染（移动端沿用 Top5 横条）；隐藏分组并入「其他」后仍守恒。
  const sankey = useMemo(
    () => (device === 'desktop' ? deriveCashSankey(ledger, cash, effectiveSettings.cash.groups) : null),
    [device, ledger, cash, effectiveSettings.cash.groups],
  )
  const invest = useMemo(() => deriveInvestmentReport(ledger), [ledger])
  const drillData = useMemo<DrillData | null>(
    () => (drill ? buildDrill(ledger, drill.node, drill.kind, time.from, time.to) : null),
    [drill, ledger, time.from, time.to],
  )

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    setDrill(null)
    setFoldedFlow({})
    setFoldedCash({})
  }, [tab, time.from, time.to, time.point])

  const notify = (message: string) => setToast({ message })
  const toggleFlowFold = (id: string) =>
    setFoldedFlow((current) => ({ ...current, [id]: current[id] === false }))
  const toggleCashFold = (id: string) =>
    setFoldedCash((current) => ({ ...current, [id]: current[id] === false }))

  const openConfig = (next: ReportTab) => {
    // 配置在目标报表上生效：先把视图切过去，抽屉后仍能看到改前/改后结构。
    setTab(next)
    setDraftSettings(viewSettings)
    setConfigTab(next)
  }
  const closeConfig = () => {
    setDraftSettings(null)
    setConfigTab(null)
  }
  const commitConfig = () => {
    if (!draftSettings) return
    saveReportSettings(draftSettings)
    setViewSettings(draftSettings)
    closeConfig()
    notify('已应用展示配置 · 不写回账本')
  }
  const resetConfig = () => setDraftSettings(defaultReportSettings())
  const closeSettings = () => {
    // 关闭抽屉等同取消未确认的改动，避免「看过就生效」。
    closeConfig()
    onSettingsToggle()
  }

  const pageState =
    dataState === 'loading' ? (
      <LoadingSkeleton device={device} variant="reports" />
    ) : dataState === 'error' ? (
      <ErrorPanel onRetry={onRetry} />
    ) : dataState === 'empty' ? (
      <ReportsEmpty onImport={onImport} />
    ) : null

  const content = (
    <>
      <PageHead device={device} tab={tab} onTab={(next) => setTab(next)} />
      {pageState ?? (
        <>
          <TimeBar
            device={device}
            tab={tab}
            time={time}
            onChange={setTime}
            onToast={notify}
            onOpenSettings={onSettingsToggle}
          />
          {tab === 'balance' && (
            <BalanceView
              device={device}
              report={balance}
              settings={effectiveSettings.balance}
              side={balanceSide}
              onSide={setBalanceSide}
              from={time.from}
              to={time.to}
              onViewFlow={onViewFlow}
            />
          )}
          {tab === 'flow' && (
            <FlowView
              device={device}
              report={flow}
              settings={effectiveSettings.flow}
              side={flowSide}
              onSide={setFlowSide}
              folded={foldedFlow}
              onFold={toggleFlowFold}
              onDrill={(node, kind) => {
                if (kind !== 'asset') setDrill({ node, kind })
              }}
            />
          )}
          {tab === 'cash' && (
            <CashView
              device={device}
              report={cash}
              sankey={sankey}
              settings={effectiveSettings.cash}
              side={cashSide}
              onSide={setCashSide}
              folded={foldedCash}
              onFold={toggleCashFold}
              from={time.from}
              to={time.to}
              onViewFlow={onViewFlow}
              rootOf={(categoryId) => getCategoryRootId(ledger, categoryId)}
            />
          )}
          {tab === 'invest' && (
            <InvestView device={device} report={invest} settings={effectiveSettings.invest} />
          )}
        </>
      )}
    </>
  )

  return (
    <div className="mb-rp-page" data-device={device}>
      {content}

      <DrillDrawer
        device={device}
        data={drillData}
        onClose={() => setDrill(null)}
        onViewFlow={() => {
          if (!drill) return
          onViewFlow(
            drill.node.id === 'rest'
              ? { categoryIds: drill.node.mergedIds, from: time.from, to: time.to }
              : { categoryId: drill.node.id, from: time.from, to: time.to },
          )
          setDrill(null)
        }}
      />

      <Drawer
        opened={settingsOpen}
        onClose={closeSettings}
        position={device === 'mobile' ? 'bottom' : 'right'}
        size={device === 'mobile' ? 'auto' : 420}
        withinPortal={false}
        title="报表设置"
        classNames={{
          content:
            device === 'mobile'
              ? 'mb-rp-sheet mb-rp-sheet-settings is-mobile'
              : 'mb-rp-sheet mb-rp-sheet-settings',
          header: 'mb-rp-sheet-head',
          title: 'mb-rp-sheet-title',
          body: 'mb-rp-sheet-body is-settings',
          overlay: 'mb-rp-overlay',
          close: 'mb-rp-sheet-close',
        }}
      >
        <div className="mb-rp-settings">
          <div className="mb-rp-settings-scroll">
            {configTab && draftSettings ? (
              <ReportConfigPanel
                tab={configTab}
                draft={draftSettings}
                onChange={setDraftSettings}
                cashPresence={cashGroupPresence(cash)}
                onBack={closeConfig}
              />
            ) : (
              <>
                <p className="mb-rp-settings-note">报表只读 · 不写回账本 · 只改展示口径</p>
                {TABS.map((item) => (
                  <div className="mb-rp-settings-row" key={item.id}>
                    <div>
                      <p className="mb-rp-settings-title">{item.label}</p>
                    </div>
                    <button type="button" className="mb-rp-btn is-ghost" onClick={() => openConfig(item.id)}>
                      配置
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
          {configTab && draftSettings ? (
            <div className="mb-rp-sheet-actions is-config">
              <button type="button" className="mb-rp-btn is-ghost" onClick={resetConfig}>
                重置
              </button>
              <button type="button" className="mb-rp-btn is-ghost" onClick={closeConfig}>
                取消
              </button>
              <button type="button" className="mb-rp-btn is-primary" onClick={commitConfig}>
                确认
              </button>
            </div>
          ) : (
            <div className="mb-rp-sheet-actions">
              <button type="button" className="mb-rp-btn is-primary" onClick={closeSettings}>
                完成
              </button>
            </div>
          )}
        </div>
      </Drawer>

      {toast && (
        <div
          className={settingsOpen && device === 'mobile' ? 'mb-rp-toast is-over-sheet' : 'mb-rp-toast'}
          role="status"
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}

function BalanceView({
  device,
  report,
  settings,
  side,
  onSide,
  from,
  to,
  onViewFlow,
}: {
  device: DeviceMode
  report: BalanceReport
  settings: ReportViewSettings['balance']
  side: 'assets' | 'liabilities'
  onSide: (next: 'assets' | 'liabilities') => void
  from: string
  to: string
  onViewFlow: (options: { accountId: string; from: string; to: string }) => void
}) {
  const shownAssets = groupBalanceRows(report.assets, settings.groupMode)
  const shownLiabilities = groupBalanceRows(report.liabilities, settings.groupMode)
  const [kindDetail, setKindDetail] = useState<BalanceRow['kind'] | null>(null)
  const assetNodes = useMemo(
    () => buildAssetComposition(report.assets, settings.groupMode),
    [report.assets, settings.groupMode],
  )
  const kindAccounts = kindDetail
    ? report.assets.filter((row) => row.kind === kindDetail)
    : []
  const kindAmount = kindAccounts.reduce((sum, row) => sum + row.amount, 0)

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
  const showKind = settings.showKindColumn && settings.groupMode === 'account'
  const cellsOf = (row: { name: string; kind: string; amount: number }) =>
    showKind ? [row.name, row.kind, currency(row.amount)] : [row.name, currency(row.amount)]
  const assetColumns: ReportColumn[] = showKind
    ? [{ label: '账户' }, { label: '性质' }, { label: '金额', align: 'num' }]
    : [{ label: '账户' }, { label: '金额', align: 'num' }]
  const assetTotalCells = showKind ? ['合计', '', currency(report.assetTotal)] : ['合计', currency(report.assetTotal)]
  const equityTotalCells = showKind
    ? ['合计', '', currency(report.equityTotal)]
    : ['合计', currency(report.equityTotal)]

  const assetRows: ReportRow[] = shownAssets.map((row) => ({
    id: row.id,
    cells: cellsOf(row),
  }))
  const liabilityRows: ReportRow[] = [
    ...shownLiabilities.map((row) => ({
      id: row.id,
      cells: cellsOf(row),
    })),
    {
      id: 'equity',
      cells: showKind
        ? ['所有者权益', '净资产', currency(report.equity)]
        : ['所有者权益', currency(report.equity)],
      tone: 'income' as const,
    },
  ]

  const balanceMinRows = Math.max(assetRows.length, liabilityRows.length)

  const assetCards: CardRow[] = shownAssets.map((row) => ({
    id: row.id,
    label: row.name,
    meta: showKind ? row.kind : undefined,
    amount: currency(row.amount),
    barTone: 'accent',
    share: report.assetTotal === 0 ? 0 : (row.amount / report.assetTotal) * 100,
  }))
  const liabilityCards: CardRow[] = [
    ...shownLiabilities.map((row) => ({
      id: row.id,
      label: row.name,
      meta: showKind ? row.kind : undefined,
      amount: currency(row.amount),
      tone: 'expense' as const,
      barTone: 'expense' as const,
      share: report.equityTotal === 0 ? 0 : (row.amount / report.equityTotal) * 100,
    })),
    {
      id: 'equity',
      label: '所有者权益',
      meta: '净资产',
      amount: currency(report.equity),
      tone: 'income' as const,
      barTone: 'income' as const,
      share: report.equityTotal === 0 ? 0 : (report.equity / report.equityTotal) * 100,
    },
  ]

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
          ? '按性质汇总：环与资产表同一口径，点切块或图例查看该性质的账户'
          : '按账户：环与资产表同一口径，点切块或图例落到该账户的流水'}
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
            total={assetTotalCells}
          />
          <ReportTable
            device={device}
            title="负债与权益"
            ariaLabel="负债与权益明细"
            columns={assetColumns}
            rows={liabilityRows}
            minRows={balanceMinRows}
            total={equityTotalCells}
          />
        </div>
      ) : (
        <>
          <Segmented
            label="资产负债分段"
            value={side}
            options={[
              { id: 'assets', label: '资产' },
              { id: 'liabilities', label: '负债与权益' },
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
              title="负债与权益"
              desc={`负债 ${currency(report.liabilityTotal)} · 权益 ${currency(report.equity)}`}
              rows={liabilityCards}
              total={{ label: '合计', value: currency(report.equityTotal) }}
            />
          )}
        </>
      )}
      <Drawer
        opened={kindDetail !== null}
        onClose={() => setKindDetail(null)}
        position={device === 'mobile' ? 'bottom' : 'right'}
        size={device === 'mobile' ? 'auto' : 420}
        withinPortal={false}
        title={kindDetail ? `${kindDetail} · 账户明细` : '账户明细'}
        classNames={{
          content: 'mb-rp-sheet',
          header: 'mb-rp-sheet-head',
          title: 'mb-rp-sheet-title',
          body: 'mb-rp-sheet-body',
          overlay: 'mb-rp-overlay',
          close: 'mb-rp-sheet-close',
        }}
      >
        {kindDetail && (
          <div className="mb-rp-drill">
            <div className="mb-rp-drill-head">
              <span className="mb-rp-drill-label">{kindDetail}合计</span>
              <span className="mb-rp-drill-amount is-neutral">{currency(kindAmount)}</span>
            </div>
            <h4 className="mb-rp-drill-title">{kindAccounts.length} 个账户</h4>
            {kindAccounts.map((row) => (
              <button
                type="button"
                className="mb-rp-drill-row is-action"
                key={row.id}
                onClick={() => {
                  onViewFlow({ accountId: row.id, from, to })
                  setKindDetail(null)
                }}
              >
                <span>{row.name}</span>
                <span className="mb-rp-drill-value">{currency(row.amount)}</span>
              </button>
            ))}
            <p className="mb-rp-chart-note">点账户落到流水，按该账户筛选；合计与图例一致。</p>
          </div>
        )}
      </Drawer>
    </>
  )
}

function FlowView({
  device,
  report,
  settings,
  side,
  onSide,
  folded,
  onFold,
  onDrill,
}: {
  device: DeviceMode
  report: FlowReport
  settings: ReportViewSettings['flow']
  side: 'income' | 'expense'
  onSide: (next: 'income' | 'expense') => void
  folded: Record<string, boolean>
  onFold: (id: string) => void
  onDrill: (node: FlowTreeNode, kind: DonutKind) => void
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
  const incomeCards: CardRow[] = flattenCards(
    report.incomeTrees,
    folded,
    onFold,
    'income',
    (node) => onDrill(node, 'income'),
    rowColumns,
  )
  const expenseCards: CardRow[] = flattenCards(
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
          <Segmented
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

function flattenCards(
  nodes: FlowTreeNode[],
  folded: Record<string, boolean>,
  onFold: (id: string) => void,
  tone: 'income' | 'expense',
  onOpen: (node: FlowTreeNode) => void,
  columns: { showCount?: boolean; showShare?: boolean } = {},
): CardRow[] {
  const showCount = columns.showCount !== false
  const showShare = columns.showShare !== false
  const metaOf = (node: FlowTreeNode) =>
    [
      showCount ? `${node.count} 笔` : null,
      showShare ? formatPercent(node.share, 1, false) : null,
    ]
      .filter(Boolean)
      .join(' · ') || undefined
  const rows: CardRow[] = []
  for (const node of nodes) {
    const expanded = folded[node.id] !== false
    rows.push({
      id: node.id,
      label: node.name,
      meta: metaOf(node),
      amount: `${tone === 'income' ? '+' : '−'}${currency(node.amount)}`,
      tone,
      share: node.share,
      barTone: tone,
      fold: node.children.length > 0 ? { expanded, onToggle: () => onFold(node.id) } : undefined,
      onOpen: () => onOpen(node),
    })
    if (expanded) {
      for (const child of node.children) {
        rows.push({
          id: child.id,
          level: 1,
          label: child.name,
          meta: metaOf(child),
          hint: '†',
          amount: `${tone === 'income' ? '+' : '−'}${currency(child.amount)}`,
          tone,
          share: child.share,
          barTone: tone,
        })
      }
    }
  }
  return rows
}

function CashView({
  device,
  report,
  sankey,
  settings,
  side,
  onSide,
  folded,
  onFold,
  from,
  to,
  onViewFlow,
  rootOf,
}: {
  device: DeviceMode
  report: CashReport
  sankey: CashSankey | null
  settings: ReportViewSettings['cash']
  side: 'in' | 'out'
  onSide: (next: 'in' | 'out') => void
  folded: Record<string, boolean>
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
  // 只按配置过滤可见分组；合计随可见分组重算，未显示的金额不留在表尾。
  const inflowGroups = visibleCashGroups(report.inflowGroups, settings)
  const outflowGroups = visibleCashGroups(report.outflowGroups, settings)
  const inflowTotal = cashTotalOf(inflowGroups)
  const outflowTotal = cashTotalOf(outflowGroups)
  const hiddenIn = report.inflowGroups.length - inflowGroups.length
  const hiddenOut = report.outflowGroups.length - outflowGroups.length
  const hiddenNote = (hidden: number) => (hidden > 0 ? ` · 已隐藏 ${hidden} 组` : '')
  const groups = side === 'in' ? inflowGroups : outflowGroups
  // 左右两表共用一份 folded：键必须带方向前缀，否则同名分组（经营 / 投资 / 筹资）会串扰
  const foldKey = (id: string) => `${side}:${id}`
  const cards: CardRow[] = []
  for (const group of groups) {
    const key = foldKey(group.key)
    const expanded = folded[key] !== false
    cards.push({
      id: key,
      label: group.name,
      meta: `${group.count} 笔`,
      amount: currency(group.total),
      tone: side === 'in' ? 'income' : 'expense',
      fold: group.children.length > 0 ? { expanded, onToggle: () => onFold(key) } : undefined,
    })
    if (expanded) {
      for (const child of group.children) {
        cards.push({
          id: foldKey(child.id),
          level: 1,
          label: child.label,
          meta: child.account,
          amount: currency(child.amount),
          tone: side === 'in' ? 'income' : 'expense',
        })
      }
    }
  }

  const inflowRows = cashRowsFor('in', inflowGroups, folded, onFold)
  const outflowRows = cashRowsFor('out', outflowGroups, folded, onFold)
  const cashMinRows = Math.max(inflowRows.length, outflowRows.length)

  return (
    <>
      <MetricStrip device={device} metrics={report.metrics} flat />
      {device === 'desktop' ? (
        <>
          {sankey && (
            <ChartCard title="现金流流向" desc="期初 → 流入 / 流出 → 期末 · 账户间转账为内部转移">
              <CashSankeyChart data={sankey} onOpen={openSankeyNode} />
            </ChartCard>
          )}
          <div className="mb-rp-cols">
          <ReportTable
            device={device}
            title="流入"
            desc={`合计 ${currency(inflowTotal)}${hiddenNote(hiddenIn)}`}
            ariaLabel="现金流入"
            columns={[{ label: '分组 / 交易' }, { label: '账户 / 笔数' }, { label: '金额', align: 'num' }]}
            rows={inflowRows}
            minRows={cashMinRows}
            total={['合计', '', currency(inflowTotal)]}
          />
          <ReportTable
            device={device}
            title="流出"
            desc={`合计 ${currency(outflowTotal)}${hiddenNote(hiddenOut)}${
              report.reconcile.transferFee > 0 ? ` · 手续费 ${currency(report.reconcile.transferFee)} 不计` : ''
            }`}
            ariaLabel="现金流出"
            columns={[{ label: '分组 / 交易' }, { label: '账户 / 笔数' }, { label: '金额', align: 'num' }]}
            rows={outflowRows}
            minRows={cashMinRows}
            total={['合计', '', currency(outflowTotal)]}
          />
          </div>
        </>
      ) : (
        <>
          <CashFlowBars
            inflowGroups={inflowGroups}
            outflowGroups={outflowGroups}
            inflowTotal={inflowTotal}
            outflowTotal={outflowTotal}
          />
          <Segmented
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
            desc={side === 'in' ? `合计 ${currency(inflowTotal)}${hiddenNote(hiddenIn)}` : `合计 ${currency(outflowTotal)}${hiddenNote(hiddenOut)}${
              report.reconcile.transferFee > 0 ? ` · 手续费 ${currency(report.reconcile.transferFee)} 不计` : ''
            }`}
            rows={cards}
            total={{ label: '合计', value: currency(side === 'in' ? inflowTotal : outflowTotal) }}
          />
        </>
      )}
      <Drawer
        opened={sankeyNode !== null}
        onClose={() => setSankeyNode(null)}
        position={device === 'mobile' ? 'bottom' : 'right'}
        size={device === 'mobile' ? 'auto' : 420}
        withinPortal={false}
        title={sankeyNode ? `${sankeyNode.name} · 现金流明细` : '现金流明细'}
        classNames={{
          content: 'mb-rp-sheet',
          header: 'mb-rp-sheet-head',
          title: 'mb-rp-sheet-title',
          body: 'mb-rp-sheet-body',
          overlay: 'mb-rp-overlay',
          close: 'mb-rp-sheet-close',
        }}
      >
        {sankeyNode && (
          <div className="mb-rp-drill">
            <div className="mb-rp-drill-head">
              <span className="mb-rp-drill-label">
                {sankeyNode.layer === 1 ? '活动分组合计' : '全账户净额'}
              </span>
              <span className="mb-rp-drill-amount is-neutral">{currency(sankeyNode.amount)}</span>
            </div>
            <h4 className="mb-rp-drill-title">
              {sankeyNode.children.length > 0 ? `${sankeyNode.children.length} 笔` : '无分组明细'}
            </h4>
            {sankeyNode.children.length === 0 ? (
              <p className="mb-rp-empty-line">期初 / 期末为全账户净额，没有可下钻的分组流水</p>
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
            {sankeyNode.hiddenCount ? (
              <p className="mb-rp-chart-note">
                已隐藏 {sankeyNode.hiddenCount} 组，全部并入「其他」以保持守恒；表尾合计仍按可见分组重算。
              </p>
            ) : null}
            <div className="mb-rp-sheet-actions">
              <button type="button" className="mb-rp-btn is-ghost" onClick={() => setSankeyNode(null)}>
                关闭
              </button>
              {sankeyCategories.length > 0 && (
                <button
                  type="button"
                  className="mb-rp-btn is-primary"
                  onClick={() => {
                    onViewFlow({ categoryIds: sankeyCategories, from, to })
                    setSankeyNode(null)
                  }}
                >
                  在流水中查看
                </button>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </>
  )
}

function InvestView({
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

function DrillDrawer({
  device,
  data,
  onClose,
  onViewFlow,
}: {
  device: DeviceMode
  data: DrillData | null
  onClose: () => void
  onViewFlow: () => void
}) {
  return (
    <Drawer
      opened={Boolean(data)}
      onClose={onClose}
      position={device === 'mobile' ? 'bottom' : 'right'}
      size={device === 'mobile' ? 'auto' : 420}
      withinPortal={false}
      title={data ? `${data.title} · 下钻` : '下钻'}
      classNames={{
        content: 'mb-rp-sheet',
        header: 'mb-rp-sheet-head',
        title: 'mb-rp-sheet-title',
        body: 'mb-rp-sheet-body',
        overlay: 'mb-rp-overlay',
        close: 'mb-rp-sheet-close',
      }}
    >
      {data && (
        <div className="mb-rp-drill">
          <div className="mb-rp-drill-head">
            <span className="mb-rp-drill-label">当期合计</span>
            <span className={`mb-rp-drill-amount is-${data.tone}`}>
              {data.tone === 'income' ? '+' : '−'}
              {currency(data.amount)}
            </span>
          </div>
          <h4 className="mb-rp-drill-title">二级类别</h4>
          {data.children.length === 0 ? (
            <p className="mb-rp-empty-line">该分类没有二级类别</p>
          ) : (
            data.children.map((child) => (
              <div className="mb-rp-drill-row" key={child.id}>
                <span>{child.name}</span>
                <span className="mb-rp-drill-meta">{child.count} 笔</span>
                <span className="mb-rp-drill-value">{currency(child.amount)}</span>
              </div>
            ))
          )}
          <h4 className="mb-rp-drill-title">相关流水</h4>
          {data.transactions.length === 0 ? (
            <p className="mb-rp-empty-line">该期间没有相关流水</p>
          ) : (
            data.transactions.map((transaction) => (
              <div className="mb-rp-drill-row is-tx" key={transaction.id}>
                <div>
                  <span className="mb-rp-drill-tx-label">{transaction.label}</span>
                  <span className="mb-rp-drill-meta">
                    {transaction.date.slice(5)} · {transaction.account}
                  </span>
                </div>
                <span className={`mb-rp-drill-value is-${transaction.tone}`}>
                  {currency(transaction.amount)}
                </span>
              </div>
            ))
          )}
          <div className="mb-rp-sheet-actions">
            <button type="button" className="mb-rp-btn is-ghost" onClick={onClose}>
              关闭
            </button>
            <button type="button" className="mb-rp-btn is-primary" onClick={onViewFlow}>
              在流水中查看
            </button>
          </div>
        </div>
      )}
    </Drawer>
  )
}
