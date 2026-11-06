/**
 * 批 A / A2：收入 / 支出构成环形（DonutChart）
 *
 * 守护口径：只取一级根分类、Top 6 + 其余、最多 7 个有色项、其余带斜纹、
 * 切块/图例同集合并可下钻；A2 起收入侧同为环形，两环中心分别标支出/收入。
 * 二级环：有子分类才进二级，叶子直接下钻到流水；父色明度阶梯、面包屑与 Esc 返回、
 * 二级最多 5 个具名 + 其余，不再有第三级。
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CompositionBars, DonutChart } from '@/features/reports/charts'
import { buildDrill, deriveFlowReport } from '@/features/reports/reportsModel'
import type { FlowTreeNode } from '@/features/reports/reportsModel'
import type { Ledger } from '@/features/overview/model'

function node(id: string, name: string, amount: number, children: FlowTreeNode[] = []): FlowTreeNode {
  return { id, name, amount, count: 1, share: 0, level: 0, children }
}

function child(id: string, name: string, amount: number): FlowTreeNode {
  return { ...node(id, name, amount), level: 1 }
}

describe('DonutChart 一级环', () => {
  it('只取一级根分类：子级不重复成切块', () => {
    const parent = node('food', '餐饮', 1_000, [child('lunch', '午餐', 600)])
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

  it('空态不画空环；单条数据画 356° 弧并标「仅 1 类」，不把满环当正常构成', () => {
    const empty = render(<DonutChart nodes={[]} total={0} title="支出构成" emptyText="该期间没有支出" />)
    expect(empty.container.querySelector('svg')).toBeNull()
    expect(empty.container.textContent).toContain('该期间没有支出')
    empty.unmount()

    const single = render(
      <DonutChart nodes={[node('only', '唯一分类', 2_500)]} total={2_500} title="支出构成" emptyText="无支出" />,
    )
    expect(single.container.querySelectorAll('.mb-rp-donut-arc')).toHaveLength(1)
    const arc = single.container.querySelector('.mb-rp-donut-slice')
    expect(arc?.getAttribute('data-sweep')).toBe('356')
    expect(arc?.getAttribute('data-start')).toBe('-90')
    expect(single.container.querySelector('.mb-rp-donut-center-label')?.textContent).toBe('支出 · 仅 1 类')
    expect(single.container.querySelector('.mb-rp-donut-center-value')?.textContent).toBe('¥25.00')
  })

  it('资产构成环用 asset 口径：中心读数是资产，切块/图例命中 ≥24px 且回调带 asset', () => {
    const assetNode = (id: string, name: string, amount: number): FlowTreeNode => ({
      ...node(id, name, amount),
      share: (amount / 9_000) * 100,
    })
    const onOpen = vi.fn()
    const { container } = render(
      <DonutChart
        nodes={[assetNode('kind:储蓄', '储蓄', 6_000), assetNode('kind:投资', '投资', 3_000)]}
        total={9_000}
        kind="asset"
        title="资产构成"
        emptyText="暂无资产账户"
        onOpen={onOpen}
      />,
    )
    expect(container.querySelector('.mb-rp-donut-center-label')?.textContent).toBe('资产')
    const hits = [...container.querySelectorAll('.mb-rp-donut-hit')]
    expect(hits).toHaveLength(2)
    for (const hit of hits) expect(Number(hit.getAttribute('data-hit'))).toBeGreaterThanOrEqual(24)
    fireEvent.click(container.querySelectorAll('.mb-rp-donut-slice')[0])
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen.mock.calls[0][1]).toBe('asset')
    expect((onOpen.mock.calls[0][0] as FlowTreeNode).id).toBe('kind:储蓄')
  })

  it('资产只有 1 类时同样画 356° 弧并标「仅 1 类」', () => {
    const single = render(
      <DonutChart
        nodes={[node('kind:储蓄', '储蓄', 9_000)]}
        total={9_000}
        kind="asset"
        title="资产构成"
        emptyText="暂无资产账户"
      />,
    )
    expect(single.container.querySelector('.mb-rp-donut-center-label')?.textContent).toBe('资产 · 仅 1 类')
    expect(single.container.querySelector('.mb-rp-donut-slice')?.getAttribute('data-sweep')).toBe('356')
  })

  it('收入侧也是环形，两环中心读数分别对应支出 / 收入', () => {
    const { container } = render(
      <CompositionBars
        incomeTrees={[node('salary', '工资', 5_200), node('refund', '退款', 200)]}
        expenseTrees={[node('food', '餐饮', 1_000), node('shop', '购物', 500)]}
        incomeTotal={5_400}
        expenseTotal={1_500}
      />,
    )

    const sides = container.querySelectorAll('.mb-rp-compare-side')
    expect(sides).toHaveLength(2)
    expect(sides[0].querySelector('.mb-rp-donut')).not.toBeNull()
    expect(sides[1].querySelector('.mb-rp-donut')).not.toBeNull()
    expect(container.querySelectorAll('.mb-rp-progress')).toHaveLength(0)
    // 用户要求左侧 = 支出、右侧 = 收入。
    expect(sides[0].querySelector('.mb-rp-donut-center-label')?.textContent).toBe('支出')
    expect(sides[1].querySelector('.mb-rp-donut-center-label')?.textContent).toBe('收入')
    expect(sides[0].querySelector('.mb-rp-donut-center-value')?.textContent).toBe('¥15.00')
    expect(sides[1].querySelector('.mb-rp-donut-center-value')?.textContent).toBe('¥54.00')
  })

  it('桌面切块也有命中层：弧本身不接事件，命中层可点', () => {
    const { container } = render(
      <DonutChart
        nodes={[node('a', '甲', 700), node('b', '乙', 300)]}
        total={1_000}
        title="支出构成"
        emptyText="无支出"
      />,
    )
    // 桌面（默认 device）每块一个 hit path，且与切块一一对应。
    expect(container.querySelectorAll('.mb-rp-donut-hit')).toHaveLength(2)
    expect(container.querySelectorAll('.mb-rp-donut-arc')).toHaveLength(2)
  })

  it('保底角不越界：1.4° 细块从其他块扣除，总角 ≤ 360 − 白隙', () => {
    const trees = Array.from({ length: 9 }, (_, index) =>
      node(`c${index}`, `分类${index}`, index === 8 ? 5 : 1_000 - index * 10),
    )
    const { container } = render(
      <DonutChart nodes={trees} total={trees.reduce((sum, item) => sum + item.amount, 0)} title="支出构成" emptyText="无支出" />,
    )

    const slices = Array.from(container.querySelectorAll<SVGGElement>('.mb-rp-donut-slice')).map((slice) => ({
      id: slice.dataset.id,
      start: Number(slice.dataset.start),
      sweep: Number(slice.dataset.sweep),
    }))
    const sorted = [...slices].sort((a, b) => a.start - b.start)
    for (const slice of sorted) expect(slice.sweep).toBeGreaterThanOrEqual(1.4)
    // 相邻块之间至少留 1°；末块与首块之间同样不侵占。
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const gap = sorted[index + 1].start - (sorted[index].start + sorted[index].sweep)
      expect(gap).toBeGreaterThanOrEqual(1 - 1e-9)
    }
    const wrapGap = sorted[0].start + 360 - (sorted[sorted.length - 1].start + sorted[sorted.length - 1].sweep)
    expect(wrapGap).toBeGreaterThanOrEqual(1 - 1e-9)
    expect(sorted.reduce((sum, slice) => sum + slice.sweep, 0)).toBeLessThanOrEqual(360 - sorted.length * 1)
  })

  it('「其余」切块与图例斜纹同向', () => {
    const trees = Array.from({ length: 8 }, (_, index) => node(`c${index}`, `分类${index}`, 1_000 - index * 10))
    const { container } = render(
      <DonutChart nodes={trees} total={trees.reduce((sum, item) => sum + item.amount, 0)} title="支出构成" emptyText="无支出" />,
    )
    const pattern = container.querySelector('pattern')
    expect(pattern?.getAttribute('patternTransform')).toBe('rotate(-45)')
    const swatch = container.querySelector<HTMLElement>('.mb-rp-donut-swatch.is-rest')
    // 45deg 渐变条纹垂直于渐变轴，与 rotate(-45) 的竖线同向（同为「\」）。
    expect(swatch?.style.backgroundImage).toContain('45deg')
  })
})

describe('DonutChart 二级环', () => {
  const home = node('home', '居住', 1_000, [
    child('rent', '房租', 600),
    child('property', '物业', 300),
    child('utility', '水电', 100),
  ])

  it('点一级切块进入子分类环：父色阶梯、中心为类别名与合计、面包屑可返回', () => {
    const { container } = render(
      <DonutChart nodes={[home]} total={1_000} title="支出构成" emptyText="无支出" />,
    )
    fireEvent.click(container.querySelector<SVGGElement>('.mb-rp-donut-slice[data-id="home"]') as SVGGElement)

    const donut = container.querySelector('.mb-rp-donut')
    expect(donut?.getAttribute('data-view')).toBe('sub')
    const slices = Array.from(container.querySelectorAll<SVGGElement>('.mb-rp-donut-slice'))
    expect(slices.map((slice) => slice.dataset.id)).toEqual(['rent', 'property', 'utility'])
    // 父色相固定：同一父槽位 + 递增阶梯，不重新分配 7 槽 series。
    expect(slices.map((slice) => slice.dataset.subParent)).toEqual(['0', '0', '0'])
    expect(slices.map((slice) => slice.dataset.subStep)).toEqual(['0', '1', '2'])
    // 子级颜色来自父色的 color-mix 阶梯，而不是重新分配的 series 槽。
    const arcs = container.querySelectorAll<SVGPathElement>('.mb-rp-donut-arc')
    expect(arcs[0].getAttribute('style')).toContain('color-mix')
    expect(arcs[0].getAttribute('style')).toContain('var(--mb-chart-sub-from)')
    expect(container.querySelector('.mb-rp-donut-center-label')?.textContent).toBe('居住')
    expect(container.querySelector('.mb-rp-donut-center-value')?.textContent).toBe('¥10.00')
    expect(container.querySelector('.mb-rp-donut-back')).not.toBeNull()
    expect(screen.getAllByRole('button')[0]).toHaveClass('mb-rp-donut-back')
  })

  it('点「返回一级」回到一级环', () => {
    const { container } = render(
      <DonutChart nodes={[home]} total={1_000} title="支出构成" emptyText="无支出" />,
    )
    fireEvent.click(container.querySelector<SVGGElement>('.mb-rp-donut-slice[data-id="home"]') as SVGGElement)
    fireEvent.click(container.querySelector('.mb-rp-donut-back') as HTMLButtonElement)

    expect(container.querySelector('.mb-rp-donut')?.getAttribute('data-view')).toBe('root')
    expect(container.querySelector('.mb-rp-donut-back')).toBeNull()
    expect(container.querySelector<SVGGElement>('.mb-rp-donut-slice')?.dataset.id).toBe('home')
  })

  it('Esc 也返回一级', () => {
    const { container } = render(
      <DonutChart nodes={[home]} total={1_000} title="支出构成" emptyText="无支出" />,
    )
    fireEvent.click(container.querySelector<SVGGElement>('.mb-rp-donut-slice[data-id="home"]') as SVGGElement)
    expect(container.querySelector('.mb-rp-donut')?.getAttribute('data-view')).toBe('sub')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(container.querySelector('.mb-rp-donut')?.getAttribute('data-view')).toBe('root')
  })

  it('叶子类别不进空环：点击直接下钻到流水', () => {
    const onOpen = vi.fn()
    const salary = node('salary', '工资', 5_000)
    const { container } = render(
      <DonutChart nodes={[salary]} total={5_000} kind="income" title="收入构成" emptyText="无收入" onOpen={onOpen} />,
    )
    fireEvent.click(container.querySelector<SVGGElement>('.mb-rp-donut-slice[data-id="salary"]') as SVGGElement)

    expect(container.querySelector('.mb-rp-donut')?.getAttribute('data-view')).toBe('root')
    expect(container.querySelector('.mb-rp-donut-back')).toBeNull()
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen.mock.calls[0][1]).toBe('income')
    expect((onOpen.mock.calls[0][0] as FlowTreeNode).id).toBe('salary')
  })

  it('二级切块继续下钻到流水，不再出现第三级环', () => {
    const onOpen = vi.fn()
    const { container } = render(
      <DonutChart nodes={[home]} total={1_000} title="支出构成" emptyText="无支出" onOpen={onOpen} />,
    )
    fireEvent.click(container.querySelector<SVGGElement>('.mb-rp-donut-slice[data-id="home"]') as SVGGElement)
    fireEvent.click(container.querySelector<SVGGElement>('.mb-rp-donut-slice[data-id="rent"]') as SVGGElement)

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect((onOpen.mock.calls[0][0] as FlowTreeNode).id).toBe('rent')
    expect(container.querySelector('.mb-rp-donut')?.getAttribute('data-view')).toBe('sub')
  })

  it('子分类超过 5 个并入「其余」，二级最多 6 个有色项', () => {
    const many = node(
      'home',
      '居住',
      10_000,
      Array.from({ length: 8 }, (_, index) => child(`c${index}`, `子类${index}`, 1_000 - index * 50)),
    )
    const { container } = render(
      <DonutChart nodes={[many]} total={10_000} title="支出构成" emptyText="无支出" />,
    )
    fireEvent.click(container.querySelector<SVGGElement>('.mb-rp-donut-slice[data-id="home"]') as SVGGElement)

    expect(container.querySelectorAll('.mb-rp-donut-slice')).toHaveLength(6)
    expect(container.querySelectorAll('.mb-rp-donut-rest')).toHaveLength(1)
    expect(container.querySelector('.mb-rp-donut-slice[data-id="rest"]')?.getAttribute('data-sub-step')).toBe('5')
    expect(screen.getAllByRole('button')).toHaveLength(7)
  })

  it('6–8 子类：只显示 5 个具名 + 「其余 N 类」，点击「其余」带合并集合下钻', () => {
    const onOpen = vi.fn()
    // 8 个子类 → 5 个具名 + 「其余 3 类」。
    const many = node(
      'home',
      '居住',
      6_000,
      Array.from({ length: 8 }, (_, index) => child(`c${index}`, `子类${index}`, 900 - index * 100)),
    )
    const { container } = render(
      <DonutChart nodes={[many]} total={6_000} title="支出构成" emptyText="无支出" onOpen={onOpen} />,
    )
    fireEvent.click(container.querySelector<SVGGElement>('.mb-rp-donut-slice[data-id="home"]') as SVGGElement)

    const slices = Array.from(container.querySelectorAll<SVGGElement>('.mb-rp-donut-slice'))
    expect(slices.map((slice) => slice.dataset.id)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'rest'])
    const restSlice = slices[5]
    // 其余 3 类的金额是剩余子类之和，且不等于父类总额。
    expect(restSlice.dataset.amount).toBe(String(400 + 300 + 200))

    const restButton = screen.getByRole('button', { name: /其余 3 类/ })
    fireEvent.click(restButton)

    expect(onOpen).toHaveBeenCalledTimes(1)
    const opened = onOpen.mock.calls[0][0] as FlowTreeNode
    expect(opened.id).toBe('rest')
    expect(opened.mergedIds).toEqual(['c5', 'c6', 'c7'])
    expect(opened.amount).toBe(400 + 300 + 200)
    expect(opened.count).toBe(3)
    // 下钻节点仍按父色阶梯第 6 段着色，不回父色。
    expect(restSlice.getAttribute('data-sub-step')).toBe('5')
    expect(restSlice.querySelector('.mb-rp-donut-arc')?.getAttribute('style')).toContain('color-mix')
  })

  it('点「其余」落到流水：笔数与金额与合并子类一致', () => {
    const children = Array.from({ length: 7 }, (_, index) => ({
      id: `fx${index}`,
      name: `子类${index}`,
      type: 'expense' as const,
      parentId: 'fx',
    }))
    const ledger: Ledger = {
      accounts: [{ id: 'a1', name: '现金', kind: 'cash', balance: 0 }],
      categories: [{ id: 'fx', name: '验证大类', type: 'expense' }, ...children],
      budgets: [],
      // 金额逐类递减，顺序稳定：其余落在 fx5 / fx6。
      transactions: children.map((category, index) => ({
        id: `t${index}`,
        date: '2026-10-12',
        type: 'expense' as const,
        categoryId: category.id,
        note: '',
        accountId: 'a1',
        amount: 800 - index * 100,
      })),
    }
    const from = '2026-10-01'
    const to = '2026-10-31'
    const report = deriveFlowReport(ledger, from, to, 'month')
    const onOpen = vi.fn()
    const { container } = render(
      <DonutChart
        nodes={report.expenseTrees}
        total={report.expense}
        title="支出构成"
        emptyText="无支出"
        onOpen={onOpen}
      />,
    )
    fireEvent.click(container.querySelector<SVGGElement>('.mb-rp-donut-slice[data-id="fx"]') as SVGGElement)
    fireEvent.click(screen.getByRole('button', { name: /其余 2 类/ }))

    const opened = onOpen.mock.calls[0][0] as FlowTreeNode
    expect(opened.mergedIds).toEqual(['fx5', 'fx6'])
    expect(opened.amount).toBe(300 + 200)
    expect(opened.count).toBe(2)

    const drill = buildDrill(ledger, opened, 'expense', from, to)
    expect(drill.amount).toBe(500)
    expect(drill.children.map((row) => [row.name, row.amount, row.count])).toEqual([
      ['子类5', 300, 1],
      ['子类6', 200, 1],
    ])
    // 「落到流水」的笔数与金额对得上：2 笔、合计 ¥5.00。
    expect(drill.transactions).toHaveLength(2)
    expect(drill.transactions.reduce((sum, row) => sum + row.amount, 0)).toBe(500)
  })

  it('二级阶梯不回父色：token 区间不含 100%，单子类取中点', () => {
    const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
    const variablesCss = readFileSync(join(webRoot, 'src/styles/theme/variables.css'), 'utf8')
    expect(variablesCss).not.toMatch(/--mb-chart-sub-(from|to):\s*100%/)
    expect(variablesCss).toContain('--mb-chart-sub-from: 90%')
    expect(variablesCss).toContain('--mb-chart-sub-to: 40%')
    expect(variablesCss).toContain('--mb-chart-sub-from: 84%')
    expect(variablesCss).toContain('--mb-chart-sub-to: 32%')

    const single = node('solo', '独子类', 600, [child('only', '唯一子类', 600)])
    const { container } = render(
      <DonutChart nodes={[single]} total={600} title="支出构成" emptyText="无支出" />,
    )
    fireEvent.click(container.querySelector<SVGGElement>('.mb-rp-donut-slice[data-id="solo"]') as SVGGElement)
    const arc = container.querySelector('.mb-rp-donut-arc')
    expect(arc?.getAttribute('style')).toContain('0.5000')
    expect(arc?.getAttribute('style')).not.toContain('1.0000')
    expect(arc?.getAttribute('style')).not.toContain('0.0000')
  })
})
