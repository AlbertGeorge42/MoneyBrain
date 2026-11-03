import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import dayjs from 'dayjs'
import type { PointTimePickerConfig, RangeTimeValue } from '../../../src/components/common'

// C1 口径回归：资产负债表的余额类指标名带「期末」（期末余额 / 期末净资产 / 期末总资产 / 期末总负债），
// 不再出现「时点口径 · 余额快照」小字，时间控件正常显示所选时点（无前缀）。

vi.mock('../../../src/components/reports/ReportDetailList', () => ({
  ReportDetailList: ({ config }: { config: { columns: Array<{ key: string; title?: string }> } }) => (
    <div>
      {config.columns
        .filter((column) => column.title)
        .map((column) => (
          <span key={column.key} data-testid={`column-title-${column.key}`}>
            {column.title}
          </span>
        ))}
    </div>
  ),
}))
vi.mock('../../../src/components/reports/PredictionStatistic', () => ({
  PredictionStatistic: ({ title }: { title: string }) => <div>{title}</div>,
}))
vi.mock('../../../src/components/charts', () => ({
  PieChart: () => null,
}))
vi.mock('../../../src/components/transactions', () => ({
  TransactionDrawer: () => null,
}))

const { ThemeProvider } = await import('../../../src/styles/ThemeContext')
const { default: BalanceSheetReport } = await import('../../../src/components/reports/BalanceSheetReport')

const timeRange: RangeTimeValue = {
  granularity: 'month',
  start: dayjs('2026-10-01'),
  end: dayjs('2026-10-31'),
}

const pickerConfig: PointTimePickerConfig = {
  label: '时点',
  allowedGranularities: ['day', 'month', 'year'],
  presets: {},
}

describe('BalanceSheetReport 期末口径命名（C1）', () => {
  it('余额类指标名带「期末」；不再渲染「时点口径 · 余额快照」小字', () => {
    render(
      <ThemeProvider>
        <BalanceSheetReport
          timeRange={timeRange}
          pickerConfig={pickerConfig}
          balanceSheetData={null}
          loading={false}
          onTimeChange={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      </ThemeProvider>
    )

    // 列名与卡片标题都用期末口径
    expect(screen.getByTestId('column-title-amount').textContent).toBe('期末余额')
    expect(screen.getByText('期末净资产')).toBeTruthy()
    expect(screen.getByText('期末总资产')).toBeTruthy()
    expect(screen.getByText('期末总负债')).toBeTruthy()

    // 没有引入期初（单组存量值），也没有旧的小字提示
    expect(screen.queryByText(/期初/)).toBeNull()
    expect(screen.queryByText(/时点口径/)).toBeNull()
    expect(screen.queryByText(/余额快照/)).toBeNull()
  })
})
