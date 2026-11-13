/**
 * DTO → Ledger 适配层单测（总览只读接入）
 *
 * 只测纯映射：账户余额、分类图标 key、预算已用口径、本月收支快照与走势。
 * 不发网络请求。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  Account,
  AnalyticsAssetTrendItem,
  AnalyticsCategoryBreakdownItem,
  AnalyticsTrendItem,
  Budget,
  BudgetStatus,
  DashboardSummaryData,
  Transaction,
  TransactionCategory,
} from '@contracts/types'
import {
  buildLedgerFromApi,
  calendarDay,
  toLedgerTransaction,
  createCategoryDisplayMapper,
  type LedgerApiPayload,
} from '@/features/overview/apiLedger'
import {
  deriveBudgets,
  deriveExpenseCharts,
  deriveNetWorthTrend,
  deriveOverview,
  recentTwelveMonthsRange,
} from '@/features/overview/model'

function account(id: string, name: string, type: string, category: Partial<Account['category']> = {}): Account {
  return {
    id,
    name,
    type,
    initialBalance: 0,
    initialBalanceDate: null,
    categoryId: null,
    sort: 0,
    category: {
      id: `${id}-cat`,
      name: '分类',
      type: 'asset',
      isCashEquivalent: false,
      isInvestment: false,
      sort: 0,
      createdAt: '',
      updatedAt: '',
      ...category,
    } as Account['category'],
    createdAt: '',
    updatedAt: '',
  }
}

function category(
  id: string,
  name: string,
  parentId: string | null = null,
  type = 'expense',
  iconKey: string | null = null,
): TransactionCategory {
  return {
    id,
    name,
    type,
    parentId,
    sort: 0,
    parent: null,
    children: [],
    cashFlowType: null,
    iconKey,
    createdAt: '',
    updatedAt: '',
  }
}

function budget(id: string, name: string, categoryId: string, amount: number, period: Budget['period'] = 'monthly'): Budget {
  return {
    id,
    name,
    type: 'expense',
    amount,
    period,
    startDate: '2026-11-01',
    endDate: null,
    transactionTime: null,
    note: null,
    isActive: true,
    accountId: 'acc-1',
    toAccountId: null,
    categoryId,
    account: account('acc-1', '储蓄卡', 'asset'),
    toAccount: null,
    category: category(categoryId, name),
    createdAt: '',
    updatedAt: '',
  } as Budget
}

function transaction(id: string, type: Transaction['type'], amount: number, categoryId: string): Transaction {
  return {
    id,
    type,
    amount,
    fee: 0,
    coupon: 0,
    date: '2026-11-05',
    note: null,
    accountId: 'acc-1',
    toAccountId: null,
    categoryId,
    createdAt: '',
    updatedAt: '',
  } as unknown as Transaction
}

function status(b: Budget, used: number): BudgetStatus {
  return { budget: b, used, remaining: b.amount - used, percentage: 0, isOverBudget: false }
}

const assetTrend: AnalyticsAssetTrendItem[] = Array.from({ length: 12 }, (_, index) => ({
  label: `2025-12`,
  assets: 0,
  liabilities: 0,
  netWorth: 1_000_000 + index * 100_000,
}))

const dashboard: DashboardSummaryData = {
  thisMonth: { income: 1_500_000, expense: 600_000, balance: 900_000 },
  lastMonth: { income: 1_200_000, expense: 500_000 },
  recentTransactions: [
    transaction('t1', 'expense', 12_300, 'cat-food'),
    transaction('t2', 'income', 1_500_000, 'cat-salary'),
  ],
}

/** 后端 /analytics/trends 的按月聚合（故意与上游流水金额不同，用来证明前端没有重算）。 */
const expenseTrend: AnalyticsTrendItem[] = Array.from({ length: 12 }, (_, index) => {
  const date = new Date(Date.UTC(2025, 11 + index, 1))
  return {
    label: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
    amount: 1_000_000 + index * 50_000,
  }
})

const expenseCategories: AnalyticsCategoryBreakdownItem[] = [
  { name: '餐饮', value: 300_000, categoryId: 'cat-food', hasChildren: true },
  { name: '居住', value: 200_000, categoryId: 'cat-home', hasChildren: false },
  // 真实库存在空分类 / 0 元分类：保留在数据里，由图表过滤，不能打崩。
  { name: '零元分类', value: 0, categoryId: 'cat-zero', hasChildren: false },
]

function payload(overrides: Partial<LedgerApiPayload> = {}): LedgerApiPayload {
  const food = budget('b-food', '餐饮', 'cat-food', 100_000)
  return {
    accounts: [
      account('acc-1', '招商储蓄卡', 'asset'),
      account('acc-2', '微信零钱', 'asset', { isCashEquivalent: true }),
      account('acc-3', '长桥证券', 'asset', { isInvestment: true }),
      account('acc-4', '交行信用卡', 'liability'),
    ],
    categories: [
      category('cat-food', '餐饮', null, 'expense', 'gift'),
      category('cat-food-lunch', '午餐', 'cat-food'),
      category('cat-home', '居住'),
      category('cat-zero', '零元分类'),
      category('cat-salary', '工资', null, 'income'),
    ],
    accountCategories: [],
    budgets: [food],
    statuses: [status(food, 40_000)],
    dashboard,
    assetTrend,
    expenseTrend,
    expenseCategories,
    transactions: dashboard.recentTransactions,
    balances: new Map([
      ['acc-1', 500_000],
      ['acc-2', 50_000],
      ['acc-3', 1_000_000],
      ['acc-4', -100_000],
    ]),
    ...overrides,
  }
}

