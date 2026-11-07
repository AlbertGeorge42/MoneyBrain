/**
 * 报表页（HF 批次 3）
 *
 * 四视图共用一条时间条与一套指标条：资产负债看时点，收支 / 现金流 / 投资看期间。
 * PC 双列表格、移动卡片行；结构以 concept-design 的报表章节为准，视觉只用 design-tokens。
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { FolderInput, ScanLine } from 'lucide-react'
import { HfSheet } from '@/features/shared/HfSheet'
import { useLedger } from '@/features/overview/ledgerStore'
import {
  getCategoryRootId,
  ledgerAnchorDay,
  type LedgerAccountCategory,
} from '@/features/overview/model'
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
  balanceGroupExpanded,
  buildAssetComposition,
  buildBalanceGroups,
  buildDrill,
  cashRowsFor,
  currency,
  deriveBalanceReport,
  deriveCashReport,
  deriveFlowReport,
  deriveInvestmentReport,
  signedCurrency,
  type BalanceGroup,
  type BalanceReport,
  type BalanceRow,
  type CashReport,
  type DrillData,
  type FlowTreeNode,
  type FlowReport,
  type InvestmentReport,
} from './reportsModel'
import { useApiBalanceReport, useApiCashReport, useApiFlowReport, useApiInvestReport } from './apiReports'
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

function initialReportTime(anchor: string): ReportTime {
  return { gran: 'month', point: anchor, from: monthStart(anchor), to: anchor, preset: 'thisMonth' }
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
  // API 模式用真实今天 / 最新流水做锚点；用户改过时间后不再跟随账本刷新。
  const apiMode = Boolean(ledger.snapshot)
  const anchor = ledgerAnchorDay(ledger)
  const [timeOverride, setTimeOverride] = useState<ReportTime | null>(null)
  const time = timeOverride ?? initialReportTime(anchor)
  const setTime = (next: ReportTime) => setTimeOverride(next)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [drill, setDrill] = useState<DrillState | null>(null)
  const [foldedFlow, setFoldedFlow] = useState<Record<string, boolean>>({})
  const [foldedCash, setFoldedCash] = useState<Record<string, boolean>>({})
  const [flowSide, setFlowSide] = useState<'income' | 'expense'>('expense')
  // 「计入不计收支」只影响收支明细口径；关闭时按旧版默认排除这类流水。
  const [includeExcluded, setIncludeExcluded] = useState(false)
  const [cashSide, setCashSide] = useState<'in' | 'out'>('in')
  const [balanceSide, setBalanceSide] = useState<'assets' | 'liabilities'>('assets')
  // 展示偏好只落 localStorage；面板里的切换先改 draft，页面即时按 draft 重算。
  const [viewSettings, setViewSettings] = useState<ReportViewSettings>(() => loadReportSettings())
  const [configTab, setConfigTab] = useState<ReportTab | null>(null)
  const [draftSettings, setDraftSettings] = useState<ReportViewSettings | null>(null)
  const effectiveSettings = draftSettings ?? viewSettings

  // 时点不超过数据截止日：月末/年末锚点在本月会被截到 asOf，避免出现 10-31 晚于 10-28。
  const balancePoint = clampAsOfPoint(time.point, anchor)
  const seedBalance = useMemo(
    () => deriveBalanceReport(ledger, balancePoint),
    [ledger, balancePoint],
  )
  const seedFlow = useMemo(
    () => deriveFlowReport(ledger, time.from, time.to, time.gran, includeExcluded),
    [ledger, time.from, time.to, time.gran, includeExcluded],
  )
  const seedCash = useMemo(() => deriveCashReport(ledger, time.from, time.to), [ledger, time.from, time.to])
  const seedInvest = useMemo(() => deriveInvestmentReport(ledger), [ledger])

  // API 模式：合计口径全部来自后端报表端点，查询自身也有加载 / 失败态。
  const apiReady = apiMode && dataState === 'normal'
  const balanceApi = useApiBalanceReport(balancePoint, ledger, apiReady && tab === 'balance')
  const flowApi = useApiFlowReport(time.from, time.to, time.gran, ledger, includeExcluded, apiReady && tab === 'flow')
  const cashApi = useApiCashReport(time.from, time.to, ledger, apiReady && tab === 'cash')
  const investApi = useApiInvestReport(time.from, time.to, apiReady && tab === 'invest')

  const balance = apiMode ? balanceApi.data : seedBalance
  const flow = apiMode ? flowApi.data : seedFlow
  const cash = apiMode ? cashApi.data : seedCash
  const invest = apiMode ? investApi.data : seedInvest
  // 桑基只在 PC 渲染（移动端沿用 Top5 横条）；隐藏分组并入「其他」后仍守恒。
  const sankey = useMemo(
    () =>
      device === 'desktop' && cash
        ? deriveCashSankey(ledger, cash, effectiveSettings.cash.groups)
        : null,
    [device, ledger, cash, effectiveSettings.cash.groups],
  )
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

  const activeApi =
    tab === 'balance' ? balanceApi : tab === 'flow' ? flowApi : tab === 'cash' ? cashApi : investApi
  const reportPageState =
    apiReady && activeApi.status === 'error' ? (
      <ErrorPanel
        onRetry={() => {
          activeApi.refetch()
          onRetry()
        }}
      />
    ) : apiReady && activeApi.status === 'loading' ? (
      <LoadingSkeleton device={device} variant="reports" />
    ) : null

  const pageState =
    dataState === 'loading' ? (
      <LoadingSkeleton device={device} variant="reports" />
    ) : dataState === 'error' ? (
      <ErrorPanel onRetry={onRetry} />
    ) : dataState === 'empty' ? (
      <ReportsEmpty onImport={onImport} />
    ) : (
      reportPageState
    )

  const content = (
    <>
      <PageHead device={device} tab={tab} onTab={(next) => setTab(next)} />
      {pageState ?? (
        <>
          <TimeBar
            device={device}
            tab={tab}
            time={time}
            today={anchor}
            onChange={setTime}
            onToast={notify}
            onOpenSettings={onSettingsToggle}
          />
          {tab === 'balance' && balance && (
            <BalanceView
              device={device}
              report={balance}
              settings={effectiveSettings.balance}
              categories={ledger.accountCategories}
              side={balanceSide}
              onSide={setBalanceSide}
              from={time.from}
              to={time.to}
              onViewFlow={onViewFlow}
            />
          )}
          {tab === 'flow' && flow && (
            <FlowView
              device={device}
              report={flow}
              settings={effectiveSettings.flow}
              side={flowSide}
              onSide={setFlowSide}
              includeExcluded={includeExcluded}
              onIncludeExcluded={setIncludeExcluded}
              folded={foldedFlow}
              onFold={toggleFlowFold}
              onDrill={(node, kind) => {
                if (kind !== 'asset') setDrill({ node, kind })
              }}
            />
          )}
          {tab === 'cash' && cash && (
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
          {tab === 'invest' && invest && (
            <InvestView device={device} report={invest} settings={effectiveSettings.invest} />
          )}
          {tab === 'invest' && apiMode && investApi.status === 'success' && investApi.data === null && (
            <section className="mb-rp-card mb-rp-empty">
              <h2 className="mb-rp-empty-title">暂无投资账户</h2>
              <p className="mb-rp-empty-desc">
                投资分析只统计标记为「投资资产」的账户；当前账本没有可分析的投资持仓。
              </p>
            </section>
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

      <HfSheet
        variant="report"
        device={device}
        opened={settingsOpen}
        onClose={closeSettings}
        title="报表设置"
        contentClassName={device === 'mobile' ? 'mb-rp-sheet-settings is-mobile' : 'mb-rp-sheet-settings'}
        bodyClassName="is-settings"
        actions={
          configTab && draftSettings ? (
            <>
              <button type="button" className="mb-rp-btn is-ghost" onClick={resetConfig}>
                重置
              </button>
              <button type="button" className="mb-rp-btn is-ghost" onClick={closeConfig}>
                取消
              </button>
              <button type="button" className="mb-rp-btn is-primary" onClick={commitConfig}>
                确认
              </button>
            </>
          ) : (
            <button type="button" className="mb-rp-btn is-primary" onClick={closeSettings}>
              完成
            </button>
          )
        }
        actionsClassName={configTab && draftSettings ? 'is-config' : undefined}
      >
        <div className="mb-rp-settings">
          <div className="mb-rp-settings-scroll">
            {configTab && draftSettings ? (
              <ReportConfigPanel
                tab={configTab}
                draft={draftSettings}
                onChange={setDraftSettings}
                cashPresence={cashGroupPresence(cash ?? seedCash)}
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
        </div>
      </HfSheet>

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
  // 层级折叠是纯展示状态：默认一级展开、二级收起，不改任何合计。
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
      const expandable = root.groups.length > 0 || root.accounts.length > 0
      rows.push({
        id: root.id,
        cells: groupCells(root.name, root.accountCount, root.amount),
        hint: root.predicted ? '预测' : undefined,
        fold: expandable ? { expanded, onToggle: () => toggleGroup(root) } : undefined,
      })
      if (!expanded) continue
      for (const sub of root.groups) {
        const subExpanded = balanceGroupExpanded(foldedBalance, sub)
        rows.push({
          id: sub.id,
          level: 1,
          cells: groupCells(sub.name, sub.accountCount, sub.amount),
          hint: sub.predicted ? '预测' : undefined,
          fold: sub.accounts.length
            ? { expanded: subExpanded, onToggle: () => toggleGroup(sub) }
            : undefined,
        })
        if (!subExpanded) continue
        for (const account of sub.accounts) {
          rows.push({
            id: account.id,
            level: 2,
            cells: groupCells(account.name, null, account.amount),
            hint: account.predicted ? '预测' : undefined,
          })
        }
      }
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
      const expandable = root.groups.length > 0 || root.accounts.length > 0
      cards.push({
        id: root.id,
        label: root.name,
        meta: `${root.accountCount} 个账户`,
        amount: currency(root.amount),
        tone: tone === 'expense' ? ('expense' as const) : undefined,
        barTone: tone,
        share: shareOf(root.amount, total),
        fold: expandable ? { expanded, onToggle: () => toggleGroup(root) } : undefined,
      })
      if (!expanded) continue
      for (const sub of root.groups) {
        const subExpanded = balanceGroupExpanded(foldedBalance, sub)
        cards.push({
          id: sub.id,
          level: 1,
          label: sub.name,
          meta: `${sub.accountCount} 个账户`,
          amount: currency(sub.amount),
          tone: tone === 'expense' ? ('expense' as const) : undefined,
          barTone: tone,
          share: shareOf(sub.amount, total),
          fold: sub.accounts.length
            ? { expanded: subExpanded, onToggle: () => toggleGroup(sub) }
            : undefined,
        })
        if (!subExpanded) continue
        for (const account of sub.accounts) {
          cards.push({
            id: account.id,
            level: 2,
            label: account.name,
            amount: currency(account.amount),
            tone: tone === 'expense' ? ('expense' as const) : undefined,
          })
        }
      }
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
          <Segmented
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
      <section className="mb-rp-card mb-rp-networth" aria-label="净资产">
        <div className="mb-rp-networth-copy">
          <span className="mb-rp-networth-label">净资产</span>
          <span className="mb-rp-networth-hint">
            资产合计 {currency(report.assetTotal)} − 负债合计 {currency(report.liabilityTotal)}，
            不属于负债
          </span>
        </div>
        <span className="mb-rp-networth-value">{currency(report.netWorth)}</span>
      </section>
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
      </HfSheet>
    </>
  )
}

function FlowView({
  device,
  report,
  settings,
  side,
  onSide,
  includeExcluded,
  onIncludeExcluded,
  folded,
  onFold,
  onDrill,
}: {
  device: DeviceMode
  report: FlowReport
  settings: ReportViewSettings['flow']
  side: 'income' | 'expense'
  onSide: (next: 'income' | 'expense') => void
  includeExcluded: boolean
  onIncludeExcluded: (next: boolean) => void
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
  // 表说明与开关同口径：开关一变，说明里也直接写明是否计入，不让标题与数字脱节。
  const scopeLegend = report.includeExcluded ? ' · 计入不计收支' : ' · 不含不计收支'

  return (
    <>
      <div className="mb-rp-scope">
        <button
          type="button"
          role="switch"
          aria-checked={includeExcluded}
          className={`mb-rp-switch${includeExcluded ? ' is-on' : ''}`}
          onClick={() => onIncludeExcluded(!includeExcluded)}
        >
          <span className="mb-rp-switch-track" aria-hidden="true">
            <span className="mb-rp-switch-thumb" />
          </span>
          <span className="mb-rp-switch-label">计入不计收支</span>
        </button>
        <span className="mb-rp-scope-note">
          {includeExcluded
            ? '本期收入 / 支出 / 结余已计入标记为「不计收支」的流水'
            : '本期收入 / 支出 / 结余按默认口径排除「不计收支」流水'}
        </span>
      </div>
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
          />
        </>,
      )}
      {device === 'desktop' ? (
        <div className="mb-rp-cols">
          <ReportTable
            device={device}
            title="收入构成"
            desc={`合计 ${currency(report.income)}${scopeLegend}${childLegend(report.incomeTrees)}`}
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
            desc={`合计 ${currency(report.expense)}${scopeLegend}${childLegend(report.expenseTrees)}`}
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
            desc={`合计 ${currency(side === 'expense' ? report.expense : report.income)}${scopeLegend}${childLegend(
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
      hint: node.predicted ? '预测' : undefined,
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
          hint: child.predicted ? '† 预测' : '†',
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
      hint: group.predicted ? '预测' : undefined,
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
          hint: child.predicted ? '预测' : undefined,
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
      {report.predictionNote && <p className="mb-rp-predict-note">{report.predictionNote}</p>}
      {device === 'desktop' ? (
        <>
          {sankey && (
            <ChartCard title="现金流流向" desc="收入分类 → 账户 → 支出分类 · 期初 / 期末逐账户读数">
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
      <HfSheet
        variant="report"
        device={device}
        opened={sankeyNode !== null}
        onClose={() => setSankeyNode(null)}
        title={sankeyNode ? `${sankeyNode.name} · 现金流明细` : '现金流明细'}
        actions={
          <>
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
            {sankeyNode.hiddenCount ? (
              <p className="mb-rp-chart-note">
                已隐藏 {sankey?.hiddenGroups ?? sankeyNode.hiddenCount} 组，并入「其他」以保持守恒；表尾合计按可见分组重算（图与表合计允许不同）。
              </p>
            ) : null}
          </div>
        )}
      </HfSheet>
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
    <HfSheet
      variant="report"
      device={device}
      opened={Boolean(data)}
      onClose={onClose}
      title={data ? `${data.title} · 下钻` : '下钻'}
      actions={
        <>
          <button type="button" className="mb-rp-btn is-ghost" onClick={onClose}>
            关闭
          </button>
          <button type="button" className="mb-rp-btn is-primary" onClick={onViewFlow}>
            在流水中查看
          </button>
        </>
      }
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
        </div>
      )}
    </HfSheet>
  )
}
