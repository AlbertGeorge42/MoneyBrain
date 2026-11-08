/**
 * 预算推演接线（阶段 B）
 *
 * 覆盖：三端点取数与 fromMonth 对齐、切 tab 不重复请求、跨挂载缓存复用、
 * 月度缺口、整段无预算空态、请求失败重试、covered 仅解释、移动端点按开明细。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { MantineProvider } from '@mantine/core'
import { LedgerProvider } from '@/features/overview/LedgerContext'
import { BudgetPage } from '@/features/budgets/BudgetPage'
import type { AssetProjectionResult, BudgetPeriodPlanResult, CashFlowProjectionResult } from '@contracts/types'
import type { Ledger } from '@/features/overview/model'

const mocks = vi.hoisted(() => ({
  asset: vi.fn(),
  cash: vi.fn(),
  plan: vi.fn(),
  getStatuses: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getAll: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  analyticsApi: { getAssetProjection: mocks.asset },
  reportApi: { getCashFlowProjection: mocks.cash },
  budgetApi: {
    getPeriodPlan: mocks.plan,
    getStatuses: mocks.getStatuses,
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

const success = (data: unknown) => ({ data: { success: true, data } })

const LABELS = ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']

function balance(netWorth: number) {
  return { assets: netWorth, liabilities: 0, netWorth }
}

function cashFlow(actual: number, planned: number, committed: number, total: number) {
  return { actual, planned, committed, total }
}

function assetResult(): AssetProjectionResult {
  return {
    asOf: '2026-11-08',
    months: 6,
    base: balance(200_000),
    points: LABELS.map((label) => ({
      label,
      date: `${label}-28`,
      actual: balance(200_000),
      planned: balance(30_000),
      committed: balance(10_000),
      total: balance(240_000),
      covered: [],
    })),
  }
}

function cashResult(): CashFlowProjectionResult {
  return {
    asOf: '2026-11-08',
    months: 6,
    startCash: 100_000,
    endCash: 160_000,
    points: LABELS.map((label, index) => ({
      label,
      date: `${label}-28`,
      inflow: cashFlow(1_000, 200, 300, 1_500),
      outflow: cashFlow(500, 100, 50, 650),
      net: cashFlow(500, 100, 250, 850),
      startCash: 100_000,
      endCash: 100_000 + index * 10_000,
      covered:
        index === 0
          ? [
              {
                budgetId: 'b1',
                budgetName: '餐饮预算',
                type: 'expense' as const,
                date: '2026-11-05',
                amount: 20_000,
                transactionId: 'tx1',
                transactionDate: '2026-11-05',
              },
            ]
          : [],
    })),
  }
}

/** 默认每月都有预算；`gapMonth` 置为未设预算。 */
function planResult(gapMonth?: string): BudgetPeriodPlanResult {
  return {
    fromMonth: '2026-11',
    months: 6,
    points: LABELS.map((month) => ({
      month,
      hasBudget: month !== gapMonth,
      budgets: [],
      totals:
        month === gapMonth
          ? null
          : { income: 0, expense: 100_000, transfer: 0 },
    })),
  }
}

function makeLedger(today: string, id = 'b1'): Ledger {
  return {
    accounts: [{ id: 'acc1', name: '钱包', kind: 'cash', balance: 100_000 }],
    categories: [{ id: 'food', name: '餐饮', type: 'expense' }],
    budgets: [
      {
        id,
        name: '餐饮预算',
        type: 'expense',
        period: 'monthly',
        limit: 100_000,
        categoryId: 'food',
        accountId: 'acc1',
        transactionTime: 5,
        isActive: true,
      },
    ],
    transactions: [],
    snapshot: { today },
    ids: { categoryReal: { food: 'real-food' }, categoryDisplay: { 'real-food': 'food' } },
  } as Ledger
}

function Harness({ ledger, device = 'desktop' }: { ledger: Ledger; device?: 'desktop' | 'mobile' }) {
  const [open, setOpen] = useState(false)
  return (
    <MantineProvider>
      <LedgerProvider initialLedger={ledger} dataMode="api">
        <BudgetPage
          device={device}
          dataState="normal"
          editorOpen={open}
          onEditorOpenChange={setOpen}
          onRetry={() => {}}
          onViewFlow={() => {}}
          notify={() => {}}
        />
      </LedgerProvider>
    </MantineProvider>
  )
}

function renderPage(ledger: Ledger, device: 'desktop' | 'mobile' = 'desktop') {
  return render(<Harness ledger={ledger} device={device} />)
}

