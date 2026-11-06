/**
 * 统一日期选择器：纯函数语义 + 组件交互（预设 / 反选交换 / 禁用原因 / 留空不限 / 键盘与焦点）。
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { DatePicker } from '@/features/shared/datePicker/DatePicker'
import {
  addMonths,
  calendarCells,
  datePresets,
  isValidISODate,
  normalizeRange,
  snapDay,
} from '@/features/shared/datePicker/datePickerModel'

function renderPicker(props: Partial<React.ComponentProps<typeof DatePicker>> = {}) {
  const onChange = vi.fn()
  render(
    <MantineProvider>
      <DatePicker
        device="desktop"
        value={{ from: '2026-10-01', to: '2026-10-31' }}
        onChange={onChange}
        today="2026-11-06"
        sheetTitle="选择日期"
        {...props}
      />
    </MantineProvider>,
  )
  return { onChange }
}

describe('datePickerModel', () => {
  it('区间反选自动交换', () => {
    expect(normalizeRange('2026-10-10', '2026-10-01')).toEqual({
      range: { from: '2026-10-01', to: '2026-10-10' },
      swapped: true,
    })
    expect(normalizeRange('2026-10-01', '2026-10-10').swapped).toBe(false)
  })

  it('加月保持同日，目标月无该日时取月末', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-11-06', -3)).toBe('2026-08-06')
  })

  it('月 / 年粒度边界吸附', () => {
    expect(snapDay('2026-10-15', 'month', 'start')).toBe('2026-10-01')
    expect(snapDay('2026-10-15', 'month', 'end')).toBe('2026-10-31')
    expect(snapDay('2026-10-15', 'year', 'start')).toBe('2026-01-01')
    expect(snapDay('2026-10-15', 'year', 'end')).toBe('2026-12-31')
  })

  it('流水预设给出具体起止', () => {
    const presets = datePresets('2026-11-06')
    expect(presets.map((preset) => [preset.id, preset.from, preset.to])).toEqual([
      ['thisMonth', '2026-11-01', '2026-11-30'],
      ['lastMonth', '2026-10-01', '2026-10-31'],
      ['last3m', '2026-08-06', '2026-11-06'],
      ['thisYear', '2026-01-01', '2026-12-31'],
    ])
  })

  it('日历补齐到 6 周且含相邻月日期', () => {
    const cells = calendarCells(2026, 11)
    expect(cells).toHaveLength(42)
    expect(cells[0].date).toBe('2026-10-26')
    expect(cells.some((cell) => cell.date === '2026-11-01' && cell.inMonth)).toBe(true)
  })

  it('拒绝不存在的日期', () => {
    expect(isValidISODate('2026-02-30')).toBe(false)
    expect(isValidISODate('2026-10-31')).toBe(true)
  })
})

describe('DatePicker 交互', () => {
  it('点预设后浮层内直接展示具体起止，应用带上预设 id', async () => {
    const user = userEvent.setup()
    const { onChange } = renderPicker({
      value: { from: '', to: '' },
      optional: true,
      presets: datePresets('2026-11-06'),
    })
    await user.click(screen.getByRole('button', { name: /起始日期/ }))
    await user.click(screen.getByRole('button', { name: '上月' }))

    expect(screen.getByText('预设「上月」：2026-10-01 ~ 2026-10-31')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^起.*2026-10-01/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^止.*2026-10-31/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '应用' }))
    expect(onChange).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-31' }, 'lastMonth')
  })

  it('第二次点选早于起点时自动交换并给出可见反馈', async () => {
    const user = userEvent.setup()
    const { onChange } = renderPicker({
      value: { from: '2026-10-10', to: '2026-10-20' },
    })
    await user.click(screen.getByRole('button', { name: /起始日期/ }))
    await user.click(screen.getByRole('button', { name: '2026-10-25' }))

    expect(screen.getByRole('status')).toHaveTextContent(
      '起止反选，已自动交换为 2026-10-20 ~ 2026-10-25',
    )

    await user.click(screen.getByRole('button', { name: '应用' }))
    expect(onChange).toHaveBeenCalledWith({ from: '2026-10-20', to: '2026-10-25' }, null)
  })

  it('未来日期禁用且原因可见，不只靠 title', async () => {
    const user = userEvent.setup()
    renderPicker({
      value: { from: '2026-10-01', to: '2026-10-28' },
      maxDate: '2026-10-28',
      disabledNote: '未来日期不可选 · 数据截至 2026-10-28',
    })
    await user.click(screen.getByRole('button', { name: /起始日期/ }))
    expect(screen.getByText('未来日期不可选 · 数据截至 2026-10-28')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2026-10-29' })).toBeDisabled()
  })

  it('留空即不限：占位「不限」，清空后回调空区间', async () => {
    const user = userEvent.setup()
    const { onChange } = renderPicker({ value: { from: '', to: '' }, optional: true })
    expect(screen.getAllByText('不限')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: /起始日期/ }))
    await user.click(screen.getByRole('button', { name: '清空（不限）' }))
    expect(onChange).toHaveBeenCalledWith({ from: '', to: '' }, null)
  })

  it('Esc 关闭并把焦点还给触发控件', async () => {
    const user = userEvent.setup()
    renderPicker()
    const trigger = screen.getByRole('button', { name: /起始日期/ })
    await user.click(trigger)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Tab 在浮层内循环，方向键选日、Enter 确认', async () => {
    const user = userEvent.setup()
    const { onChange } = renderPicker()

    await user.click(screen.getByRole('button', { name: /起始日期/ }))
    const first = screen.getByRole('dialog').querySelector<HTMLButtonElement>('.mb-dp-field')!
    await waitFor(() => expect(screen.getByRole('button', { name: '2026-10-01' })).toHaveFocus())

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: '2026-10-02' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('status')).toHaveTextContent('起始已设为 2026-10-02')

    screen.getByRole('button', { name: '应用' }).focus()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' })
    expect(first).toHaveFocus()

    await user.click(screen.getByRole('button', { name: '应用' }))
    expect(onChange).toHaveBeenCalledWith({ from: '2026-10-02', to: '2026-10-31' }, null)
  })
})
