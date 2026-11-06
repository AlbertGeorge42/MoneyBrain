/**
 * P2 #14 支出改负数：提示退款 / 调整出口并禁用保存。
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { TransactionDetailPanel } from '@/features/transactions/TransactionDetailPanel'
import type { Ledger, LedgerTransaction } from '@/features/overview/model'

const ledger: Ledger = {
  accounts: [{ id: 'cmb', name: '招商储蓄卡', kind: 'deposit', balance: 100_000 }],
  categories: [
    { id: 'food', name: '餐饮', type: 'expense' },
    { id: 'other', name: '其他', type: 'expense' },
    { id: 'refund', name: '退款', type: 'refund' },
    { id: 'adjust', name: '调整', type: 'adjustment' },
  ],
  budgets: [],
  transactions: [],
}

function expenseTransaction(): LedgerTransaction {
  return {
    id: 't1',
    date: '2026-10-20',
    type: 'expense',
    categoryId: 'food',
    note: '午餐',
    accountId: 'cmb',
    amount: 2_000,
  }
}

describe('#14 支出改负数的引导', () => {
  it('负数时提示退款 / 调整入口、禁用保存，并可切换到调整类型', () => {
    const onSave = vi.fn(async () => ({ ok: true }))
    render(
      <MantineProvider>
        <TransactionDetailPanel
          transaction={expenseTransaction()}
          ledger={ledger}
          device="desktop"
          onClose={() => {}}
          onSave={onSave}
          onDelete={async () => ({ ok: true })}
        />
      </MantineProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByLabelText('金额（元）'), { target: { value: '-5' } })

    expect(screen.getByRole('alert').textContent).toContain('退款请改用退款类型，冲正请用调整')
    expect(screen.getByRole('button', { name: /保存修改/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: '改为退款' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '改为调整' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '改为调整' }))
    expect((screen.getByLabelText('分类') as HTMLSelectElement).value).toBe('adjust')
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /保存修改/ }))
    expect(onSave).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ type: 'adjustment', amount: -500 }),
    )
  })

  it('改为退款时负数金额同时转正，错误消失且保存可达', () => {
    const onSave = vi.fn(async () => ({ ok: true }))
    render(
      <MantineProvider>
        <TransactionDetailPanel
          transaction={expenseTransaction()}
          ledger={ledger}
          device="desktop"
          onClose={() => {}}
          onSave={onSave}
          onDelete={async () => ({ ok: true })}
        />
      </MantineProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByLabelText('金额（元）'), { target: { value: '-28' } })

    expect(screen.getByRole('button', { name: /保存修改/ })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '改为退款' }))

    expect((screen.getByLabelText('金额（元）') as HTMLInputElement).value).toBe('28')
    expect((screen.getByLabelText('分类') as HTMLSelectElement).value).toBe('refund')
    expect(screen.queryByRole('alert')).toBeNull()

    const save = screen.getByRole('button', { name: /保存修改/ })
    expect(save).toBeEnabled()
    fireEvent.click(save)
    expect(onSave).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ type: 'refund', amount: 2_800, categoryId: 'refund' }),
    )
  })
})
