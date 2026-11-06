/**
 * HF 高保真预览壳（/design）
 *
 * 只承载本批次交付的「应用壳 + 总览页」。预览态可切换 PC / 移动、浅 / 深 / 跟随系统、
 * 正常 / 加载 / 空账本 / 错误；预览入口不接入生产路由，也不引用旧页面代码。
 */
import { useEffect, useMemo, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { getPortalHost } from '@/features/shared/portalHost'
import '@mantine/core/styles.css'
import { MantineProvider } from '@mantine/core'
import { AppShell } from '@/features/shell/AppShell'
import type { ShellPage } from '@/features/shell/navigation'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { useLedger } from '@/features/overview/ledgerStore'
import { EMPTY_LEDGER } from '@/features/overview/apiLedger'
import { readHfDataMode, useApiLedger } from '@/features/overview/useApiLedger'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { QuickEntry } from '@/features/overview/QuickEntry'
import { TransactionDetail } from '@/features/overview/TransactionDetail'
import { TransactionsPage } from '@/features/transactions/TransactionsPage'
import { EMPTY_ADVANCED, writeFiltersToSearch } from '@/features/transactions/filters'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { BudgetPage } from '@/features/budgets/BudgetPage'
import type { LedgerTransaction } from '@/features/overview/model'
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

/** 生产入口（非预览）按视口宽度切设备档；预览壳仍用工具栏手动切。 */
function useViewportDevice(enabled: boolean): DeviceMode {
  const query = '(max-width: 767px)'
  const [device, setDevice] = useState<DeviceMode>(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches ? 'mobile' : 'desktop',
  )

  useEffect(() => {
    if (!enabled) return
    const media = window.matchMedia(query)
    const handleChange = (event: MediaQueryListEvent) =>
      setDevice(event.matches ? 'mobile' : 'desktop')
    setDevice(media.matches ? 'mobile' : 'desktop')
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [enabled])

  return device
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
    </header>
  )
}

function PreviewBody({
  device,
  dataState,
  page,
  onPage,
  onState,
  apiMode,
  onRetry,
  framed,
}: {
  device: DeviceMode
  dataState: DataState
  page: ShellPage
  onPage: (next: ShellPage) => void
  onState: (next: DataState) => void
  apiMode: boolean
  onRetry: () => void
  /** 预览壳用 390×844 手机框；生产入口直接铺满视口。 */
  framed: boolean
}) {
  const { ledger, undo } = useLedger()
  const [entryOpen, setEntryOpen] = useState(false)
  const [detail, setDetail] = useState<LedgerTransaction | null>(null)
  const [toast, setToast] = useState<{
    message: string
    duration: number
    action?: { label: string; run: () => void }
  } | null>(null)
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
    const timer = window.setTimeout(() => setToast(null), toast.duration)
    return () => window.clearTimeout(timer)
  }, [toast])

  const notify = (message: string) => setToast({ message, duration: 2400 })

  // 报表下钻 → 流水：把分类与期间写进 URL，流水页挂载时还原并回到列表顶部。
  const viewFlow = (options: {
    categoryId?: string
    categoryIds?: string[]
    accountId?: string
    from: string
    to: string
  }) => {
    const search = writeFiltersToSearch(window.location.search, {
      query: '',
      type: 'all',
      advanced: {
        ...EMPTY_ADVANCED,
        categoryId: options.categoryId ?? '',
        categoryIds: options.categoryIds ?? [],
        accountId: options.accountId ?? '',
        dateFrom: options.from,
        dateTo: options.to,
      },
    })
    const params = new URLSearchParams(search)
    // 预览壳的 page 也写进 URL：刷新 / 回退时仍落在带条件的流水页，而不是报表。
    params.set('page', 'transactions')
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}?${params.toString()}`,
    )
    onPage('transactions')
  }
  const createAccount = () => notify('创建账户将在设置批次开放，本次只验证冷启动引导。')
  const importLedger = () => notify('导入账单将在流水批次开放，本次只验证冷启动引导。')
  const retry = () => {
    onState('normal')
    if (apiMode) {
      onRetry()
      notify('正在重新读取真实账本…')
      return
    }
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
        onViewFlow={viewFlow}
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
    ) : null

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
        onCreateAccount={() => {
          setEntryOpen(false)
          onPage('settings')
          notify('请在「设置 → 账户」中新增账户后再记账')
        }}
        onSaved={(_transactionId, undoToken) => {
          setToast({
            message: '已保存 · 账本与总览数字已同步',
            duration: 6000,
            action: undoToken
              ? {
                  label: '撤销',
                  run: () => {
                    void undo(undoToken).then((result) =>
                      notify(result.ok ? '已撤销保存' : `撤销失败：${result.error ?? '请重试'}`),
                    )
                  },
                }
              : undefined,
          })
        }}
      />
      <TransactionDetail
        transaction={detail}
        ledger={ledger}
        device={device}
        onClose={() => setDetail(null)}
        onOpenTransaction={setDetail}
      />
    </>
  )

  const toastNode = toast ? (
    <div className="mb-hf-toast" role="status">
      <span>{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="mb-hf-toast-action"
          onClick={() => {
            toast.action?.run()
            setToast(null)
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  ) : null

  // 预览画布与手机框都带 transform，会成为 fixed 的包含块；toast 挂到带 token 的
  // body 级宿主，才能在任何祖先滚动后仍固定在视口同一位置。
  const toastPortal =
    toastNode && typeof document !== 'undefined'
      ? createPortal(toastNode, getPortalHost())
      : toastNode

  if (device === 'mobile') {
    if (!framed) {
      return (
        <div className="mb-hf-live-mobile">
          {shell}
          {overlays}
          {toastPortal}
        </div>
      )
    }
    return (
      <div className="mb-hf-phone">
        <div className="mb-hf-phone-screen">
          {shell}
          {overlays}
        </div>
        {toastPortal}
      </div>
    )
  }

  return (
    <div className="mb-hf-desktop">
      {shell}
      {overlays}
      {toastPortal}
    </div>
  )
}

export default function DesignApp({ preview = true }: { preview?: boolean }) {
  const [device, setDevice] = useState<DeviceMode>(() =>
    readInitial('device', DEVICES, 'desktop'),
  )
  const viewportDevice = useViewportDevice(!preview)
  const activeDevice = preview ? device : viewportDevice
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

  // 数据源开关：默认 seed；VITE_HF_DATA=api 时读真实账本（只读）。
  const dataMode = readHfDataMode()
  const apiMode = dataMode === 'api'
  const api = useApiLedger(apiMode)
  const queryClient = useQueryClient()
  // 写操作成功后统一刷新真实数据：总览、流水列表、回收站、报表/预算。
  const refreshRemote = useCallback(async () => {
    if (!apiMode) return
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['hf', 'overview', 'ledger'] }),
      queryClient.invalidateQueries({ queryKey: ['hf', 'transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['hf', 'recycle-bin'] }),
      queryClient.invalidateQueries({ queryKey: ['hf', 'reports'] }),
      queryClient.invalidateQueries({ queryKey: ['hf', 'budgets'] }),
    ])
  }, [apiMode, queryClient])

  // 「正常」档在 API 模式下跟随真实请求状态；其余档仍是预览用的显式状态。
  const effectiveState: DataState =
    apiMode && dataState === 'normal'
      ? api.status === 'loading'
        ? 'loading'
        : api.status === 'error'
          ? 'error'
          : api.isEmpty
            ? 'empty'
            : 'normal'
      : dataState

  const canvasClass = useMemo(() => {
    if (!preview) {
      return activeDevice === 'mobile' ? 'mb-hf-canvas is-live-mobile' : 'mb-hf-canvas'
    }
    return activeDevice === 'mobile' ? 'mb-hf-canvas is-mobile' : 'mb-hf-canvas'
  }, [preview, activeDevice])

  return (
    <MantineProvider theme={hfTheme} forceColorScheme={resolvedScheme}>
      <div className="mb-hf-root" data-hf-scheme={resolvedScheme}>
        {preview && (
          <PreviewToolbar
            device={device}
            scheme={scheme}
            dataState={dataState}
            onDevice={setDevice}
            onScheme={setScheme}
            onState={setDataState}
          />
        )}
        <div className={canvasClass}>
          <LedgerProvider
            initialLedger={apiMode ? api.ledger ?? EMPTY_LEDGER : undefined}
            dataMode={dataMode}
            onRemoteChange={refreshRemote}
          >
            <PreviewBody
              device={activeDevice}
              dataState={effectiveState}
              page={page}
              onPage={setPage}
              onState={setDataState}
              apiMode={apiMode}
              onRetry={api.refetch}
              framed={preview}
            />
          </LedgerProvider>
        </div>
      </div>
    </MantineProvider>
  )
}
