/**
 * HF 流水纯函数：筛选、按日分组、小计与三态前置统计。
 * 表格硬规则里「合计不计转账」由 summarize / groupTransactionsByDay 保证。
 */
import { describe, it, expect } from 'vitest'
import type { Account, Category, Transaction } from '../../src/features/transactions/types'
import { EMPTY_FILTERS } from '../../src/features/transactions/types'
import {
  dayLabel,
  filterTransactions,
  formatAmount,
  groupTransactionsByDay,
  summarize,
} from '../../src/features/transactions/transaction-utils'

const ACCOUNTS: Account[] = [
  { id: 'icbc', name: '工资卡', group: '银行卡' },
  { id: 'alipay', name: '支付宝', group: '电子钱包' },
]

const CATEGORIES: Category[] = [
  { id: 'food', name: '餐饮', types: ['expense'], colorIndex: 1, icon: 'utensils' },
  { id: 'salary', name: '工资', types: ['income'], colorIndex: 2, icon: 'banknote' },
  { id: 'move', name: '转账', types: ['transfer'], colorIndex: 3, icon: 'transfer' },
]

const ITEMS: Transaction[] = [
  { id: 't1', type: 'expense', amount: -128.5, categoryId: 'food', subcategory: '午饭', accountId: 'alipay', date: '2026-11-04', note: '公司楼下' },
  { id: 't2', type: 'income', amount: 18320, categoryId: 'salary', subcategory: '月薪', accountId: 'icbc', date: '2026-11-04', note: '11 月工资' },
  { id: 't3', type: 'transfer', amount: -2000, categoryId: 'move', subcategory: '还信用卡', accountId: 'icbc', toAccountId: 'alipay', date: '2026-11-03', note: '' },
  { id: 't4', type: 'expense', amount: -35, categoryId: 'food', subcategory: '咖啡', accountId: 'alipay', date: '2026-11-03', note: '' },
]

describe('HF 流水纯函数', () => {
  it('金额带符号，支出用 Unicode 减号', () => {
    expect(formatAmount(-128.5)).toBe('−¥128.50')
    expect(formatAmount(18320)).toBe('+¥18,320.00')
    expect(formatAmount(0)).toBe('¥0.00')
  })

  it('今天 / 昨天按本地时区判定', () => {
    expect(dayLabel('2026-11-04', '2026-11-04')).toBe('今天 · 11月4日 周三')
    expect(dayLabel('2026-11-03', '2026-11-04')).toBe('昨天 · 11月3日 周二')
    expect(dayLabel('2026-11-01', '2026-11-04')).toBe('11月1日 周日')
  })

  it('筛选覆盖类型、账户（含转入）、分类、金额区间与关键词', () => {
    const byType = filterTransactions(ITEMS, { ...EMPTY_FILTERS, type: 'expense' }, ACCOUNTS, CATEGORIES)
    expect(byType.map((tx) => tx.id)).toEqual(['t1', 't4'])

    const byAccount = filterTransactions(ITEMS, { ...EMPTY_FILTERS, accountId: 'alipay' }, ACCOUNTS, CATEGORIES)
    expect(byAccount.map((tx) => tx.id)).toEqual(['t1', 't3', 't4'])

    const byAmount = filterTransactions(ITEMS, { ...EMPTY_FILTERS, min: 100, max: 300 }, ACCOUNTS, CATEGORIES)
    expect(byAmount.map((tx) => tx.id)).toEqual(['t1'])

    const byQuery = filterTransactions(ITEMS, { ...EMPTY_FILTERS, query: '月薪' }, ACCOUNTS, CATEGORIES)
    expect(byQuery.map((tx) => tx.id)).toEqual(['t2'])
  })

  it('按日分组倒序，小计不计转账', () => {
    const groups = groupTransactionsByDay(ITEMS, '2026-11-04')
    expect(groups.map((group) => group.date)).toEqual(['2026-11-04', '2026-11-03'])
    expect(groups[0].items).toHaveLength(2)
    expect(groups[0].subtotal).toBeCloseTo(18191.5)
    expect(groups[1].subtotal).toBeCloseTo(-35)
  })

  it('汇总把转账排除在收支之外', () => {
    expect(summarize(ITEMS)).toEqual({
      count: 4,
      income: 18320,
      expense: 163.5,
      net: 18156.5,
    })
  })
})
