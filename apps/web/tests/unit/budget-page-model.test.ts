/**
 * 预算页数据模型单测（HF 修复批次）
 *
 * 覆盖三类预算、80–100% warning、超支金额、收入达成、转账不计入预算与历史月份结算。
 */
import { describe, expect, it } from 'vitest'
import { createSeedLedger } from '@/dev-fixtures/seed'
import { createBudgetId, deriveBudgetPage, shiftMonth } from '@/features/budgets/budgetModel'
import type {
  Ledger,
  LedgerBudget,
  LedgerTransaction,
} from '@/features/overview/model'
import { makeLedger as makeTestLedger } from '../helpers/ledger'

function makeLedger(
  budgets: LedgerBudget[],
  transactions: LedgerTransaction[] = [],
): Ledger {
  return makeTestLedger({
    accounts: [
      { id: 'a', name: '账户 A', kind: 'cash', balance: 0 },
      { id: 'b', name: '账户 B', kind: 'cash', balance: 0 },
      { id: 'c', name: '账户 C', kind: 'cash', balance: 0 },
    ],
    categories: [
      { id: 'food', name: '餐饮', type: 'expense' },
      { id: 'shop', name: '购物', type: 'expense' },
      { id: 'traffic', name: '交通', type: 'expense' },
      { id: 'move', name: '账户互转', type: 'transfer' },
    ],
    budgets,
    transactions,
  })
}

function tx(
  id: string,
  date: string,
  type: LedgerTransaction['type'],
  categoryId: string,
  accountId: string,
  amount: number,
  extra: Partial<LedgerTransaction> = {},
): LedgerTransaction {
  return { id, date, type, categoryId, note: '', accountId, amount, ...extra }
}

describe('预算页数据', () => {
  const ledger = createSeedLedger()
  // 用量由后端 statuses 提供；前端只做合计、分组、排序与文案。
  const statusById = new Map([
    ['b_food', { used: 28_600, isActive: true }],
    ['b_home', { used: 560_000, isActive: true }],
    ['b_shop', { used: 125_720, isActive: true }],
    ['b_fun', { used: 7_900, isActive: true }],
    ['b_traffic', { used: 600, isActive: true }],
    ['b_edu', { used: 0, isActive: true }],
    ['b_salary', { used: 1_850_000, isActive: true }],
    ['b_move', { used: 500_000, isActive: true }],
  ])
  const page = deriveBudgetPage(ledger, '2026-10', { statusById })

  it('头部可花只算月度启用支出预算（周/年不并入）', () => {
    // 月度 ¥3,000 已用满 + 周度 ¥700 + 年度 ¥36,000。
    // 旧口径把三者相加并减去全部用量，会显示可花 ¥27,000；修正后只剩月度口径。
    expect(page.expense.used).toBe(722_220)
    expect(page.expense.limit).toBe(799_000)
    expect(page.expense.percent).toBeCloseTo(90.4, 1)
    expect(page.expense.remaining).toBe(76_780)
  })

  it('存在一行超支与一行 80–100% warning', () => {
    expect(page.over.map((row) => row.id)).toEqual(['b_shop'])
    expect(page.over[0].status).toBe('超支 ¥457.20')
    expect(page.near.map((row) => row.id)).toContain('b_fun')
    expect(page.near.find((row) => row.id === 'b_fun')?.percent).toBeCloseTo(87.8, 1)
    const food = page.groups[0].rows.find((row) => row.id === 'b_food')
    expect(food?.status).toBe('剩余 ¥1,214.00')
  })

  it('收入达成；转账不计入预算告警', () => {
    const income = page.groups.find((group) => group.type === 'income')?.rows[0]
    const transfer = page.groups.find((group) => group.type === 'transfer')?.rows[0]
    expect(income?.level).toBe('achieved')
    expect(income?.status).toBe('已达成')
    expect(transfer?.percent).toBe(100)
    expect(transfer?.level).toBe('neutral')
    expect(transfer?.status).toBe('不计入预算')
  })

  it('收入未达成判 neutral（进行中），不显示成绿、也不显示「接近上限」', () => {
    const halfGoal = {
      ...ledger,
      budgets: ledger.budgets.map((budget) =>
        budget.id === 'b_salary' ? { ...budget, limit: 3_700_000 } : budget,
      ),
    }
    const page = deriveBudgetPage(halfGoal, '2026-10', { statusById })
    const income = page.groups.find((group) => group.type === 'income')?.rows[0]
    expect(income?.percent).toBeCloseTo(50, 1)
    expect(income?.level).toBe('neutral')
    expect(income?.status).toBe('还差 ¥18,500.00')
  })

  it('历史月份没有后端用量时按未知处理，只保留月份标签', () => {
    const previous = deriveBudgetPage(createSeedLedger(), '2025-09')
    expect(previous.expense.used).toBe(0)
    expect(previous.expense.percent).toBe(0)
    expect(previous.groups[0].rows[0].status).toBe('用量未知')
    expect(previous.monthLabel).toBe('2025 年 9 月')
  })

  it('月份前后切换跨年正确', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })

  it('停用的支出预算不再计入合计与告警，但条目仍保留在列表里', () => {
    const shop = page.groups[0].rows.find((row) => row.id === 'b_shop')
    expect(shop).toBeDefined()
    const inactive = deriveBudgetPage(ledger, '2026-10', {
      activeById: new Map([['b_shop', false]]),
      statusById,
    })
    expect(inactive.expense.limit).toBe(page.expense.limit - (shop?.limit ?? 0))
    expect(inactive.expense.used).toBe(page.expense.used - (shop?.used ?? 0))
    expect(inactive.over).toEqual([])
    expect(inactive.disabledExpenseCount).toBe(1)
    expect(inactive.groups[0].rows.find((row) => row.id === 'b_shop')?.isActive).toBe(false)
  })

  it('新增预算编号递增', () => {
    expect(createBudgetId(ledger.budgets)).toBe('b_1')
  })
})

