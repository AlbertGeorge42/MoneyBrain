/**
 * 总览「最近交易」与流水页共用同一行组件（consistency 第 1 条）
 *
 * 两页桌面端都必须是「无表头 + 两段式行」，且行内结构完全同源；
 * 差异只允许通过 props 控制（是否显示备注/账户），不允许各写一套行样式。
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { RecentTransactions } from '@/features/overview/RecentTransactions'
import { TxRow } from '@/features/shared/TxRow'
import { TransactionsList } from '@/features/transactions/TransactionsList'
import { DEFAULT_DISPLAY } from '@/features/transactions/displaySettings'
import type { GroupedTransactions } from '@/features/transactions/filters'
import type { Ledger, LedgerTransaction, RecentGroup } from '@/features/overview/model'
import { appTheme } from '@/styles/theme/theme-tokens'

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
    <MantineProvider theme={appTheme}>
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
    <MantineProvider theme={appTheme}>
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
    hasIcon: Boolean(row?.querySelector('.mb-shared-icon')),
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
      // 副行口径：交易类型 · 账户。
      secondary: '支出·招商储蓄卡',
      amount: '−¥20.00',
    })
  })

  it('两页分组头使用同一套样式类', () => {
    const transactions = renderTransactions()
    const overview = renderRecent()
    expect(transactions.container.querySelector('.mb-tx-group-row .mb-tx-group-label')?.textContent).toBe('今天')
    expect(overview.container.querySelector('.mb-tx-group-row .mb-tx-group-label')?.textContent).toBe('今天')
  })

  it('转账副行也带交易类型，并保留「源账户 → 目的账户」', () => {
    const twoAccounts: Ledger = {
      ...ledger,
      accounts: [
        ledger.accounts[0],
        { id: 'cash', name: '钱包现金', kind: 'cash', balance: 5_000 },
      ],
    }
    const transfer: LedgerTransaction = {
      ...transaction,
      id: 't2',
      type: 'transfer',
      toAccountId: 'cash',
      categoryId: 'food',
    }
    const { container } = render(
      <MantineProvider theme={appTheme}>
        <TxRow ledger={twoAccounts} transaction={transfer} onActivate={vi.fn()} />
      </MantineProvider>,
    )
    expect(container.querySelector('.mb-tx-secondary')?.textContent).toBe('转账·招商储蓄卡→钱包现金')
  })

  it('移动端与 PC 共用同一套字重字号：variant 只改行距与图标尺寸', async () => {
    const css = await readFile(resolve(__dirname, '../../src/features/shared/txRow.css'), 'utf8')
    // is-mobile 内不得再覆写分类名 / 备注的字重、字号或颜色。
    const mobileBlock = css.match(/\.mb-tx-row\.is-mobile\s*\{[^}]*\}/)?.[0] ?? ''
    expect(mobileBlock).toContain('min-height')
    expect(css).not.toMatch(/\.mb-tx-row\.is-mobile\s+\.mb-tx-(cat-name|note|primary|kind)/)
  })

  it('退款行关联标签只显示「原交易」入口，不重复主行分类/备注，也不占控件高度', async () => {
    const original: LedgerTransaction = { ...transaction, id: 't-orig' }
    const refund: LedgerTransaction = {
      ...transaction,
      id: 't-refund',
      type: 'refund',
      amount: 500,
      relatedTransaction: original,
    }
    const { container } = render(
      <MantineProvider theme={appTheme}>
        <TxRow
          ledger={{ ...ledger, transactions: [original, refund] }}
          transaction={refund}
          onActivate={vi.fn()}
          onOpenRelated={vi.fn()}
        />
      </MantineProvider>,
    )

    // 主行已是「餐饮 · 午餐·公司食堂」，副行关联标签不再重复原交易名称。
    const secondary = container.querySelector('.mb-tx-secondary')?.textContent ?? ''
    expect(secondary).toBe('退款·招商储蓄卡原交易')
    expect(secondary).not.toContain('午餐·公司食堂')
    const link = container.querySelector('.mb-tx-refund-tag--link')
    expect(link?.textContent).toBe('原交易')
    expect(link?.className).toContain('mb-shared-text-btn')

    const css = await readFile(resolve(__dirname, '../../src/features/shared/button.css'), 'utf8')
    const textBlock = css.match(/\.mb-shared-text-btn\s*\{[^}]*\}/)?.[0] ?? ''
    expect(textBlock).toContain('min-height: 0')
    expect(textBlock).toContain('padding: 0')
  })

  it('已全额退款的原交易行带 --full 高亮类', () => {
    const original: LedgerTransaction = { ...transaction, id: 't-orig' }
    const refund: LedgerTransaction = {
      ...transaction,
      id: 't-refund',
      type: 'refund',
      amount: 2_000,
      relatedTransactionId: 't-orig',
    }
    const { container } = render(
      <MantineProvider theme={appTheme}>
        <TxRow
          ledger={{ ...ledger, transactions: [original, refund] }}
          transaction={original}
          onActivate={vi.fn()}
        />
      </MantineProvider>,
    )

    expect(container.querySelector('.mb-tx-refund-tag--full')?.textContent).toBe('已全额退款')
  })
})
