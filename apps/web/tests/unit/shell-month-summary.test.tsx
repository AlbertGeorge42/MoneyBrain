/**
 * 侧栏脚注诚实性
 *
 * 缺陷：固定文案「连续记录 12 天」与真实账本无关。修复后脚注只报本月真实流水笔数；
 * 账本没有流水时明确说没有，而不是继续显示一个固定天数。
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { AppShell } from '@/features/shell/AppShell'
import type { Ledger } from '@/features/overview/model'

function makeLedger(transactions: Ledger['transactions']): Ledger {
  return {
    accounts: [{ id: 'a1', name: '钱包', kind: 'cash', balance: 100_000 }],
    categories: [{ id: 'food', name: '餐饮', type: 'expense' }],
    budgets: [],
    transactions,
  }
}

function renderShell(ledger: Ledger) {
  render(
    <LedgerProvider initialLedger={ledger} dataMode="seed">
      <AppShell device="desktop" page="overview" onNavigate={() => {}} onOpenEntry={() => {}}>
        <div>内容</div>
      </AppShell>
    </LedgerProvider>,
  )
}

describe('侧栏本月脚注', () => {
  it('按真实本月流水笔数显示，不再出现固定「连续记录 12 天」', () => {
    renderShell(
      makeLedger([
        { id: 't1', date: '2026-10-05', type: 'expense', categoryId: 'food', note: '午餐', accountId: 'a1', amount: 1_000 },
        { id: 't2', date: '2026-10-06', type: 'expense', categoryId: 'food', note: '晚餐', accountId: 'a1', amount: 2_000 },
        { id: 't3', date: '2026-09-20', type: 'expense', categoryId: 'food', note: '上月', accountId: 'a1', amount: 3_000 },
      ]),
    )

    expect(screen.getByText('本月 2 笔流水')).toBeInTheDocument()
    expect(screen.queryByText(/连续记录/)).toBeNull()
  })

  it('本月没有流水时明确说明，不编造天数', () => {
    renderShell(
      makeLedger([
        { id: 't1', date: '2026-08-01', type: 'expense', categoryId: 'food', note: '旧账', accountId: 'a1', amount: 1_000 },
      ]),
    )

    expect(screen.getByText('本月还没有流水')).toBeInTheDocument()
  })
})