beforeEach(() => {
  mocks.asset.mockReset()
  mocks.cash.mockReset()
  mocks.plan.mockReset()
  mocks.getStatuses.mockReset()
  mocks.getStatuses.mockResolvedValue(success([]))
  mocks.asset.mockResolvedValue(success(assetResult()))
  mocks.cash.mockResolvedValue(success(cashResult()))
  mocks.plan.mockResolvedValue(success(planResult('2027-02')))
})

afterEach(() => {
  cleanup()
})

describe('预算页推演面板', () => {
  it('三端点按 months=6 取数，fromMonth 取投影首个 label', async () => {
    renderPage(makeLedger('2026-11-08'))
    expect(await screen.findByText('预算推演')).toBeInTheDocument()

    await waitFor(() => expect(mocks.plan).toHaveBeenCalledTimes(1))
    expect(mocks.asset).toHaveBeenCalledWith(6, '2026-11-08')
    expect(mocks.cash).toHaveBeenCalledWith(6, '2026-11-08')
    expect(mocks.plan).toHaveBeenCalledWith('2026-11', 6)
    expect(screen.getByText(/起点现金 ¥1,000\.00/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '未来现金流推演图' })).toBeInTheDocument()
  })

  it('切 tab 与切范围不重复请求同一份数据', async () => {
    renderPage(makeLedger('2026-11-09'))
    expect(await screen.findByRole('img', { name: '未来现金流推演图' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '资产' }))
    expect(await screen.findByRole('img', { name: '未来净资产推演图' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '现金流' }))

    expect(mocks.asset).toHaveBeenCalledTimes(1)
    expect(mocks.cash).toHaveBeenCalledTimes(1)
    expect(mocks.plan).toHaveBeenCalledTimes(1)
  })

  it('重新挂载（切页面）复用缓存，不再请求', async () => {
    const ledger = makeLedger('2026-11-10')
    const first = renderPage(ledger)
    await waitFor(() => expect(mocks.plan).toHaveBeenCalledTimes(1))
    first.unmount()

    renderPage(ledger)
    expect(await screen.findByText('预算推演')).toBeInTheDocument()
    expect(mocks.asset).toHaveBeenCalledTimes(1)
    expect(mocks.cash).toHaveBeenCalledTimes(1)
    expect(mocks.plan).toHaveBeenCalledTimes(1)
  })

  it('单月无预算：画灰色短横线缺口，不画该月计划柱', async () => {
    const { container } = renderPage(makeLedger('2026-11-11'))
    expect(await screen.findByRole('img', { name: '未来现金流推演图' })).toBeInTheDocument()

    expect(container.querySelectorAll('.mb-fc-gap')).toHaveLength(1)
    expect(container.querySelectorAll('.mb-fc-gap-label')).toHaveLength(1)
  })

  it('整段无预算：空态提示设置预算，不渲染图表', async () => {
    mocks.plan.mockResolvedValue({
      data: {
        success: true,
        data: {
          fromMonth: '2026-11',
          months: 6,
          points: LABELS.map((month) => ({ month, hasBudget: false, budgets: [], totals: null })),
        },
      },
    })
    renderPage(makeLedger('2026-11-12'))

    expect(await screen.findByText('设置预算后查看未来现金流与资产')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: '未来现金流推演图' })).toBeNull()
    expect(screen.getByRole('button', { name: '新增预算' })).toBeInTheDocument()
  })

  it('请求失败显示错误并可重试；重试后正常渲染', async () => {
    mocks.asset.mockRejectedValueOnce(new Error('网络错误'))
    renderPage(makeLedger('2026-11-13'))

    expect(await screen.findByText('推演数据加载失败')).toBeInTheDocument()
    expect(screen.getByText('网络错误')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('img', { name: '未来现金流推演图' })).toBeInTheDocument()
  })

  it('covered 只解释不参与计算：接口合计保持后端值', async () => {
    renderPage(makeLedger('2026-11-14'))

    expect(await screen.findByText('本月这笔已按真实交易计入，不重复推算')).toBeInTheDocument()
    expect(
      screen.getByText(/餐饮预算 · 预算日 2026-11-05 · 真实交易 2026-11-05 · 被剔除计划金额 ¥200\.00/),
    ).toBeInTheDocument()
    // 首月流入接口合计仍是后端给的 ¥15.00，没有被 covered 改写成其它数字。
    expect(screen.getAllByText('接口合计 ¥15.00').length).toBeGreaterThan(0)
  })

  it('移动端点按月份打开底部明细', async () => {
    renderPage(makeLedger('2026-11-15'), 'mobile')

    fireEvent.click(await screen.findByRole('button', { name: '11月明细' }))
    expect(await screen.findByText('推演明细')).toBeInTheDocument()
    expect(screen.getByText('期初现金')).toBeInTheDocument()
  })
})
