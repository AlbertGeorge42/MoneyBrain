/**
 * 报表未来时间轴（P2 / P4）
 *
 * 覆盖：三态判定、四粒度未来上限、按粒度换算的取数窗口、
 * 时间条统一未来（无视图级禁用）、资产负债与现金流未来视图的桶渲染与「预测」编码。
 */
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MantineProvider } from '@mantine/core'
import type { AssetProjectionResult, CashFlowProjectionResult } from '@/services/api'
import { FutureBalanceView } from '@/features/reports/FutureBalanceView'
import { FutureCashView } from '@/features/reports/FutureCashView'
import { TimeBar } from '@/features/reports/TimeBar'
import {
  futureHorizon,
  futureRange,
  listBuckets,
  pointRangeState,
  rangeState,
  validateRange,
  type ReportTime,
} from '@/features/reports/reportsTime'
import { periodWindow, pointWindow } from '@/features/reports/futureModel'

const TODAY = '2026-11-06'

function renderWrapped(node: ReactNode) {
  return render(<MantineProvider>{node}</MantineProvider>)
}

function balanceOf(assets: number, liabilities: number) {
  return { assets, liabilities, netWorth: assets - liabilities }
}

function assetPoint(
  label: string,
  start: string,
  end: string,
  plannedNet: number,
  committedNet: number,
) {
  const base = balanceOf(1_000_00, 200_00)
  return {
    granularity: 'month' as const,
    label,
    start,
    end,
    date: end,
    actual: base,
    planned: balanceOf(plannedNet, 0),
    committed: balanceOf(committedNet, 0),
    total: balanceOf(1_000_00 + plannedNet + committedNet, 200_00),
    covered: [],
  }
}

function projectionFixture(): AssetProjectionResult {
  return {
    asOf: TODAY,
    granularity: 'month',
    start: '2026-12-01',
    end: '2027-01-31',
    bucketCount: 2,
    base: balanceOf(1_000_00, 200_00),
    points: [
      assetPoint('2026-12', '2026-12-01', '2026-12-31', 50_00, 20_00),
      assetPoint('2027-01', '2027-01-01', '2027-01-31', 80_00, 30_00),
    ],
    months: 2,
  }
}

/** 混合区间：asOf 落在 11 月桶内，9 / 10 月为已发生桶。 */
function mixedProjectionFixture(): AssetProjectionResult {
  return {
    asOf: TODAY,
    granularity: 'month',
    start: '2026-09-01',
    end: '2026-12-31',
    bucketCount: 4,
    base: balanceOf(1_000_00, 200_00),
    points: [
      assetPoint('2026-09', '2026-09-01', '2026-09-30', 0, 0),
      assetPoint('2026-10', '2026-10-01', '2026-10-31', 0, 0),
      assetPoint('2026-11', '2026-11-01', '2026-11-30', 40_00, 10_00),
      assetPoint('2026-12', '2026-12-01', '2026-12-31', 60_00, 20_00),
    ],
  }
}

function flowOf(actual: number, planned: number, committed: number) {
  return { actual, planned, committed, total: actual + planned + committed }
}

function cashFixture(): CashFlowProjectionResult {
  return {
    asOf: TODAY,
    granularity: 'month',
    start: '2026-11-01',
    end: '2027-01-31',
    bucketCount: 3,
    startCash: 500_000,
    points: [
      {
        granularity: 'month',
        label: '2026-11',
        start: '2026-11-01',
        end: '2026-11-30',
        date: '2026-11-30',
        inflow: flowOf(10_00, 20_00, 0),
        outflow: flowOf(5_00, 0, 0),
        net: flowOf(5_00, 20_00, 0),
        startCash: 500_000,
        endCash: 525_000,
        covered: [
          {
            budgetId: 'b1',
            budgetName: '房租',
            type: 'expense',
            date: '2026-11-05',
            amount: 5_00,
            transactionId: 't1',
            transactionDate: '2026-11-05',
          },
        ],
      },
      {
        granularity: 'month',
        label: '2026-12',
        start: '2026-12-01',
        end: '2026-12-31',
        date: '2026-12-31',
        inflow: flowOf(0, 50_00, 0),
        outflow: flowOf(0, 30_00, 0),
        net: flowOf(0, 20_00, 0),
        startCash: 525_000,
        endCash: 545_000,
        covered: [],
      },
      {
        granularity: 'month',
        label: '2027-01',
        start: '2027-01-01',
        end: '2027-01-31',
        date: '2027-01-31',
        inflow: flowOf(0, 40_00, 0),
        outflow: flowOf(0, 10_00, 0),
        net: flowOf(0, 30_00, 0),
        startCash: 545_000,
        endCash: 575_000,
        covered: [],
      },
    ],
  }
}

