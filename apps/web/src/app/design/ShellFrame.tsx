import { useState, type ReactNode } from 'react'
import { Button, Modal, Stack, Text, UnstyledButton } from '@mantine/core'
import { Plus } from 'lucide-react'
import { formatAmount } from '../../features/transactions/transaction-utils'
import type { DeviceMode } from '../../features/transactions/types'
import { NAV_ITEMS, navLabel, type NavPage } from './navigation'

type ShellFrameProps = {
  device: DeviceMode
  page: NavPage
  ledgerExpense: number
  ledgerNote: string
  batchMode: boolean
  onPageChange: (page: NavPage) => void
  onRecord: () => void
  overlay?: ReactNode
  children: ReactNode
}

function Brand({ onAbout }: { onAbout: () => void }) {
  return (
    <UnstyledButton className="hf-brand" aria-label="关于 MoneyBrain" onClick={onAbout}>
      <span className="hf-brand-mark mb-num" aria-hidden>MB</span>
      <span className="hf-brand-name">MoneyBrain</span>
    </UnstyledButton>
  )
}

/** 预览与生产共用的外壳：品牌、侧栏、移动底栏、记一笔入口。 */
export function ShellFrame({
  device,
  page,
  ledgerExpense,
  ledgerNote,
  batchMode,
  onPageChange,
  onRecord,
  overlay,
  children,
}: ShellFrameProps) {
  const [aboutOpen, setAboutOpen] = useState(false)
  const shell = device === 'mobile' ? (
    <div className="hf-shell-mobile">
      <header className="hf-mobile-header">
        <Brand onAbout={() => setAboutOpen(true)} />
        <span className="hf-mobile-page-title mb-title-3">{navLabel(page)}</span>
      </header>
      <div className="hf-mobile-body">{children}</div>
      <nav className="hf-bottom-nav" aria-label="底部导航">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = item.page === page
          return (
            <UnstyledButton
              key={item.page}
              className="hf-bottom-nav-item"
              data-active={active}
              aria-current={active ? 'page' : undefined}
              onClick={() => onPageChange(item.page)}
            >
              <Icon aria-hidden />
              <span>{item.label}</span>
            </UnstyledButton>
          )
        })}
      </nav>
      {!batchMode && (
        <UnstyledButton className="hf-fab" aria-label="记一笔" onClick={onRecord}>
          <Plus aria-hidden />
        </UnstyledButton>
      )}
    </div>
  ) : (
    <div className="hf-shell-pc">
      <aside className="hf-sidebar">
        <Brand onAbout={() => setAboutOpen(true)} />
        <nav className="hf-nav" aria-label="主导航">
          {NAV_ITEMS.map((item, index) => {
            const Icon = item.icon
            const active = item.page === page
            return (
              <UnstyledButton
                key={item.page}
                className="hf-nav-item"
                data-active={active}
                aria-current={active ? 'page' : undefined}
                onClick={() => onPageChange(item.page)}
              >
                <Icon className="hf-nav-icon" aria-hidden />
                <span>{item.label}</span>
                <kbd className="hf-kbd">{index + 1}</kbd>
              </UnstyledButton>
            )
          })}
        </nav>
        <div className="hf-sidebar-foot">
          <div className="hf-sidebar-status">
            <span className="mb-text-0">本月收支</span>
            <span className="hf-sidebar-amount mb-num" data-tone="expense">{formatAmount(-ledgerExpense)}</span>
            <span className="mb-text-0">{ledgerNote}</span>
          </div>
          <Button
            className="hf-record-btn mb-accent-btn"
            fullWidth
            leftSection={<Plus aria-hidden />}
            rightSection={<kbd className="hf-kbd hf-kbd--onfill">N</kbd>}
            onClick={onRecord}
          >
            记一笔
          </Button>
        </div>
      </aside>
      <main className="hf-main">
        <div className="hf-content">{children}</div>
      </main>
    </div>
  )

  return (
    <>
      {shell}
      <Modal opened={aboutOpen} onClose={() => setAboutOpen(false)} title="关于 MoneyBrain" centered>
        <Stack gap="xs">
          <Text fw={600}>MoneyBrain 个人记账</Text>
          <Text size="sm">版本 {__APP_VERSION__}</Text>
          <Text size="sm" c="dimmed">本地 SQLite · 数据不出本机</Text>
        </Stack>
      </Modal>
      {overlay}
    </>
  )
}
