/**
 * 报表未来时间轴（P2）
 *
 * 覆盖：三态判定、12 个自然月上限、未来窗口换算、资产负债未来视图的
 * 「预测」编码（图例首项 / 表头 hint / asOf 虚线 / 悬停与移动端构成）。
 */
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MantineProvider } from '@mantine/core'
import type { AssetProjectionResult } from '@/services/api'
import { FutureBalanceView } from '@/features/reports/FutureBalanceView'
import { TimeBar } from '@/features/reports/TimeBar'
import {
  futureHorizon,
  futureRange,
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

function projectionFixture(): AssetProjectionResult {
  const base = balanceOf(1_000_00, 200_00)
  const point = (label: string, date: string, plannedNet: number, committedNet: number) => ({
    label,
    date,
    actual: base,
    planned: balanceOf(plannedNet, 0),
    committed: balanceOf(committedNet, 0),
    total: balanceOf(1_000_00 + plannedNet + committedNet, 200_00),
    covered: [],
  })
  return {
    asOf: TODAY,
    fromMonth: '2026-12',
    months: 2,
    base,
    points: [
      point('2026-12', '2026-12-31', 50_00, 20_00),
      point('2027-01', '2027-01-31', 80_00, 30_00),
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

  it('未来窗口上限为 asOf 后 12 个自然月的月末', () => {
    expect(futureHorizon(TODAY)).toBe('2027-11-30')
    expect(futureRange(TODAY, 3)).toEqual({ from: '2026-12-01', to: '2027-02-28' })
    expect(futureRange(TODAY, 12)).toEqual({ from: '2026-12-01', to: '2027-11-30' })
  })

  it('日 / 年粒度不能进入未来，月粒度最多 12 个月', () => {
    expect(validateRange('2026-12-01', '2027-01-31', 'month', TODAY).ok).toBe(true)
    expect(validateRange('2026-12-01', '2027-12-31', 'month', TODAY).ok).toBe(false)
    expect(validateRange('2026-11-07', '2026-11-08', 'day', TODAY).ok).toBe(false)
  })
})

describe('未来窗口换算', () => {
  it('本月时点从本月起算，晚于本月从下月起算', () => {
    expect(pointWindow('2026-11-30', TODAY)).toEqual({
      asOf: TODAY,
      fromMonth: '2026-11',
      months: 1,
    })
    expect(pointWindow('2026-12-31', TODAY)).toEqual({
      asOf: TODAY,
      fromMonth: '2026-12',
      months: 1,
    })
    expect(pointWindow('2027-11-30', TODAY).months).toBe(12)
  })

  it('混合期间保留本月剩余日期，全未来从所选首月起', () => {
    expect(periodWindow('2026-11-01', '2027-01-31', TODAY)).toEqual({
      asOf: TODAY,
      fromMonth: '2026-11',
      months: 3,
    })
    expect(periodWindow('2026-12-01', '2027-03-31', TODAY)).toEqual({
      asOf: TODAY,
      fromMonth: '2026-12',
      months: 4,
    })
  })
})

describe('时间条：未来预设与三态标记', () => {
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
        futureEnabled
        onChange={() => undefined}
        onToast={() => undefined}
        onOpenSettings={() => undefined}
      />,
    )
    expect(screen.getByText('全未来')).toBeTruthy()
  })

  it('不支持未来的视图不显示三态标记', () => {
    renderWrapped(
      <TimeBar
        device="desktop"
        tab="invest"
        time={{ ...futureTime, point: TODAY }}
        today={TODAY}
        futureEnabled={false}
        onChange={() => undefined}
        onToast={() => undefined}
        onOpenSettings={() => undefined}
      />,
    )
    expect(screen.queryByText('全未来')).toBeNull()
  })
})

describe('资产负债未来视图：预测编码统一', () => {
  it('图例首项、表头 hint、asOf 虚线来自同一套组件', () => {
    const { container } = renderWrapped(<FutureBalanceView device="desktop" projection={projectionFixture()} />)
    // 图例首项 + 指标 + 行 hint 共用「预测」文字标记。
    expect(screen.getAllByText('预测').length).toBeGreaterThan(2)
    expect(screen.getByText('数据截至 11-06')).toBeTruthy()
    expect(container.querySelector('.mb-rp-predict-asof')).toBeTruthy()
    expect(container.querySelector('.mb-rp-row-hint')).toBeNull()
    expect(screen.getByText('合计（接口）')).toBeTruthy()
  })

  it('桌面悬停显示后端分项构成，不出现前端自算合计', () => {
    renderWrapped(<FutureBalanceView device="desktop" projection={projectionFixture()} />)
    fireEvent.pointerEnter(screen.getByRole('button', { name: /2026-12/ }))
    expect(screen.getByText('2026-12 · 净资产构成')).toBeTruthy()
    // 表头也有「按预算计划」列，这里只要求构成明细里各出现至少一次。
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
