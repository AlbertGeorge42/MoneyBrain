/**
 * HF 高保真预览壳（/design）
 *
 * 只承载本批次交付的「应用壳 + 总览页」。预览态可切换 PC / 移动、浅 / 深 / 跟随系统、
 * 正常 / 加载 / 空账本 / 错误；预览入口不接入生产路由，也不引用旧页面代码。
 */
import { useEffect, useMemo, useState } from 'react'
import '@mantine/core/styles.css'
import { MantineProvider } from '@mantine/core'
import { AppShell } from '@/features/shell/AppShell'
import { shellPageLabel, type ShellPage } from '@/features/shell/navigation'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { useLedger } from '@/features/overview/ledgerStore'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { QuickEntry } from '@/features/overview/QuickEntry'
import { TransactionDetail } from '@/features/overview/TransactionDetail'
import { TransactionsPage } from '@/features/transactions/TransactionsPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { BudgetPage } from '@/features/budgets/BudgetPage'
import type { LedgerTransaction } from '@/features/overview/model'
import { ColdStartGuide, ErrorPanel, LoadingSkeleton } from '@/features/shared/StateViews'
import type { DataState, DeviceMode, SchemeMode } from '@/features/shared/types'
import { hfTheme } from '@/styles/theme/hf-theme'
import './design.css'

type SchemeChoice = 'system' | SchemeMode

const DEVICES: readonly DeviceMode[] = ['desktop', 'mobile']
const SCHEMES: readonly SchemeChoice[] = ['system', 'light', 'dark']
const STATES: readonly DataState[] = ['normal', 'loading', 'empty', 'error']
const PAGES: readonly ShellPage[] = ['overview', 'transactions', 'reports', 'budgets', 'settings']

const DEVICE_LABELS: Record<DeviceMode, string> = { desktop: 'PC', mobile: '移动' }
const SCHEME_LABELS: Record<SchemeChoice, string> = { system: '系统', light: '浅色', dark: '深色' }
const STATE_LABELS: Record<DataState, string> = {
  normal: '正常',
  loading: '加载',
  empty: '空账本',
  error: '错误',
}

function readInitial<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === 'undefined') return fallback
  const value = new URLSearchParams(window.location.search).get(key) as T | null
  return value && allowed.includes(value) ? value : fallback
}

function useSystemScheme(): SchemeMode {
  const [system, setSystem] = useState<SchemeMode>(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
  )

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => setSystem(event.matches ? 'dark' : 'light')
    query.addEventListener('change', handleChange)
    return () => query.removeEventListener('change', handleChange)
  }, [])

  return system
}