describe('未来时间轴：三态与上限', () => {
  it('已发生 / 混合 / 全未来按今天判定', () => {
    expect(rangeState('2026-10-01', '2026-11-06', TODAY)).toBe('past')
    expect(rangeState('2026-11-01', '2026-11-30', TODAY)).toBe('mixed')
    expect(rangeState('2026-12-01', '2027-01-31', TODAY)).toBe('future')
    expect(pointRangeState('2026-11-30', TODAY, 'month')).toBe('mixed')
    expect(pointRangeState('2026-12-31', TODAY, 'month')).toBe('future')
  })

  it('四粒度未来上限按后端规则：日 3 月 / 周 6 月 / 月 12 月 / 年 3 年', () => {
    expect(futureHorizon(TODAY, 'day')).toBe('2027-02-06')
    expect(futureHorizon(TODAY, 'week')).toBe('2027-05-06')
    expect(futureHorizon(TODAY, 'month')).toBe('2027-11-30')
    expect(futureHorizon(TODAY, 'year')).toBe('2029-12-31')
    expect(futureRange(TODAY, 3)).toEqual({ from: '2026-12-01', to: '2027-02-28' })
    expect(futureRange(TODAY, 12)).toEqual({ from: '2026-12-01', to: '2027-11-30' })
  })

  it('四种粒度都允许未来，各自按上限校验', () => {
    expect(validateRange('2026-11-07', '2027-02-06', 'day', TODAY).ok).toBe(true)
    expect(validateRange('2026-11-07', '2027-02-07', 'day', TODAY).ok).toBe(false)
    expect(validateRange('2026-11-09', '2027-05-06', 'week', TODAY).ok).toBe(true)
    expect(validateRange('2026-11-09', '2027-05-08', 'week', TODAY).ok).toBe(false)
    expect(validateRange('2026-12-01', '2027-01-31', 'month', TODAY).ok).toBe(true)
    expect(validateRange('2026-12-01', '2027-12-31', 'month', TODAY).ok).toBe(false)
    expect(validateRange('2027-01-01', '2029-12-31', 'year', TODAY).ok).toBe(true)
    expect(validateRange('2027-01-01', '2030-01-01', 'year', TODAY).ok).toBe(false)
  })

  it('周桶按 ISO 周一切分并输出 YYYY-Www 标签', () => {
    expect(listBuckets('2026-11-06', '2026-11-20', 'week')).toEqual([
      { key: '2026-11-02', label: '2026-W45', from: '2026-11-02', to: '2026-11-08' },
      { key: '2026-11-09', label: '2026-W46', from: '2026-11-09', to: '2026-11-15' },
      { key: '2026-11-16', label: '2026-W47', from: '2026-11-16', to: '2026-11-22' },
    ])
  })
})

describe('未来窗口换算：按当前粒度', () => {
  it('资产负债时点从今天所在桶起算，止于所选桶末', () => {
    expect(pointWindow('2026-11-30', TODAY, 'month')).toEqual({
      asOf: TODAY,
      granularity: 'month',
      from: '2026-11-01',
      to: '2026-11-30',
    })
    expect(pointWindow('2026-12-31', TODAY, 'month')).toEqual({
      asOf: TODAY,
      granularity: 'month',
      from: '2026-11-01',
      to: '2026-12-31',
    })
    expect(pointWindow('2026-11-07', TODAY, 'day')).toEqual({
      asOf: TODAY,
      granularity: 'day',
      from: '2026-11-06',
      to: '2026-11-07',
    })
    expect(pointWindow('2026-11-08', TODAY, 'week')).toEqual({
      asOf: TODAY,
      granularity: 'week',
      from: '2026-11-02',
      to: '2026-11-08',
    })
    expect(pointWindow('2029-12-31', TODAY, 'year')).toEqual({
      asOf: TODAY,
      granularity: 'year',
      from: '2026-01-01',
      to: '2029-12-31',
    })
  })

  it('期间窗口保留用户 from，止对齐到当前粒度桶末', () => {
    expect(periodWindow('2026-11-01', '2027-01-31', TODAY, 'month')).toEqual({
      asOf: TODAY,
      granularity: 'month',
      from: '2026-11-01',
      to: '2027-01-31',
    })
    expect(periodWindow('2026-12-01', '2027-03-31', TODAY, 'month')).toEqual({
      asOf: TODAY,
      granularity: 'month',
      from: '2026-12-01',
      to: '2027-03-31',
    })
    expect(periodWindow('2026-11-02', '2026-11-15', TODAY, 'week')).toEqual({
      asOf: TODAY,
      granularity: 'week',
      from: '2026-11-02',
      to: '2026-11-15',
    })
    expect(periodWindow('2026-11-06', '2026-11-20', TODAY, 'day')).toEqual({
      asOf: TODAY,
      granularity: 'day',
      from: '2026-11-06',
      to: '2026-11-20',
    })
  })
})

