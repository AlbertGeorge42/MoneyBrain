/**
 * 总览「最近交易」与流水页共用同一行组件（consistency 第 1 条）
 *
 * 两页桌面端都必须是「无表头 + 两段式行」，且行内结构完全同源；
 * 差异只允许通过 props 控制（是否显示备注/账户），不允许各写一套行样式。
 */
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { RecentTransactions } from '@/features/overview/RecentTransactions'
import { TransactionsList } from '@/features/transactions/TransactionsList'
import { DEFAULT_DISPLAY } from '@/features/transactions/displaySettings'
import type { GroupedTransactions } from '@/features/transactions/filters'
import type { Ledger, LedgerTransaction, RecentGroup } from '@/features/overview/model'
import { hfTheme } from '@/styles/theme/hf-theme'

const ledger: Ledger = {
  accounts: [{ id: 'cmb', name: '招商储蓄卡', kind: 'deposit', balance: 100_000 }],
  categories: [{ id: 'food', name: '餐饮', type: 'expense' }],
  budgets: [],
  transactions: [],
}

const transaction: LedgerTransaction = {
  id: 't1',
  date: '2026-10-28',
  type: 'expense',
  categoryId: 'food',
  note: '午餐·公司食堂',
  accountId: 'cmb',
  amount: 2_000,
}

const grouped: GroupedTransactions[] = [
  { date: '2026-10-28', label: '今天', net: -2_000, income: 0, expense: 2_000, items: [transaction] },
]

const recent: RecentGroup[] = [{ date: '2026-10-28', label: '今天', items: [transaction] }]

function renderTransactions() {
  return render(
    <MantineProvider theme={hfTheme}>
      <TransactionsList
        device="desktop"
        groups={grouped}
        ledger={ledger}
        batchMode={false}
        display={DEFAULT_DISPLAY}
        selected={new Set()}
        onToggle={vi.fn()}
        onOpenDetail={vi.fn()}
      />
    </MantineProvider>,
  )
}

function renderRecent() {
  return render(
    <MantineProvider theme={hfTheme}>
      <RecentTransactions
        device="desktop"
        groups={recent}
        ledger={ledger}
        onOpenDetail={vi.fn()}
        onOpenAll={vi.fn()}
      />
    </MantineProvider>,
  )
}

function rowShape(container: HTMLElement) {
  const row = container.querySelector('.mb-tx-row')
  return {
    tag: row?.tagName,
    className: row?.className,
    hasTable: Boolean(container.querySelector('table')),
    hasHeader: Boolean(container.querySelector('thead')),
    primary: row?.querySelector('.mb-tx-primary > .mb-tx-cat-name')?.textContent,
    note: row?.querySelector('.mb-tx-primary > .mb-tx-note')?.textContent,
    secondary: row?.querySelector('.mb-tx-secondary')?.textContent,
    hasIcon: Boolean(row?.querySelector('.mb-cat-icon')),
    amount: row?.querySelector('.mb-tx-amount')?.textContent,
  }
}

describe('总览最近交易与流水共用行组件', () => {
  it('两页都不再使用表格/表头，且行结构完全一致', () => {
    const transactions = renderTransactions()
    const overview = renderRecent()

    const transactionsShape = rowShape(transactions.container)
    const overviewShape = rowShape(overview.container)

    expect(transactionsShape.hasTable).toBe(false)
    expect(transactionsShape.hasHeader).toBe(false)
    expect(overviewShape.hasTable).toBe(false)
    expect(overviewShape.hasHeader).toBe(false)

    expect(transactionsShape).toEqual(overviewShape)
    expect(overviewShape).toMatchObject({
      tag: 'DIV',
      hasIcon: true,
      primary: '餐饮',
      note: '午餐·公司食堂',
      secondary: '招商储蓄卡·支出',
      amount: '−¥20.00',
    })
  })

  it('两页分组头使用同一套样式类', () => {
    const transactions = renderTransactions()
    const overview = renderRecent()
    expect(transactions.container.querySelector('.mb-tx-group-row .mb-tx-group-label')?.textContent).toBe('今天')
    expect(overview.container.querySelector('.mb-tx-group-row .mb-tx-group-label')?.textContent).toBe('今天')
  })
})
