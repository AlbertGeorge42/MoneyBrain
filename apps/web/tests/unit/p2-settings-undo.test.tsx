/**
 * P2 #12 转移即删除必须有安全网
 *
 * 复现原缺陷：点选目标分类立刻转移 + 删除，没有撤销，与其它批量操作的 6 秒撤销不一致。
 * 断言：转移后出现「撤销」；点击后原分类与记录归属都恢复。
 *
 * 种子模式已被移除，应用恒为 API 模式：删除分类走后端，本地账本靠 refreshRemote
 * （LedgerProvider 的 onRemoteChange）同步。本测试用 onRemoteChange 模拟后端回写，
 * 并断言转移 / 撤销两个阶段都调用了正确的后端路径。
 */
import { describe, expect, it, vi } from 'vitest'
import { useCallback, useRef, useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { ToastProvider } from '@/features/shared/toast'
import { useLedger } from '@/features/overview/ledgerStore'
import { SettingsPage } from '@/features/settings/SettingsPage'
import type { Ledger } from '@/features/overview/model'

const mocks = vi.hoisted(() => ({
  getStats: vi.fn(),
  deleteCategory: vi.fn(),
  undo: vi.fn(),
  getRecycleBin: vi.fn(),
  dataApi: {
    listImportBatches: vi.fn().mockResolvedValue({ data: { success: true, data: { batches: [] } } }),
    getAutoBackup: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
    updateAutoBackup: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
    exportFull: vi.fn().mockResolvedValue({ data: { success: true, data: { filename: 'x' } } }),
    previewImport: vi.fn().mockResolvedValue({
      data: { success: true, data: { created: 0, updated: 0, transactions: 0 } },
    }),
    importBackup: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
    rollbackImportBatch: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
    clearAll: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
  },
}))
vi.mock('@/services/api', () => ({
  transactionApi: { getRecycleBin: mocks.getRecycleBin, delete: vi.fn() },
  transactionCategoryApi: { getStats: mocks.getStats, delete: mocks.deleteCategory },
  auditEventApi: { undo: mocks.undo },
  dataApi: mocks.dataApi,
  accountApi: {},
  accountCategoryApi: {},
  budgetApi: {},
}))

const baseLedger: Ledger = {
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

// 转移并删除「购物」后的账本：t1 落到「餐饮」，源分类消失。
const transferredLedger: Ledger = {
  ...baseLedger,
  categories: baseLedger.categories.filter((item) => item.id !== 'shop'),
  transactions: baseLedger.transactions.map((item) =>
    item.id === 't1' ? { ...item, categoryId: 'food' } : item,
  ),
}

function OwnershipProbe() {
  const { ledger: current } = useLedger()
  return (
    <div data-testid="ownership">
      {current.transactions.map((item) => `${item.id}:${item.categoryId}`).join('|')}
    </div>
  )
}

// onRemoteChange 模拟后端回写：第一次调用是转移结果，第二次是撤销回放。
function Harness() {
  const [ledger, setLedger] = useState<Ledger>(baseLedger)
  const step = useRef(0)
  const onRemoteChange = useCallback(async () => {
    step.current += 1
    setLedger(step.current === 1 ? transferredLedger : baseLedger)
  }, [])
  return (
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider defaultColorScheme="auto">
        <LedgerProvider initialLedger={ledger} onRemoteChange={onRemoteChange}>
          <ToastProvider>
            <SettingsPage device="desktop" dataState="normal" onRetry={() => {}} onImport={() => {}} />
            <OwnershipProbe />
          </ToastProvider>
        </LedgerProvider>
      </MantineProvider>
    </QueryClientProvider>
  )
}

describe('#12 转移并删除分类后的 6 秒撤销', () => {
  it('撤销恢复原分类与记录归属', async () => {
    mocks.getStats.mockResolvedValue({ data: { success: true, data: { transactionCount: 1 } } })
    mocks.deleteCategory.mockResolvedValue({ data: { success: true, data: { auditEventId: 'evt-1' } } })
    mocks.undo.mockResolvedValue({ data: { success: true, data: {} } })
    mocks.getRecycleBin.mockResolvedValue({
      data: { success: true, data: { list: [], accounts: [], categories: [] } },
    })

    render(<Harness />)
    const ownership = screen.getByTestId('ownership')
    expect(ownership.textContent).toBe('t1:shop')

    fireEvent.click(screen.getByRole('button', { name: '收支分类' }))
    const row = screen.getByText('购物').closest('.mb-set-row') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '更多操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '删除' }))

    await waitFor(() => expect(screen.getByText(/共 1 笔交易引用/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('radio', { name: '餐饮' }))

    // 转移即删除：源分类消失，交易落到目标分类。
    await waitFor(() => expect(ownership.textContent).toBe('t1:food'))
    expect(screen.queryByText('购物')).toBeNull()

    // dnd-kit 的 DndContext 会注入无障碍 live region（role=status），
    // 故按文案定位 toast 文本再取容器，避免与拖拽播报区域冲突。
    const toastText = await screen.findByText(/已转移 1 笔/)
    expect(toastText.textContent).toContain('已转移 1 笔到「餐饮」并删除「购物」')
    const toast = toastText.closest('.mb-hf-toast') as HTMLElement

    fireEvent.click(within(toast).getByRole('button', { name: '撤销' }))

    // 撤销恢复原分类与记录归属。
    await waitFor(() => expect(ownership.textContent).toBe('t1:shop'))
    expect(screen.getByText('购物')).toBeInTheDocument()
  })
})
