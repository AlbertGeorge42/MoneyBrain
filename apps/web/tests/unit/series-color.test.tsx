/**
 * 稳定取色：颜色跟实体身份走，不跟金额名次 / 数组下标走。
 *
 * 覆盖：哈希分槽对输入顺序不敏感、同图内不撞槽、超过槽位数不新增颜色；
 * 组件层覆盖总览环形（弧 + 图例）、报表构成环与账户圆点。
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { CATEGORY_COLORS, SERIES_COLORS, stableColorMap, stableSlotMap } from '@/features/shared/seriesColor'
import { ExpenseCategoryPie } from '@/features/overview/ExpenseCategoryPie'
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

/** 真实账本的 9 个支出一级分类（docs/blueprint/excel-parity.md）。 */
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

function expenseColors(container: HTMLElement): Map<string, string> {
  const colors = new Map<string, string>()
  container.querySelectorAll<SVGGElement>('.mb-expense-pie-slice').forEach((slice) => {
    const arc = slice.querySelector('path')
    colors.set(slice.dataset.id ?? '', arc?.getAttribute('style') ?? '')
  })
  return colors
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
    [...container.querySelectorAll<HTMLElement>('.mb-account-dot')].map((dot) => [
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
    const range = { from: '2025-12-01', to: '2026-11-30' }
    const { container, rerender } = render(
      <ExpenseCategoryPie slices={slices} range={range} device="desktop" />,
    )
    const before = expenseColors(container)

    rerender(
      <ExpenseCategoryPie slices={[...slices].reverse()} range={range} device="desktop" />,
    )
    expect(expenseColors(container)).toEqual(before)
    // 图例色块与弧使用同一个 item.color：同行的 style 属性里是同一 token。
    const tokenOf = (id: string) => before.get(id)?.match(/var\(--[^)]+\)/)?.[0] ?? ''
    const rows = [...container.querySelectorAll<HTMLElement>('.mb-expense-pie-row')]
    rows.forEach((row, index) => {
      const swatch = row.querySelector<HTMLElement>('.mb-expense-pie-swatch')
      const id = slices[slices.length - 1 - index].id
      expect(swatch?.getAttribute('style')).toContain(tokenOf(id))
    })
  })

  it('总览支出环形：真实库 9 类同图弧色互不重复', () => {
    const slices: ExpenseCategorySlice[] = REAL_EXPENSE_ROOTS.map((name, index) => ({
      id: `root-${index}`,
      name,
      amount: (REAL_EXPENSE_ROOTS.length - index) * 10_000,
    }))
    const { container } = render(
      <ExpenseCategoryPie
        slices={slices}
        range={{ from: '2025-12-01', to: '2026-11-30' }}
        device="desktop"
      />,
    )
    const colors = expenseColors(container)
    expect(colors.size).toBe(REAL_EXPENSE_ROOTS.length)
    expect(new Set(colors.values()).size).toBe(REAL_EXPENSE_ROOTS.length)
  })

  it('同一 colorUniverse 下，不同月份集合的共同分类同色', () => {
    const universe = ['餐饮', '居住', '购物', '交通', '娱乐']
    const range = { from: '2025-12-01', to: '2026-11-30' }
    const first: ExpenseCategorySlice[] = [
      { id: 'food', name: '餐饮', amount: 300_000 },
      { id: 'home', name: '居住', amount: 200_000 },
    ]
    const second: ExpenseCategorySlice[] = [
      { id: 'home', name: '居住', amount: 200_000 },
      { id: 'shop', name: '购物', amount: 100_000 },
    ]
    const { container, rerender } = render(
      <ExpenseCategoryPie slices={first} range={range} device="desktop" colorUniverse={universe} />,
    )
    const homeColor = expenseColors(container).get('home')
    rerender(
      <ExpenseCategoryPie slices={second} range={range} device="desktop" colorUniverse={universe} />,
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
