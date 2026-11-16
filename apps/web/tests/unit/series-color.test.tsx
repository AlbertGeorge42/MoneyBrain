/**
 * 稳定取色：颜色跟实体身份走，不跟金额名次 / 数组下标走。
 *
 * 覆盖：哈希分槽对输入顺序不敏感、同图内不撞槽、超过槽位数不新增颜色；
 * 组件层覆盖总览环形（弧 + 图例）、报表构成环与账户圆点。
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { CATEGORY_COLORS, SERIES_COLORS, stableColorMap, stableSlotMap } from '@/features/shared/seriesColor'
import { AccountEntry } from '@/features/overview/AccountEntry'
import { DonutChart } from '@/features/reports/charts'
import type { FlowTreeNode } from '@/features/reports/reportsModel'
import type {
  ExpenseCategorySlice,
  LedgerAccount,
  LedgerAccountCategory,
  OverviewSummary,
} from '@/features/overview/model'

const expenseNames = ['餐饮', '居住', '购物', '交通', '娱乐', '医疗', '教育']

/** 真实账本的 9 个支出一级分类（见 data/qianji/README.md 的导出批次说明）。 */
const REAL_EXPENSE_ROOTS = ['餐饮', '服饰', '交通', '生活', '恋爱', '消费', '娱乐', '送礼', '其他']

const EMPTY_SUMMARY: OverviewSummary = {
  netWorth: 0,
  previousNetWorth: 0,
  netWorthChangePct: 0,
  liquidAssets: 0,
  investmentAssets: 0,
  income: 0,
  expense: 0,
  balance: 0,
  savingsRate: 0,
  incomeChangePct: 0,
  expenseChangePct: 0,
  elapsedDays: 0,
}

function node(id: string, name: string, amount: number): FlowTreeNode {
  return { id, name, amount, count: 1, share: 0, level: 0, children: [] }
}

