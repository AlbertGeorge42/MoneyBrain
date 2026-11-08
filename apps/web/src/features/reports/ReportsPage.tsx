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
import { deriveExpenseCharts, getCategoryRootId, ledgerAnchorDay } from '@/features/overview/model'
import { ErrorPanel, LoadingSkeleton } from '@/features/shared/StateViews'
import { Card } from '@/features/shared/Card'
import { ControlRow } from '@/features/shared/skeleton/ControlRow'
import { PageShell } from '@/features/shared/skeleton/PageShell'
import { ToastViewport } from '@/features/shared/toast'
import { useToast, type ToastOptions } from '@/features/shared/toastContext'
import type { DataState, DeviceMode } from '@/features/shared/types'
import { LedgerConfigManager, type LedgerConfigTab } from '@/features/ledger-config/LedgerConfigManager'
import { useLedgerConfigController } from '@/features/ledger-config/useLedgerConfigController'
import { INVESTMENT_TYPES } from '@/features/settings/settingsModel'
import {
  useApiAssetProjection,
  useApiBalanceReport,
  useApiCashProjection,
  useApiCashReport,
  useApiFlowReport,
  useApiIncomeExpenseProjection,
  useApiInvestReport,
} from './apiReports'
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
import {
  RANGE_STATE_LABEL,
  bucketStartOf,
  clampAsOfPoint,
  formatPointLabel,
  formatRangeLabel,
  monthStart,
  pointRangeState,
  presetRange,
  rangeState,
  type ReportTab,
  type ReportTime,
} from './reportsTime'
import { periodWindow, pointWindow } from './futureModel'
import { TimeBar } from './TimeBar'
import { BalanceView } from './BalanceView'
import { FlowView } from './FlowView'
import { CashView } from './CashView'
import { InvestView } from './InvestView'
import { DrillDrawer } from './DrillDrawer'
import './reports.css'

interface DrillState {
  node: FlowTreeNode
  kind: 'income' | 'expense'
}

function initialReportTime(anchor: string): ReportTime {
  return { gran: 'month', point: anchor, from: monthStart(anchor), to: anchor, preset: 'thisMonth' }
}

/** 预算页「查看未来报表」入口：落到未来 3 个月的收支预算计划。 */
function initialFutureReportTime(anchor: string): ReportTime {
  const range = presetRange('next3m', 'month', anchor)
  return { gran: 'month', point: anchor, ...range, preset: 'next3m' }
}

