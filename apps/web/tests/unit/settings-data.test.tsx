/**
 * 设置页数据区（API 模式）
 *
 * 覆盖本批的安全底线：
 * - 清空前必须先导出备份：未导出时点击「确认清空」被拦住，且给出可见文案；
 * - 导入必须先进预览、确认后才写库，成功后显示「这批导入了 N 笔」；
 * - 回滚按 importId 撤销，并报出实际撤销的笔数。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { SettingsPage } from '@/features/settings/SettingsPage'
import type { Ledger } from '@/features/overview/model'

const mocks = vi.hoisted(() => ({
  exportFull: vi.fn(),
  listImportBatches: vi.fn(),
  previewImport: vi.fn(),
  importBackup: vi.fn(),
  rollbackImportBatch: vi.fn(),
  clearAll: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  dataApi: {
    exportFull: mocks.exportFull,
    listImportBatches: mocks.listImportBatches,
    previewImport: mocks.previewImport,
    importBackup: mocks.importBackup,
    rollbackImportBatch: mocks.rollbackImportBatch,
    clearAll: mocks.clearAll,
  },
  transactionCategoryApi: {},
  auditEventApi: {},
  transactionApi: {
    getRecycleBin: vi.fn().mockResolvedValue({
      data: { success: true, data: { list: [], accounts: [], categories: [] } },
    }),
  },
}))

const ledger: Ledger = {
  accounts: [{ id: 'a1', name: '招商储蓄卡', kind: 'deposit', balance: 100_000 }],
  categories: [{ id: 'food', name: '餐饮', type: 'expense' }],
  budgets: [],
  transactions: [],
}

const ok = <T,>(data: T) => ({ data: { success: true, data } })

const previewResult = {
  imported: { transactions: 5, accounts: 1, accountCategories: 0, transactionCategories: 1, budgets: 0, investmentSnapshots: 0, investmentItems: 0 },
  updated: {},
  skipped: { transactions: 0 },
  errors: [],
  summary: {
    total: 5,
    amountTotal: 50_000,
    dateFrom: '2026-03-01',
    dateTo: '2026-03-05',
    unknownAccounts: ['新账户'],
    unknownCategories: ['测试分类'],
    duplicates: 0,
  },
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <LedgerProvider initialLedger={ledger} dataMode="api">
          <SettingsPage device="desktop" dataState="normal" onRetry={() => {}} onImport={() => {}} />
        </LedgerProvider>
      </MantineProvider>
    </QueryClientProvider>,
  )
}

async function openDataSection() {
  fireEvent.click(screen.getByRole('button', { name: /数据与备份/ }))
}

describe('设置页数据区（API 模式）', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.listImportBatches.mockResolvedValue(ok([]))
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('未导出备份时「确认清空」为真禁用，并用 aria-describedby 指向可见原因', async () => {
    renderPage()
    await openDataSection()

    fireEvent.click(screen.getByRole('button', { name: '清空账本' }))
    const sheet = await screen.findByRole('dialog')
    const reason = within(sheet).getByText('尚未导出备份：必须先导出备份才能继续')
    const confirm = within(sheet).getByRole('button', { name: '确认清空' })

    expect(reason).toHaveAttribute('id', 'mb-set-clear-reason')
    expect(confirm).toBeDisabled()
    expect(confirm).toHaveAttribute('aria-describedby', 'mb-set-clear-reason')
    // 原因必须紧邻动作区：中间不能隔着输入框、导出按钮等其他可交互控件。
    const actions = reason.nextElementSibling as HTMLElement
    expect(actions).toHaveClass('mb-set-sheet-actions')
    expect(within(actions).getByRole('button', { name: '确认清空' })).toBe(confirm)
    expect(mocks.clearAll).not.toHaveBeenCalled()
  })

  it('导出备份后清空才继续，并调用 clearAll', async () => {
    mocks.exportFull.mockResolvedValue({
      data: new Blob(['mock-backup']),
      headers: { 'content-disposition': 'attachment; filename=moneybrain-backup-2026-11-06.mbx' },
    })
    renderPage()
    await openDataSection()

    fireEvent.click(screen.getByRole('button', { name: '清空账本' }))
    const sheet = await screen.findByRole('dialog')
    fireEvent.click(within(sheet).getByRole('button', { name: '先导出备份 (.mbx)' }))

    await waitFor(() =>
      expect(within(sheet).getByText(/已备份：moneybrain-backup-2026-11-06\.mbx/)).toBeInTheDocument(),
    )

    // 备份后：禁用原因消失、按钮解锁，aria-describedby 一并撤下。
    expect(within(sheet).queryByText('尚未导出备份：必须先导出备份才能继续')).not.toBeInTheDocument()
    const unlocked = within(sheet).getByRole('button', { name: '确认清空' })
    expect(unlocked).toBeEnabled()
    expect(unlocked).not.toHaveAttribute('aria-describedby')

    fireEvent.change(within(sheet).getByPlaceholderText('清空账本'), {
      target: { value: '清空账本' },
    })
    mocks.clearAll.mockResolvedValue(ok({ message: '所有数据已清空' }))
    fireEvent.click(within(sheet).getByRole('button', { name: '确认清空' }))

    await waitFor(() => expect(mocks.clearAll).toHaveBeenCalledTimes(1))
  })

  it('导入先预览再确认，成功后显示本批笔数；回滚报实际撤销笔数', async () => {
    mocks.previewImport.mockResolvedValue(
      ok({ result: previewResult, willOverwrite: [] }),
    )
    mocks.importBackup.mockResolvedValue(
      ok({ ...previewResult, importId: 'batch-1', rollbackPointId: undefined }),
    )
    mocks.rollbackImportBatch.mockResolvedValue(
      ok({ importId: 'batch-1', removed: { transaction: 5 }, removedTransactions: 5 }),
    )
    mocks.listImportBatches.mockResolvedValue(
      ok([
        {
          id: 'batch-1',
          createdAt: '2026-11-06T04:00:00.000Z',
          filename: 'sample.csv',
          mode: 'merge',
          includes: [],
          imported: previewResult.imported,
          transactionCount: 5,
          status: 'active',
          rolledBackAt: null,
          rolledBack: null,
        },
      ]),
    )

    renderPage()
    await openDataSection()

    fireEvent.click(screen.getByRole('button', { name: '打开导入向导' }))
    const sheet = await screen.findByRole('dialog')
    const file = new File(['x'], 'sample.csv', { type: 'text/csv' })
    fireEvent.change(within(sheet).getByLabelText(/备份文件/), { target: { files: [file] } })

    // 预览前不写库
    expect(mocks.importBackup).not.toHaveBeenCalled()
    fireEvent.click(within(sheet).getByRole('button', { name: '解析并预览' }))

    const preview = await within(sheet).findByTestId('import-preview')
    expect(preview.textContent).toContain('2026-03-01 ~ 2026-03-05')
    expect(preview.textContent).toContain('新账户')
    expect(preview.textContent).toContain('测试分类')

    fireEvent.click(within(sheet).getByRole('button', { name: '确认导入' }))
    await waitFor(() => expect(mocks.importBackup).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getAllByText(/这批导入了 5 笔/).length).toBeGreaterThan(0))

    const batch = await screen.findByText('sample.csv')
    const row = batch.closest('.mb-set-batch') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: '撤销这批' }))
    fireEvent.click(within(row).getByRole('button', { name: '确认撤销' }))

    await waitFor(() => expect(mocks.rollbackImportBatch).toHaveBeenCalledWith('batch-1'))
    await waitFor(() => expect(screen.getAllByText(/已撤销 5 笔/).length).toBeGreaterThan(0))
  })
})
