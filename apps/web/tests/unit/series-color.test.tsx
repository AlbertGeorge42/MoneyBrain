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
import type { ExpenseCategorySlice, LedgerAccount, OverviewSummary } from '@/features/overview/model'

const categories = ['餐饮', '居住', '购物', '交通', '娱乐', '医疗', '教育']

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

describe('stableColorMap', () => {
  it('同一实体在任意输入顺序下得到同一颜色', () => {
    const forward = stableColorMap(categories, SERIES_COLORS)
    const reversed = stableColorMap([...categories].reverse(), SERIES_COLORS)
    for (const name of categories) {
      expect(reversed.get(name)).toBe(forward.get(name))
    }
  })

  it('同图内实体数不超过槽位数时不撞槽', () => {
    const colors = stableColorMap(categories, SERIES_COLORS)
    expect(new Set(colors.values()).size).toBe(categories.length)
  })

  it('实体数超过槽位数时只回绕到既有色板，不新增颜色', () => {
    const many = Array.from({ length: 12 }, (_, index) => `分类-${index}`)
    const colors = stableColorMap(many, SERIES_COLORS)
    for (const color of colors.values()) expect(SERIES_COLORS).toContain(color)
    expect(new Set(colors.values()).size).toBeLessThanOrEqual(SERIES_COLORS.length)
  })

  it('总览与报表的共同分类跨页面同色（一套 7 槽色板）', () => {
    const overview = stableColorMap(['餐饮', '居住', '购物', '交通', '娱乐', '医疗', '教育'], SERIES_COLORS)
    const reports = stableColorMap(['餐饮', '居住', '购物', '娱乐', '医疗', '教育'], SERIES_COLORS)
    for (const name of ['餐饮', '居住', '购物', '娱乐', '医疗', '教育']) {
      expect(reports.get(name)).toBe(overview.get(name))
    }
  })

  it('分类圆点用 6 槽色板，槽位不超界', () => {
    const slots = stableSlotMap(categories, CATEGORY_COLORS.length)
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

  it('账户圆点：账户顺序变化后同一账户的色槽不变', () => {
    const accounts: LedgerAccount[] = [
      { id: 'cmb', name: '招商银行', kind: 'deposit', balance: 1_000_000 },
      { id: 'cash', name: '现金', kind: 'cash', balance: 100_000 },
      { id: 'fund', name: '基金', kind: 'investment', balance: 500_000 },
    ]
    const summary: OverviewSummary = {
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
    const { container, rerender } = render(
      <AccountEntry summary={summary} accounts={accounts} onOpen={() => {}} />,
    )
    const tonesOf = () =>
      new Map(
        [...container.querySelectorAll<HTMLElement>('.mb-account-dot')].map((dot) => [
          dot.textContent ?? '',
          [...dot.classList].find((name) => name.startsWith('mb-tone-cat-')) ?? '',
        ]),
      )
    const before = tonesOf()

    rerender(<AccountEntry summary={summary} accounts={[...accounts].reverse()} onOpen={() => {}} />)
    expect(tonesOf()).toEqual(before)
  })
})