describe('DTO → Ledger 适配', () => {
  it('分类 iconKey 从 DTO 透传到 Ledger', () => {
    const ledger = buildLedgerFromApi(payload(), '2026-11-06')
    expect(ledger.categories.find((item) => item.name === '餐饮')?.iconKey).toBe('gift')
    expect(ledger.categories.find((item) => item.name === '居住')?.iconKey).toBeNull()
  })

  it('分类现金流活动从 DTO 透传到 Ledger', () => {
    const base = payload()
    const ledger = buildLedgerFromApi(
      {
        ...base,
        categories: base.categories.map((item) =>
          item.id === 'cat-food' ? { ...item, cashFlowType: 'operating' } : item,
        ),
      },
      '2026-11-06',
    )
    expect(ledger.categories.find((item) => item.name === '餐饮')?.cashFlowType).toBe('operating')
    expect(ledger.categories.find((item) => item.name === '居住')?.cashFlowType).toBeNull()
  })

  it('账户余额求和为净资产，并按现金等价 / 投资 / 负债分类', () => {
    const ledger = buildLedgerFromApi(payload(), '2026-11-06')
    const summary = deriveOverview(ledger)

    expect(summary.netWorth).toBe(1_450_000)
    expect(summary.liquidAssets).toBe(50_000)
    expect(summary.investmentAssets).toBe(1_000_000)
    expect(ledger.accounts.map((item) => item.kind)).toEqual(['deposit', 'cash', 'investment', 'credit'])
  })

  it('收支与环比采用 dashboard 快照，上月净资产取走势倒数第二点', () => {
    const ledger = buildLedgerFromApi(payload(), '2026-11-06')
    const summary = deriveOverview(ledger)

    expect(summary.income).toBe(1_500_000)
    expect(summary.expense).toBe(600_000)
    expect(summary.balance).toBe(900_000)
    expect(summary.savingsRate).toBeCloseTo(60, 5)
    expect(summary.previousNetWorth).toBe(2_000_000)
    expect(summary.elapsedDays).toBe(6)
    expect(ledger.snapshot?.periodLabel).toBe('2026 年 11 月')
    expect(ledger.snapshot?.today).toBe('2026-11-06')
  })

  it('dashboard 的历史负向支出只取金额绝对值，方向交给展示前缀', () => {
    const ledger = buildLedgerFromApi(
      payload({
        dashboard: {
          thisMonth: { income: 0, expense: -2_800, balance: 2_800 },
          lastMonth: { income: 0, expense: 0 },
          recentTransactions: dashboard.recentTransactions,
        },
      }),
      '2026-11-06',
    )
    const summary = deriveOverview(ledger)

    expect(summary.expense).toBe(2_800)
    expect(summary.income).toBe(0)
    expect(summary.expense).toBeGreaterThanOrEqual(0)
    expect(summary.expenseChangePct).toBe(0)
  })

  it('预算已用金额直接取后端状态，期间与分类映射保留', () => {
    const ledger = buildLedgerFromApi(payload(), '2026-11-06')
    const budgets = deriveBudgets(ledger)

    expect(budgets.rows).toHaveLength(1)
    expect(budgets.rows[0]).toMatchObject({ name: '餐饮', used: 40_000, limit: 100_000, level: 'normal' })
    expect(ledger.budgets[0]).toMatchObject({ period: 'monthly', categoryId: 'food' })
  })

  it('本月预算头部只合计月度且启用的支出预算，周/年与停用不并入', () => {
    const monthly = budget('b-monthly', '月度', 'cat-food', 300_000, 'monthly')
    const weekly = budget('b-weekly', '周度', 'cat-food', 70_000, 'weekly')
    const yearly = budget('b-yearly', '年度', 'cat-food', 3_600_000, 'yearly')
    const inactive = budget('b-off', '停用月度', 'cat-food', 50_000, 'monthly')
    inactive.isActive = false
    const ledger = buildLedgerFromApi(
      payload({
        budgets: [monthly, weekly, yearly, inactive],
        statuses: [
          status(monthly, 300_000),
          status(weekly, 70_000),
          status(yearly, 900_000),
          status(inactive, 10_000),
        ],
      }),
      '2026-11-06',
    )
    const budgets = deriveBudgets(ledger)

    // 旧口径会把 300,000 + 70,000 + 3,600,000 + 50,000 全加进「本月预算」。
    expect(budgets.rows.map((row) => row.id)).toEqual(['b-monthly'])
    expect(budgets.limit).toBe(300_000)
    expect(budgets.used).toBe(300_000)
    expect(budgets.percent).toBe(100)
  })

  it('分类命中种子名称时映射回稳定 key，供图标与筛选使用', () => {
    const ledger = buildLedgerFromApi(payload(), '2026-11-06')
    const byName = new Map(ledger.categories.map((item) => [item.name, item]))

    expect(byName.get('餐饮')?.id).toBe('food')
    expect(byName.get('午餐')?.parentId).toBe('food')
    expect(byName.get('工资')?.id).toBe('salary')
  })

  it('最近交易保留本地日历日并保留转账 / 费用字段', () => {
    const ledger = buildLedgerFromApi(payload(), '2026-11-06')

    expect(ledger.transactions).toHaveLength(2)
    expect(ledger.transactions[0]).toMatchObject({ id: 't1', date: '2026-11-05', categoryId: 'food', note: '' })
    expect(ledger.transactions[1]).toMatchObject({ type: 'income', categoryId: 'salary' })
  })

  it('走势末点随当前净资产联动，前缀沿用真实月份', () => {
    const ledger = buildLedgerFromApi(payload(), '2026-11-06')
    const trend = deriveNetWorthTrend(1_450_000, ledger.snapshot?.trend)

    expect(trend).toHaveLength(12)
    expect(trend[0].value).toBe(1_000_000)
    expect(trend[trend.length - 1].value).toBe(1_450_000)
  })

  it('账户缺少当日余额时抛错，而不是用 0 静默兜底', () => {
    const partial = payload({ balances: new Map([['acc-1', 500_000]]) })
    expect(() => buildLedgerFromApi(partial, '2026-11-06')).toThrow(/缺少当日余额/)
  })

  it('支出趋势按月直接采用后端聚合，不由流水重算', () => {
    // 流水里只有一笔 999,999 的支出，与后端趋势值完全不同。
    const ledger = buildLedgerFromApi(
      payload({ transactions: [transaction('exp-1', 'expense', 999_999, 'cat-food')] }),
      '2026-11-06',
    )
    const charts = deriveExpenseCharts(ledger, '2026-11-06')

    expect(charts.trend.map((point) => point.month)).toEqual(expenseTrend.map((item) => item.label))
    expect(charts.trend.map((point) => point.value)).toEqual(expenseTrend.map((item) => item.amount))
    expect(charts.trend.at(-1)?.month).toBe('2026-11')
  })

  it('分类构成沿用后端聚合值并按展示 id 映射，0 元分类保留不崩', () => {
    const ledger = buildLedgerFromApi(payload(), '2026-11-06')
    const charts = deriveExpenseCharts(ledger, '2026-11-06')

    expect(charts.categories).toEqual([
      { id: 'food', name: '餐饮', amount: 300_000 },
      { id: 'home', name: '居住', amount: 200_000 },
      { id: 'cat-zero', name: '零元分类', amount: 0 },
    ])
    expect(charts.range).toEqual({ from: '2025-12-01', to: '2026-11-30' })
  })

  it('近 12 个月区间从 11 个月前的 1 日到当月最后一天', () => {
    expect(recentTwelveMonthsRange('2026-11-06')).toEqual({ from: '2025-12-01', to: '2026-11-30' })
    expect(recentTwelveMonthsRange('2026-01-15')).toEqual({ from: '2025-02-01', to: '2026-01-31' })
    expect(recentTwelveMonthsRange('2028-02-29')).toEqual({ from: '2027-03-01', to: '2028-02-29' })
  })
})