function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string
  value: T
  options: readonly T[]
  labels: Record<T, string>
  onChange: (next: T) => void
}) {
  return (
    <div className="mb-hf-toolbar-group">
      <span className="mb-hf-toolbar-label">{label}</span>
      <div className="mb-hf-switch" role="group" aria-label={label}>
        {options.map((option) => {
          const active = option === value
          return (
            <button
              key={option}
              type="button"
              className={active ? 'mb-hf-choice is-active' : 'mb-hf-choice'}
              aria-pressed={active}
              onClick={() => onChange(option)}
            >
              {labels[option]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PreviewToolbar({
  device,
  scheme,
  dataState,
  onDevice,
  onScheme,
  onState,
}: {
  device: DeviceMode
  scheme: SchemeChoice
  dataState: DataState
  onDevice: (next: DeviceMode) => void
  onScheme: (next: SchemeChoice) => void
  onState: (next: DataState) => void
}) {
  return (
    <header className="mb-hf-toolbar">
      <div className="mb-hf-toolbar-brand">
        <span className="mb-hf-toolbar-mark" aria-hidden="true">
          MB
        </span>
        <span className="mb-hf-toolbar-copy">
          <span className="mb-hf-toolbar-name">MoneyBrain</span>
          <span className="mb-hf-toolbar-meta">HF 预览 · /design</span>
        </span>
      </div>
      <div className="mb-hf-toolbar-controls">
        <ChoiceGroup
          label="设备"
          value={device}
          options={DEVICES}
          labels={DEVICE_LABELS}
          onChange={onDevice}
        />
        <ChoiceGroup
          label="主题"
          value={scheme}
          options={SCHEMES}
          labels={SCHEME_LABELS}
          onChange={onScheme}
        />
        <ChoiceGroup
          label="状态"
          value={dataState}
          options={STATES}
          labels={STATE_LABELS}
          onChange={onState}
        />
      </div>
      <span className="mb-hf-toolbar-hint">旧前端未接入</span>
    </header>
  )
}

function PlaceholderPage({
  device,
  page,
  dataState,
  onRetry,
  onPrimary,
  onImport,
  onOverview,
}: {
  device: DeviceMode
  page: ShellPage
  dataState: DataState
  onRetry: () => void
  onPrimary: () => void
  onImport: () => void
  onOverview: () => void
}) {
  if (dataState === 'loading') return <LoadingSkeleton device={device} />
  if (dataState === 'error') return <ErrorPanel onRetry={onRetry} />
  if (dataState === 'empty') {
    return (
      <ColdStartGuide
        variant={page === 'transactions' ? 'transactions' : 'overview'}
        onPrimary={onPrimary}
        onImport={onImport}
      />
    )
  }

  return (
    <section className="mb-card mb-hf-placeholder">
      {device === 'desktop' && (
        <div className="mb-page-head">
          <h1 className="mb-page-title">{shellPageLabel(page)}</h1>
          <p className="mb-page-sub">本批次只交付应用壳与总览页</p>
        </div>
      )}
      <p className="mb-hf-placeholder-copy">
        {shellPageLabel(page)}的完整高保真会在后续批次接入；当前页面用于验证应用壳导航与状态切换，
        不包含旧页面实现。
      </p>
      <button type="button" className="mb-link-btn" onClick={onOverview}>
        回到总览
      </button>
    </section>
  )
}

function PreviewBody({
  device,
  dataState,
  page,
  onPage,
  onState,
}: {
  device: DeviceMode
  dataState: DataState
  page: ShellPage
  onPage: (next: ShellPage) => void
  onState: (next: DataState) => void
}) {
  const { ledger } = useLedger()
  const [entryOpen, setEntryOpen] = useState(false)
  const [detail, setDetail] = useState<LedgerTransaction | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [batchMode, setBatchMode] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [reportSettingsOpen, setReportSettingsOpen] = useState(false)
  const [budgetEditorOpen, setBudgetEditorOpen] = useState(false)

  useEffect(() => {
    setBatchMode(false)
    setDisplayOpen(false)
    setReportSettingsOpen(false)
    setBudgetEditorOpen(false)
  }, [page])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2400)
    return () => window.clearTimeout(timer)
  }, [toast])

  const notify = (message: string) => setToast(message)
  const createAccount = () => notify('创建账户将在设置批次开放，本次只验证冷启动引导。')
  const importLedger = () => notify('导入账单将在流水批次开放，本次只验证冷启动引导。')
  const retry = () => {
    onState('normal')
    notify('已重新连接本地数据库，数据已恢复。')
  }

  const content =
    page === 'overview' ? (
      <OverviewPage
        device={device}
        dataState={dataState}
        onOpenDetail={setDetail}
        onOpenTransactions={() => onPage('transactions')}
        onOpenBudgets={() => onPage('budgets')}
        onOpenAccounts={() => onPage('settings')}
        onRetry={retry}
        onCreateAccount={createAccount}
        onImport={importLedger}
      />
    ) : page === 'transactions' ? (
      <TransactionsPage
        device={device}
        dataState={dataState}
        batchMode={batchMode}
        onBatchModeChange={setBatchMode}
        displayOpen={displayOpen}
        onDisplayToggle={() => setDisplayOpen((open) => !open)}
        onRetry={retry}
        onCreateAccount={createAccount}
        onImport={importLedger}
      />
    ) : page === 'reports' ? (
      <ReportsPage
        device={device}
        dataState={dataState}
        settingsOpen={reportSettingsOpen}
        onSettingsToggle={() => setReportSettingsOpen((open) => !open)}
        onRetry={retry}
        onImport={importLedger}
        onViewFlow={() => onPage('transactions')}
      />
    ) : page === 'budgets' ? (
      <BudgetPage
        device={device}
        dataState={dataState}
        editorOpen={budgetEditorOpen}
        onEditorOpenChange={setBudgetEditorOpen}
        onRetry={retry}
        onViewFlow={() => onPage('transactions')}
        notify={notify}
      />
    ) : page === 'settings' ? (
      <SettingsPage
        device={device}
        dataState={dataState}
        onRetry={retry}
        onImport={importLedger}
      />
    ) : (
      <PlaceholderPage
        device={device}
        page={page}
        dataState={dataState}
        onRetry={retry}
        onPrimary={createAccount}
        onImport={importLedger}
        onOverview={() => onPage('overview')}
      />
    )

  const shell = (
    <AppShell
      device={device}
      page={page}
      dataState={dataState}
      hideFab={page === 'transactions' && batchMode}
      headAction={
        page === 'transactions' ? (
          <button
            type="button"
            className="mb-tx-head-action"
            aria-expanded={displayOpen}
            onClick={() => setDisplayOpen((open) => !open)}
          >
            显示
          </button>
        ) : page === 'budgets' ? (
          <button type="button" className="mb-bg-head-action" onClick={() => setBudgetEditorOpen(true)}>
            新增
          </button>
        ) : page === 'reports' ? (
          <button
            type="button"
            className="mb-rp-head-action"
            aria-expanded={reportSettingsOpen}
            onClick={() => setReportSettingsOpen((open) => !open)}
          >
            设置
          </button>
        ) : undefined
      }
      onNavigate={onPage}
      onOpenEntry={() => setEntryOpen(true)}
    >
      {content}
    </AppShell>
  )

  const overlays = (
    <>
      <QuickEntry
        opened={entryOpen}
        device={device}
        onClose={() => setEntryOpen(false)}
        onReopen={() => setEntryOpen(true)}
        onSaved={() => notify('已保存 · 账本与总览数字已同步')}
      />
      <TransactionDetail
        transaction={detail}
        ledger={ledger}
        device={device}
        onClose={() => setDetail(null)}
      />
    </>
  )

  const toastNode = toast ? (
    <div className="mb-hf-toast" role="status">
      {toast}
    </div>
  ) : null

  if (device === 'mobile') {
    return (
      <div className="mb-hf-phone">
        <div className="mb-hf-phone-screen">
          {shell}
          {overlays}
          {toastNode}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-hf-desktop">
      {shell}
      {overlays}
      {toastNode}
    </div>
  )
}

export default function DesignApp() {
  const [device, setDevice] = useState<DeviceMode>(() =>
    readInitial('device', DEVICES, 'desktop'),
  )
  const [scheme, setScheme] = useState<SchemeChoice>(() =>
    readInitial('scheme', SCHEMES, 'system'),
  )
  const [dataState, setDataState] = useState<DataState>(() =>
    readInitial('state', STATES, 'normal'),
  )
  const [page, setPage] = useState<ShellPage>(() => {
    const raw = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('page')
    return raw === 'budget' ? 'budgets' : readInitial('page', PAGES, 'overview')
  })
  const systemScheme = useSystemScheme()
  const resolvedScheme: SchemeMode = scheme === 'system' ? systemScheme : scheme

  const canvasClass = useMemo(
    () => (device === 'mobile' ? 'mb-hf-canvas is-mobile' : 'mb-hf-canvas'),
    [device],
  )

  return (
    <MantineProvider theme={hfTheme} forceColorScheme={resolvedScheme}>
      <div className="mb-hf-root" data-hf-scheme={resolvedScheme}>
        <PreviewToolbar
          device={device}
          scheme={scheme}
          dataState={dataState}
          onDevice={setDevice}
          onScheme={setScheme}
          onState={setDataState}
        />
        <div className={canvasClass}>
          <LedgerProvider>
            <PreviewBody
              device={device}
              dataState={dataState}
              page={page}
              onPage={setPage}
              onState={setDataState}
            />
          </LedgerProvider>
        </div>
      </div>
    </MantineProvider>
  )
}
