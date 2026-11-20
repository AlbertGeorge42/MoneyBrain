/**
 * 交易详情：负数金额的平账引导 + 从原交易创建关联退款的可见入口。
 *
 * 退款不再是「把原交易改成 refund 类型」（后端也禁止普通交易改退款），
 * 而是一笔独立交易冲减原交易；所以详情面板提供「记一笔退款」，不提供类型切换。
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

function renderPanel(onCreateRefund = vi.fn(async () => ({ ok: true }))) {
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
        onLinkRefund={async () => ({ ok: true })}
        onCreateRefund={onCreateRefund}
      />
    </MantineProvider>,
  )
  return { onSave, onCreateRefund }
}

describe('交易详情编辑', () => {
  it('负数时提示平账入口、禁用保存，并可切换到平账类型', () => {
    const { onSave } = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByLabelText('金额（元）'), { target: { value: '-5' } })

    expect(screen.getByRole('alert').textContent).toContain('金额需大于 0')
    expect(screen.getByRole('button', { name: /保存修改/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '改为退款' })).toBeNull()
    expect(screen.getByRole('button', { name: '改为平账' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '改为平账' }))
    expect((screen.getByLabelText('分类') as HTMLSelectElement).value).toBe('adjust')
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /保存修改/ }))
    expect(onSave).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ type: 'adjustment', amount: 500 }),
    )
  })
})

describe('退款入口', () => {
  it('原交易详情有可见的「记一笔退款」，默认金额为剩余可退额', () => {
    renderPanel()
    const button = screen.getByRole('button', { name: '记一笔退款' })
    expect(button).toBeInTheDocument()

    fireEvent.click(button)
    expect(screen.getByRole('heading', { name: '记一笔退款' })).toBeInTheDocument()
    expect((screen.getByLabelText('退款金额（元）') as HTMLInputElement).value).toBe('20')
    expect((screen.getByLabelText('退款账户') as HTMLSelectElement).value).toBe('cmb')
  })

  it('提交退款走关联原交易创建，不改原交易类型', () => {
    const onCreateRefund = vi.fn(async () => ({ ok: true, id: 'refund-1' }))
    renderPanel(onCreateRefund)

    fireEvent.click(screen.getByRole('button', { name: '记一笔退款' }))
    fireEvent.change(screen.getByLabelText('退款金额（元）'), { target: { value: '8.5' } })
    fireEvent.change(screen.getByLabelText('备注'), { target: { value: '退货' } })
    fireEvent.click(screen.getByRole('button', { name: '创建退款' }))

    expect(onCreateRefund).toHaveBeenCalledWith('t1', 'food', 'cmb', 850, '退货')
  })
})