export function ReportsPage({
  device,
  dataState,
  settingsOpen,
  onSettingsToggle,
  onRetry,
  onImport,
  onViewFlow,
  initialFuture = false,
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
  /** 从预算页跳转：初始落在未来区间的收支视图。 */
  initialFuture?: boolean
}) {
  const { ledger } = useLedger()
  const { notify: pushToast } = useToast()
  const [tab, setTab] = useState<ReportTab>(() => (initialFuture ? 'flow' : 'balance'))
  // API 模式用真实今天 / 最新流水做锚点；用户改过时间后不再跟随账本刷新。
  const apiMode = Boolean(ledger.snapshot)
  const anchor = ledgerAnchorDay(ledger)
  const [timeOverride, setTimeOverride] = useState<ReportTime | null>(() =>
    initialFuture ? initialFutureReportTime(anchor) : null,
  )
  const time = timeOverride ?? initialReportTime(anchor)
  const setTime = (next: ReportTime) => setTimeOverride(next)
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
  // 账本数据管理：与设置页同一份 controller / 表单，保存立即生效。
  const [ledgerConfigOpen, setLedgerConfigOpen] = useState(false)
  const [ledgerConfigTab, setLedgerConfigTab] = useState<LedgerConfigTab>('accounts')
  const effectiveSettings = draftSettings ?? viewSettings

  // 已发生区间仍按数据截止日截断；混合 / 全未来时点交给推演端点，按当前粒度出桶。
  const balanceState = pointRangeState(time.point, anchor, time.gran)
  const balancePoint = balanceState === 'past' ? clampAsOfPoint(time.point, anchor) : time.point
  const assetWindow = pointWindow(balancePoint, anchor, time.gran)
  const cashState = rangeState(time.from, time.to, anchor)
  const flowState = rangeState(time.from, time.to, anchor)
  const investState = rangeState(time.from, time.to, anchor)
  const cashWindow = periodWindow(time.from, time.to, anchor, time.gran)
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
  // 支出用与总览相同的近 12 个月分类全集；收入用收入一级分类全集。
  const categoryUniverse = useMemo(
    () => ({
      income: ledger.categories
        .filter((category) => !category.parentId && category.type === 'income')
        .map((category) => category.name.trim()),
      expense: deriveExpenseCharts(ledger).categories.map((slice) => slice.name.trim()),
    }),
    [ledger],
  )

  // API 模式：合计口径全部来自后端报表端点，查询自身也有加载 / 失败态。
  const apiReady = apiMode && dataState === 'normal'
  const balanceApi = useApiBalanceReport(
    balancePoint,
    ledger,
    apiReady && tab === 'balance' && balanceState === 'past',
  )
  const flowApi = useApiFlowReport(time.from, time.to, time.gran, ledger, includeExcluded, apiReady && tab === 'flow')
  const cashApi = useApiCashReport(
    time.from,
    time.to,
    ledger,
    apiReady && tab === 'cash' && cashState === 'past',
  )
  const investApi = useApiInvestReport(time.from, time.to, apiReady && tab === 'invest' && investState === 'past')
  const assetProjectionApi = useApiAssetProjection(
    assetWindow,
    ledger,
    apiReady && tab === 'balance' && balanceState !== 'past',
  )
  const cashProjectionApi = useApiCashProjection(
    cashWindow,
    apiReady && tab === 'cash' && cashState !== 'past',
  )
  // 收支未来明细：与现金流投影共用同一套窗口，三来源由后端合成。
  const flowProjectionApi = useApiIncomeExpenseProjection(
    cashWindow,
    ledger,
    includeExcluded,
    apiReady && tab === 'flow' && flowState !== 'past',
  )

  // 当前 tab 对应的报表查询：账本写成功后重取这一份，而不是整页刷新。
  const activeReportApi =
    tab === 'balance'
      ? balanceState === 'past'
        ? balanceApi
        : assetProjectionApi
      : tab === 'flow'
        ? flowState === 'past'
          ? flowApi
          : flowProjectionApi
        : tab === 'cash'
          ? cashState === 'past'
            ? cashApi
            : cashProjectionApi
          : investApi

  const ledgerConfig = useLedgerConfigController({
    notify: (message: string, options?: ToastOptions) => {
      pushToast(message, { variant: 'reports', ...options })
    },
    // 报表页不提供投资目标 / 现金流活动入口，这两个分支不会触发。
    onSaveInvest: () => {},
    onMoveActivity: () => {},
    onAfterWrite: () => {
      // 账户 / 分类变了，旧下钻与折叠键可能指向已删除或已换组的对象。
      setDrill(null)
      setFoldedFlow({})
      setFoldedCash({})
      if (apiReady) void activeReportApi.refetch()
    },
  })

  const closeLedgerConfig = () => {
    ledgerConfig.resetTransient()
    setLedgerConfigOpen(false)
  }

  const balance = apiMode ? balanceApi.data : seedBalance
  const flow = apiMode ? flowApi.data : seedFlow
  const cash = apiMode
    ? cashState === 'past'
      ? cashApi.data
      : cashProjectionApi.data
    : seedCash
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
    setDrill(null)
    setFoldedFlow({})
    setFoldedCash({})
  }, [tab, time.from, time.to, time.point])

  const notify = (message: string) => pushToast(message, { variant: 'reports' })
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

  // 投资视图的空状态入口：保留当前粒度，把期间收回到当前桶内、截至今天。
  const backToActual = () =>
    setTime({
      ...time,
      point: anchor,
      from: bucketStartOf(anchor, time.gran),
      to: anchor,
      preset: null,
    })

  const activeApi =
    tab === 'balance'
      ? balanceState !== 'past'
        ? assetProjectionApi
        : balanceApi
      : tab === 'flow'
        ? flowState !== 'past'
          ? flowProjectionApi
          : flowApi
        : tab === 'cash'
          ? cashState !== 'past'
            ? cashProjectionApi
            : cashApi
          : investApi
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

  // 页头摘要：区间 + 相对今天的状态，与时间条同一套文案与判定，避免两处口径分叉。
  const headSub =
    tab === 'balance'
      ? `${formatPointLabel(time.point, time.gran, anchor)} · ${
          RANGE_STATE_LABEL[pointRangeState(time.point, anchor, time.gran)]
        }`
      : `${formatRangeLabel(time)} · ${RANGE_STATE_LABEL[rangeState(time.from, time.to, anchor)]}`

  const content = (
    <PageShell
      head={
        <PageHead
          device={device}
          tab={tab}
          sub={headSub}
          onTab={(next) => setTab(next)}
          onOpenSettings={onSettingsToggle}
        />
      }
    >
      {pageState ?? (
        <>
          <ControlRow>
            <TimeBar
              device={device}
              tab={tab}
              time={time}
              today={anchor}
              onChange={setTime}
              onToast={notify}
            />
          </ControlRow>
          {tab === 'balance' && balanceState === 'past' && balance && (
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
          {tab === 'balance' && balanceState !== 'past' && (
            apiMode && assetProjectionApi.data ? (
              <BalanceView
                device={device}
                report={assetProjectionApi.data}
                settings={effectiveSettings.balance}
                categories={ledger.accountCategories}
                side={balanceSide}
                onSide={setBalanceSide}
                from={time.from}
                to={time.to}
                onViewFlow={onViewFlow}
                trendDesc="预测窗口逐点"
              />
            ) : (
              <Card variant="report" className="mb-rp-empty">
                <h2 className="mb-rp-empty-title">未来推演需要连接后端账本</h2>
                <p className="mb-rp-empty-desc">
                  当前为本地演示数据；连接 API 后可按月查看净资产、预算计划与已排定交易构成。
                </p>
              </Card>
            )
          )}
          {tab === 'flow' && flowState === 'past' && flow && (
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
              colorUniverse={categoryUniverse}
            />
          )}
          {tab === 'flow' && flowState !== 'past' && (
            apiMode && flowProjectionApi.data ? (
              <FlowView
                device={device}
                report={flowProjectionApi.data}
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
                colorUniverse={categoryUniverse}
              />
            ) : (
              <Card variant="report" className="mb-rp-empty">
                <h2 className="mb-rp-empty-title">未来收支明细需要连接后端账本</h2>
                <p className="mb-rp-empty-desc">
                  当前为本地演示数据；连接 API 后可查看已发生、按预算计划与已排定的分类明细。
                </p>
              </Card>
            )
          )}
          {tab === 'cash' && cashState === 'past' && cash && (
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
          {tab === 'cash' && cashState !== 'past' && (
            apiMode && cash ? (
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
            ) : (
              <Card variant="report" className="mb-rp-empty">
                <h2 className="mb-rp-empty-title">未来推演需要连接后端账本</h2>
                <p className="mb-rp-empty-desc">
                  当前为本地演示数据；连接 API 后可查看未来现金流的逐桶流入、流出与期末现金。
                </p>
              </Card>
            )
          )}
          {tab === 'invest' && investState === 'past' && invest && (
            <InvestView device={device} report={invest} settings={effectiveSettings.invest} />
          )}
          {tab === 'invest' && investState === 'past' && apiMode && investApi.status === 'success' && investApi.data === null && (
            <Card variant="report" className="mb-rp-empty">
              <h2 className="mb-rp-empty-title">暂无投资账户</h2>
              <p className="mb-rp-empty-desc">
                投资分析只统计标记为「投资资产」的账户；当前账本没有可分析的投资持仓。
              </p>
            </Card>
          )}
          {tab === 'invest' && investState !== 'past' && (
            <Card variant="report" className="mb-rp-empty">
              <h2 className="mb-rp-empty-title">该视图暂无未来数据源</h2>
              <p className="mb-rp-empty-desc">
                投资分析只覆盖已发生的持仓与收益；未来区间不提供推演数据。
                时间条仍可继续切换，改回已发生区间即可查看。
              </p>
              <button className="mb-rp-btn is-ghost" onClick={backToActual}>
                回到已发生
              </button>
            </Card>
          )}
        </>
      )}
    </PageShell>
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
        onOpenLedger={(next) => {
          setLedgerConfigTab(next)
          setLedgerConfigOpen(true)
        }}
        onBack={closeConfig}
        onChange={setDraftSettings}
        onReset={resetConfig}
        onCommit={commitConfig}
      />

      <LedgerConfigManager
        opened={ledgerConfigOpen}
        tab={ledgerConfigTab}
        onTabChange={setLedgerConfigTab}
        onClose={closeLedgerConfig}
        device={device}
        ledger={ledger}
        controller={ledgerConfig}
        investRows={INVESTMENT_TYPES}
        onRetry={onRetry}
      />

      <ToastViewport
        variant="reports"
        className={
          (settingsOpen || ledgerConfigOpen) && device === 'mobile' ? 'is-over-sheet' : undefined
        }
      />
    </div>
  )
}
