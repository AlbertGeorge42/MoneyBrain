/**
 * P2 #12 转移即删除必须有安全网
 *
 * 复现原缺陷：点选目标分类立刻转移 + 删除，没有撤销，与其它批量操作的 6 秒撤销不一致。
 * 断言：转移后出现「撤销」；点击后原分类与记录归属都恢复。
 */
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { ToastProvider } from '@/features/shared/toast'
import { useLedger } from '@/features/overview/ledgerStore'
import { SettingsPage } from '@/features/settings/SettingsPage'
import type { Ledger } from '@/features/overview/model'

const ledger: Ledger = {
  accounts: [{ id: 'a1', name: '招商储蓄卡', kind: 'deposit', balance: 100_000 }],
  categories: [
    { id: 'shop', name: '购物', type: 'expense' },
    { id: 'food', name: '餐饮', type: 'expense' },
  ],
  budgets: [],
  transactions: [
    { id: 't1', date: '2026-10-01', type: 'expense', categoryId: 'shop', note: '超市', accountId: 'a1', amount: 1_000 },
  ],
}

function OwnershipProbe() {
  const { ledger: current } = useLedger()
  return (
    <div data-testid="ownership">
      {current.transactions.map((item) => `${item.id}:${item.categoryId}`).join('|')}
    </div>
  )
}

describe('#12 转移并删除分类后的 6 秒撤销', () => {
  it('撤销恢复原分类与记录归属', async () => {
    render(
      <MantineProvider defaultColorScheme="auto">
        <LedgerProvider initialLedger={ledger} dataMode="seed">
          <ToastProvider>
            <SettingsPage device="desktop" dataState="normal" onRetry={() => {}} onImport={() => {}} />
            <OwnershipProbe />
          </ToastProvider>
        </LedgerProvider>
      </MantineProvider>,
    )
    const ownership = screen.getByTestId('ownership')
    expect(ownership.textContent).toBe('t1:shop')

    fireEvent.click(screen.getByRole('button', { name: '收支分类' }))
    const row = screen.getByText('购物').closest('.mb-set-row') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '更多操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '删除' }))

    expect(screen.getByText(/共 1 笔交易引用/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '餐饮' }))

    // 转移即删除：源分类消失，交易落到目标分类。
    await waitFor(() => expect(ownership.textContent).toBe('t1:food'))
    expect(screen.queryByText('购物')).toBeNull()

    const toast = await screen.findByRole('status')
    expect(toast.textContent).toContain('已转移 1 笔到「餐饮」并删除「购物」')

    fireEvent.click(within(toast).getByRole('button', { name: '撤销' }))

    // 撤销恢复原分类与记录归属。
    await waitFor(() => expect(ownership.textContent).toBe('t1:shop'))
    expect(screen.getByText('购物')).toBeInTheDocument()
  })
})
