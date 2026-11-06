/**
 * 预算写操作真实性（API 模式）
 *
 * 复现缺陷：BudgetPage 走 updateBudgets → replaceLedger，而 LedgerContext 在 API 模式
 * 直接 return —— 点「新增预算条目」弹成功 toast，但一条都没落库。
 * 断言：API 模式下新增 / 改限额 / 删除都必须发出真实 /budgets 请求；
 * 没有发出请求或请求失败时，不得出现成功提示。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { MantineProvider } from '@mantine/core'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { BudgetPage } from '@/features/budgets/BudgetPage'
import type { Ledger } from '@/features/overview/model'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getAll: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  budgetApi: {
    create: mocks.create,
    update: mocks.update,
    delete: mocks.delete,
    getAll: mocks.getAll,
  },
  accountApi: {},
  accountCategoryApi: {},
  auditEventApi: {},
  transactionApi: {},
  transactionCategoryApi: {},
}))

const apiBudget = {
  id: 'b1',
  name: '餐饮预算',
  type: 'expense' as const,
  amount: 100_000,
  period: 'monthly' as const,
  startDate: '2026-10-01',
  endDate: null,
  transactionTime: null,
  note: null,
  isActive: true,
  accountId: 'acc1',
  toAccountId: null,
  categoryId: 'real-food',
}

const ledger: Ledger = {
  accounts: [
    { id: 'acc1', name: '钱包', kind: 'cash', balance: 100_000 },
    { id: 'acc2', name: '工资卡', kind: 'deposit', balance: 200_000 },
  ],
  categories: [
    { id: 'food', name: '餐饮', type: 'expense' },
    { id: 'salary', name: '工资', type: 'income' },
  ],
  budgets: [
    {
      id: 'b1',
      name: '餐饮预算',
      type: 'expense',
      period: 'monthly',
      limit: 100_000,
      categoryId: 'food',
      accountId: 'acc1',
    },
  ],
  transactions: [],
  ids: {
    categoryReal: { food: 'real-food', salary: 'real-salary' },
    categoryDisplay: { 'real-food': 'food', 'real-salary': 'salary' },
  },
}

const success = (data: unknown) => ({ data: { success: true, data } })

function Harness({ onNotify }: { onNotify: (message: string, action?: () => void) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <BudgetPage
      device="desktop"
      dataState="normal"
      editorOpen={open}
      onEditorOpenChange={setOpen}
      onRetry={() => {}}
      onViewFlow={() => {}}
      notify={onNotify}
    />
  )
}

function renderPage(onNotify = vi.fn()) {
  render(
    <MantineProvider>
      <LedgerProvider initialLedger={ledger} dataMode="api">
        <Harness onNotify={onNotify} />
      </LedgerProvider>
    </MantineProvider>,
  )
  return onNotify
}

beforeEach(() => {
  mocks.create.mockReset()
  mocks.update.mockReset()
  mocks.delete.mockReset()
  mocks.getAll.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('预算写操作（API 模式）', () => {
  it('改限额必须发出 PUT /budgets/:id 请求', async () => {
    mocks.update.mockResolvedValue(success(apiBudget))
    const notify = renderPage()

    fireEvent.click(screen.getByText('餐饮预算'))
    const input = await screen.findByLabelText('调整限额（元）')
    fireEvent.change(input, { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1))
    expect(mocks.update.mock.calls[0][0]).toBe('b1')
    expect(mocks.update.mock.calls[0][1]).toMatchObject({
      amount: 150_000,
      categoryId: 'real-food',
      accountId: 'acc1',
      type: 'expense',
      period: 'monthly',
    })
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('限额调整为'))
  })

  it('新增预算必须发出 POST /budgets 请求，金额与分类按真实口径', async () => {
    mocks.create.mockResolvedValue(success({ ...apiBudget, id: 'b2' }))
    const notify = renderPage()

    fireEvent.click(screen.getByRole('button', { name: '新增' }))

    fireEvent.change(await screen.findByLabelText('名称'), { target: { value: '通勤' } })
    fireEvent.change(screen.getByLabelText('金额（元）'), { target: { value: '1200' } })
    fireEvent.change(screen.getByLabelText('分类'), { target: { value: 'food' } })
    fireEvent.change(screen.getByLabelText('账户'), { target: { value: 'acc1' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      name: '通勤',
      amount: 120_000,
      type: 'expense',
      period: 'monthly',
      categoryId: 'real-food',
      accountId: 'acc1',
    })
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('已新增预算「通勤」'))
  })

  it('未选分类时不得静默成功：不发请求、弹可见错误、表单保留', async () => {
    const notify = renderPage()

    fireEvent.click(screen.getByRole('button', { name: '新增' }))
    fireEvent.change(await screen.findByLabelText('名称'), { target: { value: '通勤' } })
    fireEvent.change(screen.getByLabelText('金额（元）'), { target: { value: '1200' } })
    fireEvent.change(screen.getByLabelText('账户'), { target: { value: 'acc1' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(screen.getByText('真实账本要求预算绑定分类，请选择分类')).toBeInTheDocument(),
    )
    expect(mocks.create).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
    expect(screen.getByLabelText('名称')).toHaveValue('通勤')
  })

  it('请求失败时保留表单与可见错误，且不出现成功提示', async () => {
    mocks.create.mockRejectedValue(new Error('网络错误'))
    const notify = renderPage()

    fireEvent.click(screen.getByRole('button', { name: '新增' }))
    fireEvent.change(await screen.findByLabelText('名称'), { target: { value: '通勤' } })
    fireEvent.change(screen.getByLabelText('金额（元）'), { target: { value: '1200' } })
    fireEvent.change(screen.getByLabelText('分类'), { target: { value: 'food' } })
    fireEvent.change(screen.getByLabelText('账户'), { target: { value: 'acc1' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(screen.getByText(/保存失败/)).toBeInTheDocument())
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(notify).not.toHaveBeenCalled()
    expect(screen.getByLabelText('名称')).toHaveValue('通勤')
  })

  it('删除必须发出 DELETE /budgets/:id，并提供 6 秒撤销动作', async () => {
    mocks.getAll.mockResolvedValue(success([apiBudget]))
    mocks.delete.mockResolvedValue(success({ message: '删除成功' }))
    mocks.create.mockResolvedValue(success(apiBudget))
    const notify = renderPage()

    fireEvent.click(screen.getByText('餐饮预算'))
    fireEvent.click(await screen.findByRole('button', { name: '删除预算条目' }))
    fireEvent.click(screen.getByRole('button', { name: '再次点击确认删除' }))

    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('b1'))
    const toastCall = notify.mock.calls.find(([message]) => message.includes('已删除预算'))
    expect(toastCall).toBeTruthy()
    expect(typeof toastCall?.[1]).toBe('function')

    // 撤销 = 按原 id / 原字段重建，而不是只弹提示。
    await toastCall![1]!()
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b1', name: '餐饮预算', amount: 100_000, accountId: 'acc1' }),
    )
  })
})
