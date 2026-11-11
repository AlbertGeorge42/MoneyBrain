/**
 * 流水列表结构守护（HF 第四批）
 *
 * 桌面端为「无表头 + 两段式行」结构：每条记录有 mb-tx-primary / mb-tx-secondary 两个文本块，
 * 转账行副行显示源账户 → 目的账户；正常态无复选框，批量态每行一个 checkbox。
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TransactionsList } from '@/features/transactions/TransactionsList'
import { DEFAULT_DISPLAY } from '@/features/transactions/displaySettings'
import type { GroupedTransactions } from '@/features/transactions/filters'
import type { Ledger } from '@/features/overview/model'

const ledger: Ledger = {
  accounts: [
    { id: 'cmb', name: '招商储蓄卡', kind: 'deposit', balance: 100_000 },
    { id: 'brk', name: '证券账户', kind: 'investment', balance: 50_000 },
  ],
  categories: [
    { id: 'food', name: '餐饮', type: 'expense' },
    { id: 'transfer', name: '账户互转', type: 'transfer' },
  ],
  budgets: [],
  transactions: [],
}

const groups: GroupedTransactions[] = [
  {
    date: '2026-10-28',
    label: '今天 · 10月28日 周三',
    net: -2_000,
    income: 0,
    expense: 2_000,
    items: [
      {
        id: 't1',
        date: '2026-10-28',
        type: 'expense',
        categoryId: 'food',
        note: '午餐·公司食堂',
        accountId: 'cmb',
        amount: 2_000,
      },
      {
        id: 't2',
        date: '2026-10-28',
        type: 'transfer',
        categoryId: 'transfer',
        note: '转入证券账户',
        accountId: 'cmb',
        toAccountId: 'brk',
        amount: 500_000,
      },
    ],
  },
]

function renderList(batchMode: boolean, selected: ReadonlySet<string> = new Set()) {
  return render(
    <TransactionsList
      device="desktop"
      groups={groups}
      ledger={ledger}
      batchMode={batchMode}
      display={DEFAULT_DISPLAY}
      selected={selected}
      onToggle={vi.fn()}
      onOpenDetail={vi.fn()}
    />,
  )
}

describe('流水列表桌面结构', () => {
  it('正常态不使用表格，且每行都有主/副两个文本块', () => {
    const { container } = renderList(false)

    expect(container.querySelector('table')).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()

    const rows = container.querySelectorAll('.mb-tx-row')
    expect(rows).toHaveLength(2)

    const first = rows[0]
    const primary = first.querySelector('.mb-tx-primary')
    const secondary = first.querySelector('.mb-tx-secondary')
    expect(primary?.textContent).toContain('餐饮')
    expect(primary?.textContent).toContain('午餐·公司食堂')
    expect(secondary?.textContent).toContain('招商储蓄卡')
    expect(secondary?.textContent).toContain('支出')
  })

  it('正常态不渲染复选框', () => {
    renderList(false)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('批量态每行一个 checkbox', () => {
    renderList(true)
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })

  it('转账行副行显示源账户 → 目的账户，非转账行不显示箭头', () => {
    const { container } = renderList(false)

    const rows = container.querySelectorAll('.mb-tx-row')
    expect(rows[0].querySelector('.mb-tx-secondary')?.textContent).not.toContain('→')
    expect(rows[1].querySelector('.mb-tx-secondary')?.textContent).toContain('招商储蓄卡')
    expect(rows[1].querySelector('.mb-tx-secondary')?.textContent).toContain('→')
    expect(rows[1].querySelector('.mb-tx-secondary')?.textContent).toContain('证券账户')
  })
})
