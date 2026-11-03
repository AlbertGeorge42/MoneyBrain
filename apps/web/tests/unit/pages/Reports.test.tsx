import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import dayjs from 'dayjs'
import type { RangeTimeValue } from '../../../src/utils/timePicker'
import { createPointValue } from '../../../src/utils/timePicker'

// C1 验收：四张报表共享一个全局期间——切换 tab 期间不变，改期间跨 tab 同步。
// UI 语义不统一：资产负债表保持时点控件（时点 ↔ 所在区间在传参处映射），
// 其余三张是期间控件——用「stub 只在收到时点签名 onTimeChange 时渲染标记」做回归断言。

const changedRange: RangeTimeValue = {
  granularity: 'month',
  start: dayjs('2026-09-01'),
  end: dayjs('2026-09-30'),
}

let latestRange: RangeTimeValue | null = null
let latestBalanceRange: RangeTimeValue | null = null

vi.mock('../../../src/components/reports', () => {
  const RangeReportStub = ({ timeRange, onTimeRangeChange }: { timeRange: RangeTimeValue; onTimeRangeChange: (v: RangeTimeValue) => void }) => {
    latestRange = timeRange
    return (
      <div>
        <span data-testid="report-range">{JSON.stringify(timeRange)}</span>
        <button type="button" data-testid="change-range" onClick={() => onTimeRangeChange(changedRange)}>
          change
        </button>
      </div>
    )
  }
  const BalanceSheetStub = ({
    timeRange,
    onTimeChange,
  }: {
    timeRange: RangeTimeValue
    onTimeChange?: (v: ReturnType<typeof createPointValue>) => void
  }) => {
    latestBalanceRange = timeRange
    return (
      <div>
        {/* 回归标记：只有时点签名（onTimeChange）才会渲染——防止控件再被"顺手统一"成区间 */}
        {onTimeChange && <span data-testid="balance-point-picker" />}
        <button
          type="button"
          data-testid="set-balance-point"
          onClick={() => onTimeChange?.(createPointValue('month', dayjs('2026-10-15')))}
        >
          set-point
        </button>
      </div>
    )
  }
  return {
    BalanceSheetReport: BalanceSheetStub,
    IncomeExpenseReport: RangeReportStub,
    CashFlowReport: RangeReportStub,
    InvestmentAnalysisReport: RangeReportStub,
  }
})

vi.mock('../../../src/components/settings', () => ({
  AccountConfigModal: () => null,
  TransactionConfigModal: () => null,
  CashFlowConfigModal: () => null,
}))
vi.mock('../../../src/components/investment/InvestmentAssetClassConfigModal', () => ({
  default: () => null,
}))

const queryResult = { data: null, isLoading: false, isError: false, refetch: vi.fn() }
vi.mock('../../../src/queries', () => ({
  useTransactionEarliestDate: vi.fn(() => ({ data: null })),
  useBalanceSheet: vi.fn(() => queryResult),
  useIncomeExpense: vi.fn(() => queryResult),
  useCashFlow: vi.fn(() => queryResult),
  useInvestmentAnalysis: vi.fn(() => queryResult),
}))

const { default: Reports } = await import('../../../src/pages/Reports')

const switchTab = (label: string) => {
  fireEvent.click(screen.getByRole('tab', { name: label }))
}

describe('C1 报表共享全局期间', () => {
  beforeEach(() => {
    window.localStorage.clear()
    latestRange = null
    latestBalanceRange = null
  })

  it('四张报表拿到的是同一个期间；资产负债表保持时点语义控件', () => {
    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    )
    // 资产负债表（时点 stub）记录在 latestBalanceRange，其余三张记录在 latestRange
    const received = (label: string) => (label === '资产负债表' ? latestBalanceRange : latestRange)
    for (const label of ['资产负债表', '收入支出表', '现金流量表', '投资分析表']) {
      switchTab(label)
      expect(received(label)).not.toBeNull()
    }
    // 默认期间：本月
    expect(JSON.stringify(latestRange)).toContain(String(dayjs().year()))
    // 资产负债表的控件是时点签名（onTimeChange），不是区间 onTimeRangeChange
    expect(screen.getByTestId('balance-point-picker')).toBeTruthy()
  })

  it('切换 tab 期间不变；在一张报表改期间后其它报表同步', () => {
    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    )

    // 在期间报表（收入支出表）改期间；antd Tabs 渲染全部面板，区间 stub 共 3 个，取第一个
    fireEvent.click(screen.getAllByTestId('change-range')[0])
    expect(latestRange!.end.isSame(changedRange.end, 'day')).toBe(true)

    // 切到其余报表：期间保持改后的值，不被各报表的默认值重置
    for (const label of ['现金流量表', '投资分析表', '资产负债表']) {
      switchTab(label)
      if (latestRange) {
        expect(latestRange.start.isSame(changedRange.start, 'day')).toBe(true)
        expect(latestRange.end.isSame(changedRange.end, 'day')).toBe(true)
      }
    }
    // 资产负债表拿到的共享期间（区间终点 = 它显示的期末时点）同样未被重置
    expect(latestBalanceRange!.end.isSame(changedRange.end, 'day')).toBe(true)

    // 切回收入支出表，期间仍是改后的值
    switchTab('收入支出表')
    expect(latestRange!.end.isSame(changedRange.end, 'day')).toBe(true)
  })

  it('资产负债表选时点 → 映射为所在区间写回共享期间，其它报表同步', () => {
    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    )

    // 在资产负债表选「2026-10-15」所在的月份时点 → 共享期间应为 10 月整月
    fireEvent.click(screen.getByTestId('set-balance-point'))
    expect(latestBalanceRange!.start.isSame(dayjs('2026-10-01'), 'day')).toBe(true)
    expect(latestBalanceRange!.end.isSame(dayjs('2026-10-31'), 'day')).toBe(true)

    // 切到现金流量表：同一期间，无重置
    switchTab('现金流量表')
    expect(latestRange!.start.isSame(dayjs('2026-10-01'), 'day')).toBe(true)
    expect(latestRange!.end.isSame(dayjs('2026-10-31'), 'day')).toBe(true)
  })
})
