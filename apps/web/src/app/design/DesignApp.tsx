/**
 * HF 高保真预览壳（/design）
 *
 * 只承载本批次交付的「应用壳 + 总览页」。预览态可切换 PC / 移动、浅 / 深 / 跟随系统、
 * 正常 / 加载 / 空账本 / 错误；预览入口不接入生产路由，也不引用旧页面代码。
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useMantineColorScheme } from '@mantine/core'
import { useToast } from '@/features/shared/toastContext'
import { AppShell } from '@/features/shell/AppShell'
import type { ShellPage } from '@/features/shell/navigation'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { useLedger } from '@/features/overview/ledgerStore'
import { EMPTY_LEDGER } from '@/features/overview/apiLedger'
import { useApiLedger } from '@/features/overview/useApiLedger'
import { OverviewPage } from '@/features/overview/OverviewPage'
import { QuickEntry } from '@/features/overview/QuickEntry'
import { TransactionDetail } from '@/features/overview/TransactionDetail'
import { TransactionsPage } from '@/features/transactions/TransactionsPage'
import { EMPTY_ADVANCED, writeFiltersToSearch } from '@/features/transactions/filters'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { HfHeadAction } from '@/features/shared/HfHeadAction'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { BudgetPage } from '@/features/budgets/BudgetPage'
import type { LedgerTransaction } from '@/features/overview/model'
import type { DataState, DeviceMode, SchemeMode } from '@/features/shared/types'
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
  onRetry,
  framed,
}: {
  device: DeviceMode
  dataState: DataState
  page: ShellPage
  onPage: (next: ShellPage) => void
  onState: (next: DataState) => void
  onRetry: () => void
  /** 预览壳用 390×844 手机框；生产入口直接铺满视口。 */
  framed: boolean
}) {
  const { ledger, undo } = useLedger()
  const { notify: pushToast } = useToast()
  const [entryOpen, setEntryOpen] = useState(false)
  const [detail, setDetail] = useState<LedgerTransaction | null>(null)
  const [batchMode, setBatchMode] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [budgetEditorOpen, setBudgetEditorOpen] = useState(false)
  // 预算页「查看未来报表」的一次性入口；普通导航进报表时清掉，避免残留。
  const [reportInitialFuture, setReportInitialFuture] = useState(false)
  const navigate = (next: ShellPage) => {
    if (next === 'reports') setReportInitialFuture(false)
    onPage(next)
  }

  useEffect(() => {
    setBatchMode(false)
    setDisplayOpen(false)
    setBudgetEditorOpen(false)
  }, [page])

  // 时长由是否带撤销动作决定：带动作 6 秒可撤销，普通提示 2.4 秒。
  const notify = (message: string, action?: () => void) =>
    pushToast(message, {
      action: action ? { label: '撤销', run: action } : undefined,
    })

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
    onRetry()
    notify('正在重新读取真实账本…')
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
        onRecord={() => setEntryOpen(true)}
        onImport={importLedger}
        onOpenReports={() => onPage('reports')}
        onDrillCategory={viewFlow}
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
        onRecord={() => setEntryOpen(true)}
        onImport={importLedger}
        onOpenReports={() => onPage('reports')}
      />
    ) : page === 'reports' ? (
      <ReportsPage
        device={device}
        dataState={dataState}
        onRetry={retry}
        onImport={importLedger}
        onViewFlow={viewFlow}
        initialFuture={reportInitialFuture}
      />
    ) : page === 'budgets' ? (
      <BudgetPage
        device={device}
        dataState={dataState}
        editorOpen={budgetEditorOpen}
        onEditorOpenChange={setBudgetEditorOpen}
        onRetry={retry}
        onViewFlow={() => onPage('transactions')}
        onViewFutureReports={() => {
          setReportInitialFuture(true)
          onPage('reports')
        }}
        notify={notify}
      />
    ) : page === 'settings' ? (
      <SettingsPage
        device={device}
        dataState={dataState}
        onRetry={retry}
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
          <HfHeadAction
            ariaExpanded={displayOpen}
            onClick={() => setDisplayOpen((open) => !open)}
          >
            显示
          </HfHeadAction>
        ) : page === 'budgets' ? (
          <HfHeadAction onClick={() => setBudgetEditorOpen(true)}>新增</HfHeadAction>
        ) : undefined
      }
      onNavigate={navigate}
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
          notify(
            '已保存 · 账本与总览数字已同步',
            undoToken
              ? () => {
                  void undo(undoToken).then((result) =>
                    notify(result.ok ? '已撤销保存' : `撤销失败：${result.error ?? '请重试'}`),
                  )
                }
              : undefined,
          )
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

  if (device === 'mobile') {
    if (!framed) {
      return (
        <div className="mb-hf-live-mobile">
          {shell}
          {overlays}
        </div>
      )
    }
    return (
      <div className="mb-hf-phone">
        <div className="mb-hf-phone-screen">
          {shell}
          {overlays}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-hf-desktop">
      {shell}
      {overlays}
    </div>
  )
}

