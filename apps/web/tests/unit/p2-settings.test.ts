/**
 * P2 #12 被引用分类的删除
 *
 * 复现原缺陷：行上写「2 笔 · 2 个子分类」，删除弹窗却只数 1 笔，且没有转移出口。
 * 断言：行计数与弹窗同源（含子分类），转移后源分类消失、交易落到目标分类。
 */
import { describe, expect, it } from 'vitest'
import {
  categoryRows,
  defaultActivity,
  removeCategory,
  setCategoryCashFlowInLedger,
  transferCategoryTransactions,
} from '@/features/ledger-config/model'
import type { Ledger } from '@/features/overview/model'

const ledger: Ledger = {
  accounts: [],
  categories: [
    { id: 'shop', name: '购物', type: 'expense' },
    { id: 'shop_daily', name: '日用品', type: 'expense', parentId: 'shop' },
    { id: 'shop_cloth', name: '服饰', type: 'expense', parentId: 'shop' },
    { id: 'food', name: '餐饮', type: 'expense' },
  ],
  budgets: [],
  transactions: [
    { id: 't1', date: '2026-10-01', type: 'expense', categoryId: 'shop', note: '超市', accountId: 'a1', amount: 1_000 },
    { id: 't2', date: '2026-10-02', type: 'expense', categoryId: 'shop_daily', note: '纸巾', accountId: 'a1', amount: 2_000 },
    { id: 't3', date: '2026-10-03', type: 'expense', categoryId: 'shop_cloth', note: '外套', accountId: 'a1', amount: 3_000 },
    { id: 't4', date: '2026-10-04', type: 'expense', categoryId: 'food', note: '午餐', accountId: 'a1', amount: 1_500 },
  ],
  // 生产账本由后端摘要带出分类笔数；此处补等价单值供 categoryRows 读取。
  snapshot: {
    categoryTxCounts: { shop: 1, shop_daily: 1, shop_cloth: 1, food: 1 },
    accountTxCounts: {},
  },
} as never

describe('#12 分类删除与转移', () => {
  it('行计数与删除口径一致：都含子分类交易', () => {
    const row = categoryRows(ledger, 'expense').find((item) => item.id === 'shop')
    expect(row?.txCount).toBe(3)
    expect(row?.childCount).toBe(2)
  })

  it('现金流活动只写根分类；子分类不落 cashFlowType，靠继承显示父活动', () => {
    const before = ledger.categories.find((category) => category.id === 'shop')!
    expect(defaultActivity(before, ledger)).toBe('unassigned')

    const next = setCategoryCashFlowInLedger(ledger, 'shop', 'investing')
    expect(next.categories.find((category) => category.id === 'shop')?.cashFlowType).toBe('investing')
    // 与后端一致：子分类不写独立 cashFlowType。
    expect(next.categories.find((category) => category.id === 'shop_daily')?.cashFlowType).toBeUndefined()
    expect(next.categories.find((category) => category.id === 'shop_cloth')?.cashFlowType).toBeUndefined()
    // 但展示的有效活动仍从一级根继承，子分类跟着父分类显示 investing。
    expect(defaultActivity(next.categories.find((c) => c.id === 'shop_daily')!, next)).toBe('investing')
    expect(defaultActivity(next.categories.find((c) => c.id === 'shop_cloth')!, next)).toBe('investing')
    // 其他一级分类不受影响。
    expect(next.categories.find((category) => category.id === 'food')?.cashFlowType).toBeUndefined()
  })

  it('转移到目标分类后自动删除源分类，引用数归零', () => {
    const moved = transferCategoryTransactions(ledger, 'shop', 'food')
    const next = removeCategory(moved, 'shop')

    expect(next.categories.some((category) => category.id === 'shop')).toBe(false)
    expect(next.transactions.filter((item) => item.categoryId === 'food')).toHaveLength(4)
    const rows = categoryRows(next, 'expense')
    expect(rows.find((item) => item.id === 'shop')).toBeUndefined()
  })
})