/** 总览页内联适配：扁平切片 → 共享环节点。 */
function slicesToNodes(slices: ExpenseCategorySlice[]): FlowTreeNode[] {
  const visible = slices.filter((slice) => slice.amount > 0)
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

function overviewDonut(
  slices: ExpenseCategorySlice[],
  colorUniverse?: readonly string[],
) {
  const visible = slices.filter((slice) => slice.amount > 0)
  return (
    <DonutChart
      nodes={slicesToNodes(slices)}
      total={visible.reduce((sum, slice) => sum + slice.amount, 0)}
      device="desktop"
      kind="expense"
      title="支出分类"
      emptyText="近 12 个月没有支出数据"
      colorUniverse={colorUniverse}
    />
  )
}

/** 总览环与报表环共用一份实现，取色断言也走同一套选择器。 */
function expenseColors(container: HTMLElement): Map<string, string> {
  return donutColors(container)
}

function donutColors(container: HTMLElement): Map<string, string> {
  const colors = new Map<string, string>()
  container.querySelectorAll<SVGGElement>('.mb-rp-donut-slice').forEach((slice) => {
    const arc = slice.querySelector('.mb-rp-donut-arc')
    colors.set(slice.dataset.id ?? '', arc?.getAttribute('style') ?? '')
  })
  return colors
}

function toneOf(container: HTMLElement): Map<string, string> {
  return new Map(
    [...container.querySelectorAll<HTMLElement>('.mb-ov-dot')].map((dot) => [
      dot.textContent ?? '',
      [...dot.classList].find((name) => name.startsWith('mb-tone-cat-')) ?? '',
    ]),
  )
}

describe('stableColorMap', () => {
  it('同一实体在任意输入顺序下得到同一颜色', () => {
    const forward = stableColorMap(expenseNames, SERIES_COLORS)
    const reversed = stableColorMap([...expenseNames].reverse(), SERIES_COLORS)
    for (const name of expenseNames) {
      expect(reversed.get(name)).toBe(forward.get(name))
    }
  })

  it('同图内实体数不超过槽位数时不撞槽', () => {
    const colors = stableColorMap(expenseNames, SERIES_COLORS)
    expect(new Set(colors.values()).size).toBe(expenseNames.length)
  })

  it('真实库 9 个支出一级分类在 10 槽内同图无重复色', () => {
    const colors = stableColorMap(REAL_EXPENSE_ROOTS, SERIES_COLORS)
    expect(colors.size).toBe(REAL_EXPENSE_ROOTS.length)
    expect(new Set(colors.values()).size).toBe(REAL_EXPENSE_ROOTS.length)
    for (const color of colors.values()) expect(SERIES_COLORS).toContain(color)
  })

  it('实体数超过槽位数时只回绕到既有色板，不新增颜色', () => {
    const many = Array.from({ length: 12 }, (_, index) => `分类-${index}`)
    const colors = stableColorMap(many, SERIES_COLORS)
    for (const color of colors.values()) expect(SERIES_COLORS).toContain(color)
    expect(new Set(colors.values()).size).toBeLessThanOrEqual(SERIES_COLORS.length)
  })

  it('总览与报表的共同分类跨页面同色（一套 10 槽色板）', () => {
    const overview = stableColorMap(expenseNames, SERIES_COLORS)
    const reports = stableColorMap(['餐饮', '居住', '购物', '娱乐', '医疗', '教育'], SERIES_COLORS)
    for (const name of ['餐饮', '居住', '购物', '娱乐', '医疗', '教育']) {
      expect(reports.get(name)).toBe(overview.get(name))
    }
  })

  it('分类圆点用 6 槽色板，槽位不超界', () => {
    const slots = stableSlotMap(expenseNames, CATEGORY_COLORS.length)
    for (const slot of slots.values()) expect(slot).toBeGreaterThanOrEqual(0)
    for (const slot of slots.values()) expect(slot).toBeLessThan(CATEGORY_COLORS.length)
  })
})

describe('组件取色跟随身份', () => {
  it('总览支出环形：分类乱序后同一分类的弧色不变，图例沿用同一映射', () => {
    const slices: ExpenseCategorySlice[] = [
      { id: 'food', name: '餐饮', amount: 300_000 },
      { id: 'home', name: '居住', amount: 200_000 },
      { id: 'shop', name: '购物', amount: 100_000 },
    ]
    const { container, rerender } = render(
      overviewDonut(slices),
    )
    const before = expenseColors(container)

    rerender(
      overviewDonut([...slices].reverse()),
    )
    expect(expenseColors(container)).toEqual(before)
    // 图例色块与弧使用同一个 item.color：按分类名反查，不依赖图例的行序
    // （Top6 改为金额降序后，行序随金额变，但同分类的 token 必须不变）。
    const tokenOf = (id: string) => before.get(id)?.match(/var\(--[^)]+\)/)?.[0] ?? ''
    const idOfName = new Map(slices.map((slice) => [slice.name, slice.id]))
    const rows = [...container.querySelectorAll<HTMLElement>('.mb-rp-donut-legend-row')]
    for (const row of rows) {
      const name = row.querySelector('.mb-rp-compare-name')?.textContent?.trim() ?? ''
      const id = idOfName.get(name)
      expect(id, name).toBeTruthy()
      const swatch = row.querySelector<HTMLElement>('.mb-rp-donut-swatch')
      expect(swatch?.getAttribute('style'), name).toContain(tokenOf(id!))
    }
  })

  it('总览支出环形：9 类按 Top6 + 其余聚合，7 块弧色互不重复', () => {
    const slices: ExpenseCategorySlice[] = REAL_EXPENSE_ROOTS.map((name, index) => ({
      id: `root-${index}`,
      name,
      amount: (REAL_EXPENSE_ROOTS.length - index) * 10_000,
    }))
    const { container } = render(
      overviewDonut(slices),
    )
    // 与报表环同款聚合：6 个具名 + 1 个「其余 3 类」。
    const colors = expenseColors(container)
    expect(colors.size).toBe(7)
    expect(new Set(colors.values()).size).toBe(7)
    expect([...colors.keys()]).toContain('rest')
  })

  it('同一 colorUniverse 下，不同月份集合的共同分类同色', () => {
    const universe = ['餐饮', '居住', '购物', '交通', '娱乐']
    const first: ExpenseCategorySlice[] = [
      { id: 'food', name: '餐饮', amount: 300_000 },
      { id: 'home', name: '居住', amount: 200_000 },
    ]
    const second: ExpenseCategorySlice[] = [
      { id: 'home', name: '居住', amount: 200_000 },
      { id: 'shop', name: '购物', amount: 100_000 },
    ]
    const { container, rerender } = render(
      overviewDonut(first, universe),
    )
    const homeColor = expenseColors(container).get('home')
    rerender(
      overviewDonut(second, universe),
    )
    expect(expenseColors(container).get('home')).toBe(homeColor)
  })

  it('报表构成环：分类乱序后同一分类的切块色不变', () => {
    const nodes = [node('food', '餐饮', 1_000), node('home', '居住', 500), node('shop', '购物', 200)]
    const total = 1_700
    const { container, rerender } = render(
      <DonutChart nodes={nodes} total={total} title="支出构成" emptyText="无支出" />,
    )
    const before = donutColors(container)

    rerender(<DonutChart nodes={[...nodes].reverse()} total={total} title="支出构成" emptyText="无支出" />)
    expect(donutColors(container)).toEqual(before)
  })

  it('账户圆点：同一级分类同色，账户顺序变化不改色', () => {
    const categories: LedgerAccountCategory[] = [
      { id: 'g-cash', name: '现金', type: 'asset', sort: 0 },
      { id: 'g-long', name: '长期', type: 'asset', sort: 1 },
      { id: 'g-inv', name: '投资', type: 'asset', sort: 2 },
      { id: 'g-debt', name: '短期负债', type: 'liability', sort: 3 },
    ]
    const accounts: LedgerAccount[] = [
      { id: 'cmb', name: '招商银行', kind: 'deposit', balance: 1_000_000, categoryId: 'g-long' },
      { id: 'pingan', name: '平安银行', kind: 'deposit', balance: 200_000, categoryId: 'g-long' },
      { id: 'cash', name: '现金', kind: 'cash', balance: 100_000, categoryId: 'g-cash' },
    ]
    const { container, rerender } = render(
      <AccountEntry
        summary={EMPTY_SUMMARY}
        accounts={accounts}
        categories={categories}
        onOpen={() => {}}
      />,
    )
    const before = toneOf(container)
    // 同为「长期」的两个账户同色；「现金」与它们不同色。
    expect(before.get('招')).toBe(before.get('平'))
    expect(before.get('招')).not.toBe(before.get('现'))

    rerender(
      <AccountEntry
        summary={EMPTY_SUMMARY}
        accounts={[...accounts].reverse()}
        categories={categories}
        onOpen={() => {}}
      />,
    )
    expect(toneOf(container)).toEqual(before)
  })

  it('账户圆点：种子账本按账户性质取色，顺序变化不改色', () => {
    const accounts: LedgerAccount[] = [
      { id: 'cmb', name: '招商银行', kind: 'deposit', balance: 1_000_000 },
      { id: 'cash', name: '现金', kind: 'cash', balance: 100_000 },
      { id: 'fund', name: '基金', kind: 'investment', balance: 500_000 },
    ]
    const { container, rerender } = render(
      <AccountEntry
        summary={EMPTY_SUMMARY}
        accounts={accounts}
        onOpen={() => {}}
      />,
    )
    const before = toneOf(container)
    expect(new Set(before.values()).size).toBe(3)

    rerender(
      <AccountEntry
        summary={EMPTY_SUMMARY}
        accounts={[...accounts].reverse()}
        onOpen={() => {}}
      />,
    )
    expect(toneOf(container)).toEqual(before)
  })
})
