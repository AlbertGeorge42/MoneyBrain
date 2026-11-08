/**
 * 收支未来区间（P5）：只展示预算计划；混合桶分段、不相加。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import type { BudgetPeriodPlanResult } from '@contracts/types'
import { FutureFlowView } from '@/features/reports/FutureFlowView'
import type { FlowReport } from '@/features/reports/reportsModel'

function renderWrapped(node: React.ReactNode) {
  return render(<MantineProvider>{node}</MantineProvider>)
}

function planFixture(): BudgetPeriodPlanResult {
  return {
    asOf: '2026-11-06',
    granularity: 'month',
    start: '2026-11-01',
    end: '2027-01-31',
    bucketCount: 3,
    points: [
      {
        month: '2026-11',
        granularity: 'month',
        label: '2026-11',
        start: '2026-11-01',
        end: '2026-11-30',
        date: '2026-11-30',
        hasBudget: true,
        budgets: [
          { budgetId: 'b-1', budgetName: '房租', type: 'expense', date: '2026-11-03', amount: 1000 },
          { budgetId: 'b-1', budgetName: '房租', type: 'expense', date: '2026-11-20', amount: 2000 },
        ],
        totals: { income: 0, expense: 3000, transfer: 0 },
      },
      {
        month: '2026-12',
        granularity: 'month',
        label: '2026-12',
        start: '2026-12-01',
        end: '2026-12-31',
        date: '2026-12-31',
        hasBudget: true,
        budgets: [
          { budgetId: 'b-2', budgetName: '工资', type: 'income', date: '2026-12-05', amount: 5000 },
        ],
        totals: { income: 5000, expense: 0, transfer: 0 },
      },
      {
        month: '2027-01',
        granularity: 'month',
        label: '2027-01',
        start: '2027-01-01',
        end: '2027-01-31',
        date: '2027-01-31',
        hasBudget: false,
        budgets: [],
        totals: null,
      },
    ],
  }
}

function actualFixture(): FlowReport {
  return {
    income: 8000,
    expense: 2000,
    balance: 6000,
    savingsRate: 0.75,
    incomeTrees: [],
    expenseTrees: [],
    series: [
      { label: '2026-11', income: 8000, expense: 2000 },
      { label: '2026-12', income: 0, expense: 0 },
      { label: '2027-01', income: 0, expense: 0 },
    ],
    metrics: [],
  }
}

afterEach(cleanup)

describe('收支未来区间', () => {
  it('混合桶分段展示已发生与预算计划，剩余日期只取 occurrence', () => {
    renderWrapped(<FutureFlowView device="desktop" plan={planFixture()} actual={actualFixture()} />)

    expect(screen.getByText(/未来收支/)).toBeTruthy()
    expect(screen.getAllByText('预测').length).toBeGreaterThan(0)
    expect(screen.getAllByText('预算计划').length).toBeGreaterThan(0)
    expect(screen.getByText('已发生')).toBeTruthy()

    // 11-03 已过，不再作为剩余预算计划展示；11-20 仍按 occurrence 出桶。
    expect(screen.queryByText('11-03')).toBeNull()
    expect(screen.getByText('11-20')).toBeTruthy()

    // 混合桶不出现桶内合计；只有纯未来桶显示后端合计。
    expect(screen.getAllByText('桶内合计（后端）')).toHaveLength(1)
    expect(screen.queryByText(/真实 \+ 预测/)).toBeNull()
  })

  it('无预算桶显示「未设预算」，不用 0 冒充', () => {
    renderWrapped(<FutureFlowView device="mobile" plan={planFixture()} actual={actualFixture()} />)
    expect(screen.getByText('未设预算')).toBeTruthy()
  })
})
