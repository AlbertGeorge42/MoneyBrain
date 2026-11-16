import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DonutChart, type DonutNode } from '@/features/shared/DonutChart'
import { ExpenseTrendChart } from '@/features/overview/ExpenseTrendChart'
import type { ExpenseCategorySlice, TrendPoint } from '@/features/overview/model'

const slices: ExpenseCategorySlice[] = [
  { id: 'food', name: '餐饮', amount: 300_000 },
  { id: 'home', name: '居住', amount: 200_000 },
  { id: 'empty', name: '零元分类', amount: 0 },
  { id: 'negative', name: '负值分类', amount: -10_000 },
]

/** 总览页内联的扁平切片 → 环节点适配，测试在此复刻以驱动同一份共享环。 */
function toNodes(items: ExpenseCategorySlice[]): DonutNode[] {
  const visible = items.filter((slice) => slice.amount > 0)
  const total = visible.reduce((sum, slice) => sum + slice.amount, 0)
  return visible.map((slice) => ({
    id: slice.id,
    name: slice.name,
    amount: slice.amount,
    count: 0,
    share: total > 0 ? (slice.amount / total) * 100 : 0,
    level: 0,
    children: [],
  }))
}

describe('支出分类环形图（共享构成环）', () => {
  it('点击一级分类把节点与下钻口径交给 onOpen', () => {
    const onOpen = vi.fn()
    render(
      <DonutChart
        nodes={toNodes(slices)}
        total={500_000}
        device="desktop"
        kind="expense"
        title="支出分类"
        emptyText="近 12 个月没有支出数据"
        onOpen={onOpen}
      />,
    )

    // 与报表构成环同款：图例行是唯一的可点入口，整行带分类金额。
    fireEvent.click(screen.getByRole('button', { name: /查看 餐饮 .*的下钻/ }))

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen.mock.calls[0][0]).toMatchObject({ id: 'food', name: '餐饮', amount: 300_000 })
    expect(onOpen.mock.calls[0][1]).toBe('expense')
  })

  it('0 元与负值分类不画弧、不参与总额；全部为空时走空态而非除零', () => {
    render(
      <DonutChart
        nodes={toNodes(slices)}
        total={500_000}
        device="desktop"
        title="支出分类"
        emptyText="近 12 个月没有支出数据"
      />,
    )

    const arcs = document.querySelectorAll('.mb-rp-donut-arc')
    expect(arcs).toHaveLength(2)
    expect(screen.getByText('¥5,000.00')).toBeInTheDocument()

    render(
      <DonutChart
        nodes={toNodes(slices.slice(2))}
        total={0}
        device="mobile"
        title="支出分类"
        emptyText="近 12 个月没有支出数据"
      />,
    )
    expect(screen.getAllByText('近 12 个月没有支出数据').length).toBeGreaterThan(0)
  })

  it('移动端图例常驻环下方，与报表环同款 44px 命中区', () => {
    const { container } = render(
      <DonutChart
        nodes={toNodes(slices)}
        total={500_000}
        device="mobile"
        title="支出分类"
        emptyText="近 12 个月没有支出数据"
      />,
    )

    // 完全统一后不再有折叠开关：图例恒在下方，移动端加大命中区。
    expect(screen.queryByRole('button', { name: /展开图例/ })).toBeNull()
    const donut = container.querySelector('.mb-rp-donut.is-mobile')
    expect(donut).not.toBeNull()
    const legend = donut!.querySelector('.mb-rp-donut-legend')
    expect(legend).not.toBeNull()
    expect(legend!.querySelectorAll('.mb-rp-donut-legend-row')).toHaveLength(2)
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
