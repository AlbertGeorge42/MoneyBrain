import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ExpenseCategoryPie } from '@/features/overview/ExpenseCategoryPie'
import { ExpenseTrendChart } from '@/features/overview/ExpenseTrendChart'
import type { ExpenseCategorySlice, TrendPoint } from '@/features/overview/model'

const range = { from: '2025-12-01', to: '2026-11-30' }

const slices: ExpenseCategorySlice[] = [
  { id: 'food', name: '餐饮', amount: 300_000 },
  { id: 'home', name: '居住', amount: 200_000 },
  { id: 'empty', name: '零元分类', amount: 0 },
  { id: 'negative', name: '负值分类', amount: -10_000 },
]

describe('支出分类环形图', () => {
  it('点击一级分类把分类与近 12 个月期间一起带给下钻目标', () => {
    const onDrill = vi.fn()
    render(
      <ExpenseCategoryPie slices={slices} range={range} device="desktop" onDrill={onDrill} />,
    )

    // 弧块与图例各有一个同名可点元素；点弧块证明「点饼图分类」本身可以下钻。
    const targets = screen.getAllByRole('button', { name: '查看「餐饮」的流水' })
    fireEvent.click(targets[0])

    expect(onDrill).toHaveBeenCalledTimes(1)
    expect(onDrill).toHaveBeenCalledWith({
      categoryId: 'food',
      from: '2025-12-01',
      to: '2026-11-30',
    })
  })

  it('0 元与负值分类不画弧、不参与总额；全部为空时走空态而非除零', () => {
    render(
      <ExpenseCategoryPie
        slices={slices}
        range={range}
        device="desktop"
        onDrill={vi.fn()}
      />,
    )

    const arcs = document.querySelectorAll('.mb-expense-pie-arc')
    expect(arcs).toHaveLength(2)
    expect(screen.getByText('¥5,000.00')).toBeInTheDocument()

    render(
      <ExpenseCategoryPie
        slices={[
          { id: 'empty', name: '零元分类', amount: 0 },
          { id: 'negative', name: '负值分类', amount: -10_000 },
        ]}
        range={range}
        device="mobile"
      />,
    )
    expect(screen.getAllByText('近 12 个月没有支出数据').length).toBeGreaterThan(0)
  })

  it('移动端图例默认折叠且不横向溢出，可展开', () => {
    render(
      <ExpenseCategoryPie slices={slices} range={range} device="mobile" onDrill={vi.fn()} />,
    )

    const toggle = screen.getByRole('button', { name: /展开图例 · 2 类/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(document.querySelector('.mb-expense-pie-legend')).toBeNull()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(document.querySelector('.mb-expense-pie-legend')).not.toBeNull()
  })
})

describe('支出趋势折线图', () => {
  it('全 0 与负值月份都能画出有效坐标，不产生 NaN / 除零', () => {
    const points: TrendPoint[] = Array.from({ length: 12 }, (_, index) => ({
      month: `2025-${String((index % 12) + 1).padStart(2, '0')}`,
      value: index === 0 ? -50_000 : index === 1 ? 0 : 1_000 + index,
    }))
    render(<ExpenseTrendChart points={points} device="desktop" />)

    const line = document.querySelector('.mb-chart-line')
    expect(line?.getAttribute('points')).not.toContain('NaN')
    expect(document.querySelector('.mb-chart-area')?.getAttribute('d')).not.toContain('NaN')
  })

  it('没有任何月份时走空态，不渲染空坐标系', () => {
    render(<ExpenseTrendChart points={[]} device="mobile" />)
    expect(screen.getByText('近 12 个月没有支出数据')).toBeInTheDocument()
    expect(document.querySelector('.mb-chart-svg')).toBeNull()
  })
})
