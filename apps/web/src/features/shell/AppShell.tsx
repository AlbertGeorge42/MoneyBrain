import { BatteryMedium, Plus, Search, Settings, Wifi } from 'lucide-react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { minor } from '@domain/index'
import { formatCurrency } from '@/utils/format'
import { getPortalHost } from '@/features/shared/portalHost'
import { useOverlayOpen } from '@/features/shared/overlayPresence'
import { Button } from '@/features/shared/Button'
import { IconButton } from '@/features/shared/IconButton'
import { useLedger } from '@/features/overview/ledgerStore'
import { deriveOverview, ledgerAnchorDay } from '@/features/overview/model'
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
  // 脚注只报账本里真实发生的事：本月流水笔数，不写与账本无关的固定文案。
  const month = ledgerAnchorDay(ledger).slice(0, 7)
  const monthCount = ledger.transactions.filter((transaction) => transaction.date.slice(0, 7) === month).length

  return (
    <div className={compact ? 'mb-shell-foot is-compact' : 'mb-shell-foot'}>
      <div className="mb-shell-foot-label">本月收支</div>
      {state === 'normal' ? (
        <>
          <div className={positive ? 'mb-shell-foot-value mb-shell-foot-value--positive' : 'mb-shell-foot-value mb-shell-foot-value--negative'}>
            {formatCurrency(minor(summary.balance), { showSign: true })}
          </div>
          <div className="mb-shell-foot-meta">
            <span className={positive ? 'mb-shell-dot mb-shell-dot--positive' : 'mb-shell-dot mb-shell-dot--negative'} />
            {monthCount > 0 ? `本月 ${monthCount} 笔流水` : '本月还没有流水'}
          </div>
        </>
      ) : (
        <>
          <div className="mb-shell-foot-value mb-shell-foot-value--muted">—</div>
          <div className="mb-shell-foot-meta">{stateText}</div>
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
  const overlayOpen = useOverlayOpen()
  return (
    <div className="mb-shell-desktop-shell">
      <aside className="mb-shell-sidebar" aria-label="主导航">
        <div className="mb-shell-brand">
          <span className="mb-shell-mark" aria-hidden="true">MB</span>
          <span className="mb-shell-copy">
            <span className="mb-shell-name">MoneyBrain</span>
            <span className="mb-shell-tag">账本 · 本地优先</span>
          </span>
        </div>
        <nav className="mb-shell-side-nav">
          {SHELL_NAV.map((item) => {
            const Icon = item.icon
            const active = item.id === page
            return (
              <Button
                key={item.id}
                className={active ? 'mb-shell-side-nav-item is-active' : 'mb-shell-side-nav-item'}
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate(item.id)}
              >
                <Icon size={18} strokeWidth={1.7} />
                <span>{item.label}</span>
                <kbd className="mb-shell-kbd">{item.shortcut}</kbd>
              </Button>
            )
          })}
        </nav>
        {createPortal(
          <Button
            variant="primary"
            className="mb-shell-add"
            onClick={onOpenEntry}
            disabled={overlayOpen}
            title={overlayOpen ? '关闭当前弹窗后再记一笔' : undefined}
          >
            <Plus size={16} />
            记一笔
          </Button>,
          getPortalHost(),
        )}
        <MonthSummary state={dataState} />
      </aside>
      <main className="mb-shell-main">
        <div className="mb-shell-content">{children}</div>
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
  const overlayOpen = useOverlayOpen()
  return (
    <div className="mb-shell-mobile-shell" data-page={page}>
      <div className="mb-shell-status" aria-hidden="true">
        <span>9:41</span>
        <span className="mb-shell-status-icons">
          <Wifi size={14} />
          <BatteryMedium size={16} />
        </span>
      </div>
      <header className="mb-shell-mobile-head">
        <h1 className="mb-shell-mobile-title">{shellPageLabel(page)}</h1>
        <div className="mb-shell-head-actions">
          {headAction}
          <IconButton
              size="md"
            aria-label="搜索流水"
            onClick={() => onNavigate('transactions')}
          >
            <Search size={19} />
          </IconButton>
          {page !== 'settings' && page !== 'reports' && (
            <IconButton
              size="md"
              aria-label="打开设置"
              onClick={() => onNavigate('settings')}
            >
              <Settings size={19} />
            </IconButton>
          )}
        </div>
      </header>
      <div className="mb-shell-scroll">{children}</div>
      {/* 移动端底部操作条的 portal 宿主：在滚动容器外、手机框内，
          让批量条相对手机屏幕固定而不是随内容滚动。 */}
      <div data-mobile-dock />
      <nav className="mb-shell-mobile-nav" aria-label="底部导航">
        {SHELL_NAV.map((item) => {
          const Icon = item.icon
          const active = item.id === page
          return (
            <Button
              key={item.id}
              className={active ? 'mb-shell-mobile-nav-item is-active' : 'mb-shell-mobile-nav-item'}
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={20} strokeWidth={1.7} />
              <span>{item.label}</span>
            </Button>
          )
        })}
      </nav>
      {!hideFab && (
        <Button
          className="mb-shell-fab"
          aria-label="记一笔"
          onClick={onOpenEntry}
          disabled={overlayOpen}
        >
          <Plus size={22} />
        </Button>
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