export default function DesignApp({ preview = true }: { preview?: boolean }) {
  const [device, setDevice] = useState<DeviceMode>(() =>
    readInitial('device', DEVICES, 'desktop'),
  )
  const viewportDevice = useViewportDevice(!preview)
  const activeDevice = preview ? device : viewportDevice
  // 主题唯一来源是 Mantine 的 colorScheme：预览工具栏三档与设置页操控同一个值，
  // 'system' 在 Mantine 里对应 'auto'。
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const scheme: SchemeChoice = colorScheme === 'auto' ? 'system' : colorScheme
  const applyScheme = useCallback(
    (next: SchemeChoice) => setColorScheme(next === 'system' ? 'auto' : next),
    [setColorScheme],
  )
  const schemeParam = useMemo(() => {
    const raw = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('scheme')
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : null
  }, [])
  const schemeParamApplied = useRef(false)
  useEffect(() => {
    if (schemeParamApplied.current) return
    schemeParamApplied.current = true
    if (schemeParam) applyScheme(schemeParam)
  }, [schemeParam, applyScheme])
  const [dataState, setDataState] = useState<DataState>(() =>
    readInitial('state', STATES, 'normal'),
  )
  const [page, setPage] = useState<ShellPage>(() => {
    const raw = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('page')
    return raw === 'budget' ? 'budgets' : readInitial('page', PAGES, 'overview')
  })

  const api = useApiLedger()
  const queryClient = useQueryClient()
  // 写操作成功后统一刷新真实数据：总览、流水列表、回收站、报表/预算。
  const refreshRemote = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['hf', 'overview', 'ledger'] }),
      queryClient.invalidateQueries({ queryKey: ['hf', 'transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['hf', 'recycle-bin'] }),
      queryClient.invalidateQueries({ queryKey: ['hf', 'report'] }),
    ])
  }, [queryClient])

  // 「正常」档跟随真实请求状态；其余档仍是预览用的显式状态。
  const effectiveState: DataState =
    dataState === 'normal'
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
    <div className="mb-hf-root">
      {preview && (
        <PreviewToolbar
          device={device}
          scheme={scheme}
          dataState={dataState}
          onDevice={setDevice}
          onScheme={applyScheme}
          onState={setDataState}
        />
      )}
      <div className={canvasClass}>
        <LedgerProvider
          initialLedger={api.ledger ?? EMPTY_LEDGER}
          onRemoteChange={refreshRemote}
        >
          <PreviewBody
            device={activeDevice}
            dataState={effectiveState}
            page={page}
            onPage={setPage}
            onState={setDataState}
            onRetry={api.refetch}
            framed={preview}
          />
        </LedgerProvider>
      </div>
    </div>
  )
}
