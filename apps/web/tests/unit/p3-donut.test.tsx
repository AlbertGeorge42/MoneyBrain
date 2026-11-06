/**
 * 批 A：支出构成环形（DonutChart）
 *
 * 守护口径：只取一级根分类、Top 6 + 其余、最多 7 个有色项、其余带斜纹、
 * 切块/图例同集合并可下钻、收入侧仍是横条、空态与单条数据。
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CompositionBars, DonutChart } from '@/features/reports/charts'
import type { FlowTreeNode } from '@/features/reports/reportsModel'

function node(id: string, name: string, amount: number, level: 0 | 1 = 0): FlowTreeNode {
  return { id, name, amount, count: 1, share: 0, level, children: [] }
}

describe('DonutChart', () => {
  it('只取一级根分类：子级不重复成切块', () => {
    const parent: FlowTreeNode = {
      ...node('food', '餐饮', 1_000),
      share: 100,
      children: [{ ...node('lunch', '午餐', 600, 1), share: 60 }],
    }
    const { container } = render(
      <DonutChart nodes={[parent, parent.children[0]]} total={1_000} title="支出构成" emptyText="无支出" />,
    )

    const slices = Array.from(container.querySelectorAll<SVGGElement>('.mb-rp-donut-slice'))
    expect(slices.map((slice) => slice.dataset.id)).toEqual(['food'])
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('最多 7 个有色项，第 8 类起并入「其余 N 类」且带斜纹', () => {
    const trees = Array.from({ length: 9 }, (_, index) =>
      node(`c${index}`, `分类${index}`, 1_000 - index * 10),
    )
    const { container } = render(
      <DonutChart nodes={trees} total={trees.reduce((sum, item) => sum + item.amount, 0)} title="支出构成" emptyText="无支出" />,
    )

    const slices = container.querySelectorAll('.mb-rp-donut-slice')
    expect(slices).toHaveLength(7)
    expect(container.querySelectorAll('.mb-rp-donut-rest')).toHaveLength(1)
    const rest = container.querySelector<SVGGElement>('.mb-rp-donut-slice[data-id="rest"]')
    expect(rest).not.toBeNull()
    expect(container.querySelector('.mb-rp-donut-swatch.is-rest')).not.toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(7)
  })

  it('切块与图例共用同一合并集合，下钻 mergedIds 与金额一致', () => {
    const onOpen = vi.fn()
    const trees = Array.from({ length: 8 }, (_, index) =>
      node(`c${index}`, `分类${index}`, 1_000 - index * 10),
    )
    render(
      <DonutChart
        nodes={trees}
        total={trees.reduce((sum, item) => sum + item.amount, 0)}
        title="支出构成"
        emptyText="无支出"
        onOpen={onOpen}
      />,
    )

    const restButton = screen.getByRole('button', { name: /其余 2 类/ })
    fireEvent.click(restButton)

    expect(onOpen).toHaveBeenCalledTimes(1)
    const [opened, kind] = onOpen.mock.calls[0] as [FlowTreeNode, string]
    expect(kind).toBe('expense')
    expect(opened.id).toBe('rest')
    expect(opened.mergedIds).toEqual(['c6', 'c7'])
    expect(opened.amount).toBe(1_000 - 60 + 1_000 - 70)
  })

  it('空态不画空环，单条数据画完整环且中心 100%', () => {
    const empty = render(<DonutChart nodes={[]} total={0} title="支出构成" emptyText="该期间没有支出" />)
    expect(empty.container.querySelector('svg')).toBeNull()
    expect(empty.container.textContent).toContain('该期间没有支出')
    empty.unmount()

    const single = render(
      <DonutChart
        nodes={[node('only', '唯一分类', 2_500)]}
        total={2_500}
        title="支出构成"
        emptyText="无支出"
      />,
    )
    expect(single.container.querySelectorAll('.mb-rp-donut-arc')).toHaveLength(1)
    expect(single.container.querySelector('.mb-rp-donut-center-label')?.textContent).toBe('100%')
  })

  it('收入侧仍是横条，支出侧才是环形', () => {
    const { container } = render(
      <CompositionBars
        incomeTrees={[node('salary', '工资', 5_000), node('refund', '退款', 200)]}
        expenseTrees={[node('food', '餐饮', 1_000), node('shop', '购物', 500)]}
        incomeTotal={5_200}
        expenseTotal={1_500}
      />,
    )

    const sides = container.querySelectorAll('.mb-rp-compare-side')
    expect(sides[0].querySelectorAll('.mb-rp-progress')).toHaveLength(2)
    expect(sides[0].querySelector('.mb-rp-donut')).toBeNull()
    expect(sides[1].querySelector('.mb-rp-donut')).not.toBeNull()
    expect(sides[1].querySelectorAll('.mb-rp-progress')).toHaveLength(0)
  })
})
