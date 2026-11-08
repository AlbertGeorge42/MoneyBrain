/**
 * 预算编辑器：daily 周期与 transactionTime 输入（阶段 A）
 *
 * 后端按 `period + transactionTime` 展开推演点位，编辑器必须能配置这两个字段：
 * - daily 不显示发生日，请求体不带 transactionTime；
 * - weekly/monthly 只能取合法范围（0=周一…6=周日 / 1–31 号）；
 * - quarterly/yearly 天偏移越界时在提交前拦下，不发请求；
 * - 详情抽屉按周期语义展示发生日（不做前端日期换算）。
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
  getStatuses: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  budgetApi: {
    create: mocks.create,
    update: mocks.update,
    delete: mocks.delete,
    getAll: mocks.getAll,
    getStatuses: mocks.getStatuses,
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
  transactionTime: 5,
  note: null,
  isActive: true,
  accountId: 'acc1',
  toAccountId: null,
  categoryId: 'real-food',
}

const ledger: Ledger = {
  accounts: [
    { id: 'acc1', name: '钱包', kind: 'cash', balance: 100_000 },
  ],
  categories: [{ id: 'food', name: '餐饮', type: 'expense' }],
  budgets: [
    {
      id: 'b1',
      name: '餐饮预算',
      type: 'expense',
      period: 'monthly',
      limit: 100_000,
      categoryId: 'food',
      accountId: 'acc1',
      transactionTime: 5,
    },
  ],
  transactions: [],
  ids: {
    categoryReal: { food: 'real-food' },
    categoryDisplay: { 'real-food': 'food' },
  },
}

const success = (data: unknown) => ({ data: { success: true, data } })

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <BudgetPage
      device="desktop"
      dataState="normal"
      editorOpen={open}
      onEditorOpenChange={setOpen}
      onRetry={() => {}}
      onViewFlow={() => {}}
      notify={() => {}}
    />
  )
}

function renderPage() {
  render(
    <MantineProvider>
      <LedgerProvider initialLedger={ledger} dataMode="api">
        <Harness />
      </LedgerProvider>
    </MantineProvider>,
  )
}

async function fillRequired() {
  fireEvent.change(await screen.findByLabelText('名称'), { target: { value: '通勤' } })
  fireEvent.change(screen.getByLabelText('金额（元）'), { target: { value: '1200' } })
  fireEvent.change(screen.getByLabelText('分类'), { target: { value: 'food' } })
  fireEvent.change(screen.getByLabelText('账户'), { target: { value: 'acc1' } })
}

beforeEach(() => {
  mocks.create.mockReset()
  mocks.update.mockReset()
  mocks.delete.mockReset()
  mocks.getAll.mockReset()
  mocks.getStatuses.mockReset()
  mocks.getStatuses.mockResolvedValue(success([]))
  mocks.create.mockResolvedValue(success({ ...apiBudget, id: 'b2' }))
})

afterEach(() => {
  cleanup()
})

describe('预算编辑器：daily 与 transactionTime', () => {
  it('选每日：请求体 period=daily 且不携带 transactionTime', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '新增' }))
    fireEvent.click(await screen.findByRole('button', { name: '每日' }))
    expect(screen.queryByLabelText(/发生日/)).toBeNull()
    expect(screen.getByText('每日预算按日历日展开，无需设置发生日。')).toBeInTheDocument()

    await fillRequired()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ period: 'daily' })
    expect(mocks.create.mock.calls[0][0].transactionTime).toBeUndefined()
  })

  it('选每月 5 号：请求体 transactionTime=5', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '新增' }))
    fireEvent.change(await screen.findByLabelText('发生日（每月几号）'), { target: { value: '5' } })

    await fillRequired()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ period: 'monthly', transactionTime: 5 })
  })

  it('选每周周一：请求体 transactionTime=0（0 不能被当作空值丢掉）', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '新增' }))
    fireEvent.click(await screen.findByRole('button', { name: '每周' }))
    fireEvent.change(screen.getByLabelText('发生日（周几）'), { target: { value: '0' } })

    await fillRequired()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ period: 'weekly', transactionTime: 0 })
  })

  it('年度天偏移越界：提交前报错且不发请求', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '新增' }))
    fireEvent.click(await screen.findByRole('button', { name: '每年' }))
    fireEvent.change(screen.getByLabelText('发生日（年度内第几天）'), { target: { value: '366' } })

    await fillRequired()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('年度内天数需为 0–365 的整数')).toBeInTheDocument()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('详情抽屉展示后端发生日，不在前端做日期换算', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('餐饮预算'))
    expect(await screen.findByText('每月 5 号')).toBeInTheDocument()
  })
})