describe('预算口径修正（statuses 与种子降级）', () => {
  it('月度 ¥3,000 已用满 + 周度 ¥700 + 年度 ¥36,000：头部不得显示可花 ¥27,000', () => {
    const budgets: LedgerBudget[] = [
      { id: 'm', name: '月度', type: 'expense', period: 'monthly', limit: 300_000, categoryId: 'food', accountId: 'a' },
      { id: 'w', name: '周度', type: 'expense', period: 'weekly', limit: 70_000, categoryId: 'food', accountId: 'a' },
      { id: 'y', name: '年度', type: 'expense', period: 'yearly', limit: 3_600_000, categoryId: 'food', accountId: 'a' },
    ]
    const statusById = new Map([
      ['m', { used: 300_000, isActive: true }],
      ['w', { used: 70_000, isActive: true }],
      ['y', { used: 900_000, isActive: true }],
    ])
    const page = deriveBudgetPage(makeLedger(budgets), '2026-10', { statusById })
    // 旧口径 3,970,000 - 1,270,000 = 2,700,000（¥27,000）；修正后只算月度。
    expect(page.expense.limit).toBe(300_000)
    expect(page.expense.used).toBe(300_000)
    expect(page.expense.remaining).toBe(0)
    expect(page.expense.remaining).not.toBe(2_700_000)
    // 非月度预算不被隐藏，仍用自己的周期用量出现在明细里。
    expect(page.groups[0].rows.map((row) => row.id)).toEqual(['m', 'w', 'y'])
    expect(page.groups[0].rows.find((row) => row.id === 'w')?.used).toBe(70_000)
    expect(page.groups[0].rows.find((row) => row.id === 'y')?.used).toBe(900_000)
  })

  it('API 模式直接采用后端 statuses.used，不按流水重算', () => {
    const budgets: LedgerBudget[] = [
      { id: 'm', name: '餐饮', type: 'expense', period: 'monthly', limit: 100_000, categoryId: 'food', accountId: 'a' },
    ]
    const transactions = [tx('t1', '2026-10-20', 'expense', 'food', 'a', 10_000)]
    const page = deriveBudgetPage(makeLedger(budgets, transactions), '2026-10', {
      statusById: new Map([['m', { used: 45_000, isActive: true }]]),
    })
    expect(page.groups[0].rows[0].used).toBe(45_000)
    expect(page.expense.remaining).toBe(55_000)
  })

  it('statuses 的 isActive=false 不计入头部，但条目保留', () => {
    const budgets: LedgerBudget[] = [
      { id: 'on', name: '启用', type: 'expense', period: 'monthly', limit: 100_000, categoryId: 'food', accountId: 'a' },
      { id: 'off', name: '停用', type: 'expense', period: 'monthly', limit: 50_000, categoryId: 'shop', accountId: 'a' },
    ]
    const page = deriveBudgetPage(makeLedger(budgets), '2026-10', {
      statusById: new Map([
        ['on', { used: 50_000, isActive: true }],
        ['off', { used: 40_000, isActive: false }],
      ]),
    })
    expect(page.expense.limit).toBe(100_000)
    expect(page.expense.used).toBe(50_000)
    expect(page.disabledExpenseCount).toBe(1)
    expect(page.groups[0].rows.find((row) => row.id === 'off')?.isActive).toBe(false)
  })

  it('种子模式没有后端用量：只给额度，不编造已用与告警', () => {
    const budgets: LedgerBudget[] = [
      { id: 'shop', name: '购物', type: 'expense', period: 'monthly', limit: 100_000, categoryId: 'shop', accountId: 'a' },
    ]
    // 流水存在也不在本地重算：用量只认后端。
    const transactions = [tx('t1', '2026-10-10', 'expense', 'shop', 'a', 50_000)]
    const page = deriveBudgetPage(makeLedger(budgets, transactions), '2026-10')
    const row = page.groups[0].rows[0]
    expect(row.used).toBe(0)
    expect(row.percent).toBe(0)
    expect(row.status).toBe('用量未知')
    expect(page.expense.used).toBe(0)
    expect(page.expense.remaining).toBe(100_000)
    expect(page.over).toEqual([])
    expect(page.near).toEqual([])
  })

  it('账本已带后端 used 时直接采用，不按流水重算', () => {
    const budgets: LedgerBudget[] = [
      { id: 'shop', name: '购物', type: 'expense', period: 'monthly', limit: 100_000, categoryId: 'shop', accountId: 'a', used: 100_000 },
    ]
    const transactions = [tx('t1', '2026-10-10', 'expense', 'shop', 'a', 10_000)]
    const page = deriveBudgetPage(makeLedger(budgets, transactions), '2026-10')
    expect(page.groups[0].rows[0].used).toBe(100_000)
    expect(page.groups[0].rows[0].status).toBe('已达上限')
  })
})