describe('时间条：未来统一、无视图级禁用', () => {
  const futureTime: ReportTime = {
    gran: 'month',
    point: '2026-12-31',
    from: '2026-12-01',
    to: '2026-12-31',
    preset: 'nextMonth',
  }

  it('月粒度未来区间显示「全未来」状态', () => {
    renderWrapped(
      <TimeBar
        device="desktop"
        tab="balance"
        time={futureTime}
        today={TODAY}
        onChange={() => undefined}
        onToast={() => undefined}
        onOpenSettings={() => undefined}
      />,
    )
    expect(screen.getByText('全未来')).toBeTruthy()
    expect(screen.getByText('周')).toBeTruthy()
  })

  it('三态标记对所有视图常驻，不再按视图隐藏', () => {
    renderWrapped(
      <TimeBar
        device="desktop"
        tab="invest"
        time={futureTime}
        today={TODAY}
        onChange={() => undefined}
        onToast={() => undefined}
        onOpenSettings={() => undefined}
      />,
    )
    expect(screen.getByText('全未来')).toBeTruthy()
  })
})

describe('资产负债未来视图：按桶渲染与预测编码', () => {
  it('图例首项、表头 hint、桶末标签来自同一套组件', () => {
    const { container } = renderWrapped(
      <FutureBalanceView device="desktop" projection={projectionFixture()} />,
    )
    expect(screen.getAllByText('预测').length).toBeGreaterThan(2)
    expect(container.querySelectorAll('.mb-rp-predict-line').length).toBe(1)
    expect(container.querySelectorAll('.mb-rp-predict-dot').length).toBe(2)
    expect(screen.getByText('合计（接口）')).toBeTruthy()
    expect(screen.getByText('月桶')).toBeTruthy()
  })

  it('混合区间在 asOf 处画竖线，并区分已发生段与预测段', () => {
    const { container } = renderWrapped(
      <FutureBalanceView device="desktop" projection={mixedProjectionFixture()} />,
    )
    expect(screen.getByText('数据截至 11-06')).toBeTruthy()
    expect(container.querySelector('.mb-rp-predict-asof')).toBeTruthy()
    expect(container.querySelector('.mb-rp-predict-line.is-actual')).toBeTruthy()
    expect(container.querySelectorAll('.mb-rp-predict-dot.is-actual').length).toBe(2)
    expect(container.querySelectorAll('.mb-rp-predict-dot:not(.is-actual)').length).toBe(2)
  })

  it('桌面悬停显示后端分项构成，不出现前端自算合计', () => {
    renderWrapped(<FutureBalanceView device="desktop" projection={projectionFixture()} />)
    fireEvent.pointerEnter(screen.getByRole('button', { name: /2026-12/ }))
    expect(screen.getByText('2026-12 · 净资产构成')).toBeTruthy()
    expect(screen.getAllByText('按预算计划').length).toBeGreaterThan(0)
    expect(screen.getAllByText('已排定').length).toBeGreaterThan(0)
    expect(screen.getAllByText('接口合计').length).toBeGreaterThan(0)
  })

  it('移动端点按打开同一份构成明细', async () => {
    renderWrapped(<FutureBalanceView device="mobile" projection={projectionFixture()} />)
    fireEvent.click(screen.getByRole('button', { name: /2026-12/ }))
    expect(await screen.findByText('2026-12 · 预测构成')).toBeTruthy()
  })
})

describe('现金流未来视图：逐桶柱 + 期末现金线', () => {
  it('柱按桶渲染，期末现金线在 asOf 后切换为虚线', () => {
    const { container } = renderWrapped(<FutureCashView device="desktop" projection={cashFixture()} />)
    expect(container.querySelectorAll('.mb-rp-predict-bar').length).toBe(6)
    expect(container.querySelector('.mb-rp-predict-cashline.is-predicted')).toBeTruthy()
    expect(container.querySelector('.mb-rp-predict-asof')).toBeTruthy()
    expect(screen.getByText('数据截至 11-06')).toBeTruthy()
    expect(screen.getByText('月桶')).toBeTruthy()
  })

  it('明细直接展示 startCash / endCash 与三项流量合计', () => {
    renderWrapped(<FutureCashView device="desktop" projection={cashFixture()} />)
    expect(screen.getAllByText('期初现金').length).toBeGreaterThan(0)
    expect(screen.getAllByText('期末现金').length).toBeGreaterThan(0)
    expect(screen.getByText('流入')).toBeTruthy()
    expect(screen.getByText('流出')).toBeTruthy()
    fireEvent.pointerEnter(screen.getByRole('button', { name: /2026-11/ }))
    expect(screen.getByText('2026-11 · 现金流构成')).toBeTruthy()
    expect(screen.getAllByText('流入 · 接口合计').length).toBeGreaterThan(0)
    expect(screen.getAllByText('期末现金').length).toBeGreaterThan(1)
  })

  it('covered 只做解释，不参与金额', () => {
    renderWrapped(<FutureCashView device="desktop" projection={cashFixture()} />)
    fireEvent.pointerEnter(screen.getByRole('button', { name: /2026-11/ }))
    expect(screen.getByText(/房租/)).toBeTruthy()
    expect(screen.getByText(/金额只计已排定/)).toBeTruthy()
  })

  it('移动端点按打开同一份构成明细', async () => {
    renderWrapped(<FutureCashView device="mobile" projection={cashFixture()} />)
    fireEvent.click(screen.getByRole('button', { name: /2026-11/ }))
    expect(await screen.findByText('2026-11 · 预测构成')).toBeTruthy()
  })
})