describe('账本日期解析：本地日历日', () => {
  const mapper = createCategoryDisplayMapper([category('food', '餐饮')])

  it('date-only 原样保留，不随时区变化（UTC+8 / UTC-5 / UTC 结果相同）', () => {
    // 这些断言不读取本地时区，三种时区跑同一份用例结果必须一致。
    expect(calendarDay('2026-12-31')).toBe('2026-12-31')
    expect(calendarDay('2027-01-01')).toBe('2027-01-01')
    expect(calendarDay('2026-11-01')).toBe('2026-11-01')
  })

  it('历史 ISO 载荷按客户端本地时区显式解析，与旧前端 dayjs 一致', () => {
    // 本地午夜序列化为 ISO 后（UTC+8 = 前一日 16:00Z）再解析回来，
    // 必须仍是同一个日历日，不能靠截取 UTC 日期前缀。
    const localMidnight = new Date(2026, 11, 31, 0, 0, 0)
    expect(calendarDay(localMidnight.toISOString())).toBe('2026-12-31')
  })

  it('交易 DTO 的 date-only 日期进入账本模型后仍是同一天', () => {
    const dto = { ...transaction('t-boundary', 'expense', 10_000, 'food'), date: '2026-12-31' }
    expect(toLedgerTransaction(dto, mapper).date).toBe('2026-12-31')
  })

  it('非法值返回空串，不再产生 Invalid Date', () => {
    expect(calendarDay('not-a-date')).toBe('')
  })

  it('适配层不再用 slice(0, 10) 截断交易日期', () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../src/features/overview/apiLedger.ts'),
      'utf8',
    )
    expect(source).not.toMatch(/transaction\.date\.slice\s*\(\s*0\s*,\s*10\s*\)/)
    expect(source).toContain('export function calendarDay')
  })
})
