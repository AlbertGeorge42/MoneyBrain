import { BatteryMedium, Plus, Search, Settings, Wifi } from 'lucide-react'
import type { ReactNode } from 'react'
import { minor } from '@domain/index'
import { formatCurrency } from '@/utils/format'
import { useLedger } from '@/features/overview/ledgerStore'
import { deriveOverview } from '@/features/overview/model'
import type { DataState, DeviceMode } from '@/features/shared/types'
import { SHELL_NAV, shellPageLabel, type ShellPage } from './navigation'
import './shell.css'

interface AppShellProps {
  device: DeviceMode
  page: ShellPage
  dataState?: DataState
  hideFab?: boolean
  headAction?: ReactNode
  onNavigate: (page: ShellPage) => void
  onOpenEntry: () => void
  children: ReactNode
}

function MonthSummary({ state, compact = false }: { state: DataState; compact?: boolean }) {
  const { ledger } = useLedger()
  const summary = deriveOverview(ledger)
  const positive = summary.balance >= 0
  const stateText = state === 'empty' ? '从第一笔开始' : state === 'loading' ? '正在读取' : '暂不可用'

  return (
    <div className={compact ? 'mb-side-foot is-compact' : 'mb-side-foot'}>
      <div className="mb-side-foot-label">本月收支</div>
      {state === 'normal' ? (
        <>
          <div className={positive ? 'mb-side-foot-value is-positive' : 'mb-side-foot-value is-negative'}>
            {formatCurrency(minor(summary.balance), { showSign: true })}
          </div>
          <div className="mb-side-foot-meta">
            <span className={positive ? 'mb-dot is-positive' : 'mb-dot is-negative'} />
            连续记录 12 天
          </div>
        </>
      ) : (
        <>
          <div className="mb-side-foot-value is-muted">—</div>
          <div className="mb-side-foot-meta">{stateText}</div>
        </>
      )}
    </div>
  )
}

function DesktopShell({
  page,
  dataState = 'normal',
  onNavigate,
  onOpenEntry,
  children,
}: Omit<AppShellProps, 'device'>) {
  return (
    <div className="mb-desktop-shell">
      <aside className="mb-sidebar" aria-label="主导航">
        <div className="mb-brand">
          <span className="mb-brand-mark" aria-hidden="true">MB</span>
          <span className="mb-brand-copy">
            <span className="mb-brand-name">MoneyBrain</span>
            <span className="mb-brand-tag">账本 · 本地优先</span>
          </span>
        </div>
        <nav className="mb-side-nav">
          {SHELL_NAV.map((item) => {
            const Icon = item.icon
            const active = item.id === page
            return (
              <button
                key={item.id}
                type="button"
                className={active ? 'mb-side-nav-item is-active' : 'mb-side-nav-item'}
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate(item.id)}
              >
                <Icon size={18} strokeWidth={1.7} />
                <span>{item.label}</span>
                <kbd className="mb-kbd">{item.shortcut}</kbd>
              </button>
            )
          })}
        </nav>
        <button type="button" className="mb-primary-btn mb-side-add" onClick={onOpenEntry}>
          <Plus size={16} />
          记一笔
        </button>
        <MonthSummary state={dataState} />
      </aside>
      <main className="mb-main">
        <div className="mb-content">{children}</div>
      </main>
    </div>
  )
}

function MobileShell({
  page,
  hideFab = false,
  headAction,
  onNavigate,
  onOpenEntry,
  children,
}: Omit<AppShellProps, 'device' | 'dataState'>) {
  return (
    <div className="mb-mobile-shell">
      <div className="mb-mobile-status" aria-hidden="true">
        <span>9:41</span>
        <span className="mb-mobile-status-icons">
          <Wifi size={14} />
          <BatteryMedium size={16} />
        </span>
      </div>
      <header className="mb-mobile-head">
        <h1 className="mb-mobile-title">{shellPageLabel(page)}</h1>
        <div className="mb-mobile-head-actions">
          {headAction}
          <button
            type="button"
            className="mb-icon-btn"
            aria-label="搜索流水"
            onClick={() => onNavigate('transactions')}
          >
            <Search size={19} />
          </button>
          {page !== 'settings' && (
            <button
              type="button"
              className="mb-icon-btn"
              aria-label="打开设置"
              onClick={() => onNavigate('settings')}
            >
              <Settings size={19} />
            </button>
          )}
        </div>
      </header>
      <div className="mb-mobile-scroll">{children}</div>
      {/* 移动端底部操作条的 portal 宿主：在滚动容器外、手机框内，
          让批量条相对手机屏幕固定而不是随内容滚动。 */}
      <div className="mb-mobile-dock" />
      <nav className="mb-mobile-nav" aria-label="底部导航">
        {SHELL_NAV.map((item) => {
          const Icon = item.icon
          const active = item.id === page
          return (
            <button
              key={item.id}
              type="button"
              className={active ? 'mb-mobile-nav-item is-active' : 'mb-mobile-nav-item'}
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={20} strokeWidth={1.7} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>
      {!hideFab && (
        <button
          type="button"
          className="mb-mobile-fab"
          aria-label="记一笔"
          onClick={onOpenEntry}
        >
          <Plus size={22} />
        </button>
      )}
    </div>
  )
}

export function AppShell({
  device,
  page,
  dataState = 'normal',
  hideFab = false,
  headAction,
  onNavigate,
  onOpenEntry,
  children,
}: AppShellProps) {
  if (device === 'mobile') {
    return (
      <MobileShell
        page={page}
        hideFab={hideFab}
        headAction={headAction}
        onNavigate={onNavigate}
        onOpenEntry={onOpenEntry}
      >
        {children}
      </MobileShell>
    )
  }
  return (
    <DesktopShell
      page={page}
      dataState={dataState}
      onNavigate={onNavigate}
      onOpenEntry={onOpenEntry}
    >
      {children}
    </DesktopShell>
  )
}
