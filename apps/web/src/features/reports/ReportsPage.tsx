/**
 * 报表页（HF 批次 3）
 *
 * 四视图共用一条时间条与一套指标条：资产负债看时点，收支 / 现金流 / 投资看期间。
 * PC 双列表格、移动卡片行；结构以 concept-design 的报表章节为准，视觉只用 design-tokens。
 *
 * 本文件只留期间状态、视图切换、数据请求编排与拼装；
 * 四张报表、下钻抽屉、设置抽屉与页面外壳各自独立成文件。
 */
import { useEffect, useMemo, useState } from 'react'
import { useLedger } from '@/features/overview/ledgerStore'
import { getCategoryRootId, ledgerAnchorDay } from '@/features/overview/model'
import { ErrorPanel, LoadingSkeleton } from '@/features/shared/StateViews'
import type { DataState, DeviceMode } from '@/features/shared/types'
import { useApiBalanceReport, useApiCashReport, useApiFlowReport, useApiInvestReport } from './apiReports'
import { deriveCashSankey } from './cashSankeyModel'
import { PageHead, ReportsEmpty } from './ReportPageChrome'
import { ReportSettingsSheet } from './ReportSettingsPanel'
import {
  cashGroupPresence,
  defaultReportSettings,
  loadReportSettings,
  saveReportSettings,
  type ReportViewSettings,
} from './reportSettings'
import {
  buildDrill,
  deriveBalanceReport,
  deriveCashReport,
  deriveFlowReport,
  deriveInvestmentReport,
  type DrillData,
  type FlowTreeNode,
} from './reportsModel'
import { clampAsOfPoint, monthStart, type ReportTab, type ReportTime } from './reportsTime'
import { TimeBar } from './TimeBar'
import { BalanceView } from './BalanceView'
import { FlowView } from './FlowView'
import { CashView } from './CashView'
import { InvestView } from './InvestView'
import { DrillDrawer } from './DrillDrawer'
import './reports.css'

interface ToastState {
  message: string
}

interface DrillState {
  node: FlowTreeNode
  kind: 'income' | 'expense'
}

function initialReportTime(anchor: string): ReportTime {
  return { gran: 'month', point: anchor, from: monthStart(anchor), to: anchor, preset: 'thisMonth' }
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

      <ReportSettingsSheet
        device={device}
        opened={settingsOpen}
        onClose={closeSettings}
        configTab={configTab}
        draftSettings={draftSettings}
        cashPresence={cashGroupPresence(cash ?? seedCash)}
        onOpenConfig={openConfig}
        onBack={closeConfig}
        onChange={setDraftSettings}
        onReset={resetConfig}
        onCommit={commitConfig}
      />

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
