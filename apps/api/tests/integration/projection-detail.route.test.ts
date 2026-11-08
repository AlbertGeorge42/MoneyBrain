/**
 * 未来明细：账户/分类级资产、收支新端点、现金流活动分组、occurrence 分类互斥。
 *
 * 账本（asOf = 2026-11-06）：
 * - 现金账户 A（现金等价，分类「现金」）：期初 0；11-01 已发生收入 200
 * - 投资账户 B（分类「投资」，isInvestment）：期初 300
 * - 信用卡 L（负债，分类「负债」）：期初 −100
 * - 未来真实交易：11-20 伙食 30（food）、11-25 房租 50（rent）、
 *   12-10 A→B 转账 40（category cashFlowType=investing）、12-20 收入 80（salary）
 * - 月度预算：收入 500（salary）、伙食 100（food）、房租 100（rent）、转账 20（investing）
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'

const { default: app } = await import('../../src/index.js')
const { prisma } = await import('../../src/prisma.js')

const AS_OF = '2026-11-06'
const FROM = '2026-11-01'
const TO = '2027-01-31'
const localDate = (year: number, month: number, day: number): Date => new Date(year, month - 1, day)

interface FlowValue { actual: number; committed: number; planned: number; total: number }
interface SourceValue { actual: number; committed: number; planned: number | null; total: number }

async function resetData() {
  await prisma.transaction.deleteMany()
  await prisma.budget.deleteMany()
  await prisma.auditEvent.deleteMany()
  await prisma.account.deleteMany()
  await prisma.accountCategory.deleteMany()
  await prisma.transactionCategory.deleteMany()
}

async function seed() {
  await resetData()

  await prisma.accountCategory.createMany({
    data: [
      { id: 'det-cat-cash', name: '现金', type: 'asset', isCashEquivalent: true },
      { id: 'det-cat-invest', name: '投资', type: 'asset', isCashEquivalent: false, isInvestment: true },
      { id: 'det-cat-debt', name: '负债', type: 'liability', isCashEquivalent: false },
    ],
  })
  await prisma.account.createMany({
    data: [
      { id: 'det-acc-a', name: '现金账户', type: 'asset', initialBalance: 0n, categoryId: 'det-cat-cash' },
      { id: 'det-acc-b', name: '投资账户', type: 'asset', initialBalance: 30000n, categoryId: 'det-cat-invest' },
      { id: 'det-acc-l', name: '信用卡', type: 'liability', initialBalance: -10000n, categoryId: 'det-cat-debt' },
    ],
  })
  await prisma.transactionCategory.createMany({
    data: [
      { id: 'det-tc-salary', name: '工资', type: 'income', cashFlowType: 'operating' },
      { id: 'det-tc-food', name: '伙食', type: 'expense', cashFlowType: 'operating' },
      { id: 'det-tc-rent', name: '房租', type: 'expense', cashFlowType: 'operating' },
      { id: 'det-tc-transfer', name: '投资转账', type: 'transfer', cashFlowType: 'investing' },
    ],
  })

  await prisma.transaction.create({
    data: {
      id: 'det-actual-income',
      type: 'income',
      amount: 20000n,
      date: localDate(2026, 11, 1),
      accountId: 'det-acc-a',
      categoryId: 'det-tc-salary',
    },
  })
  await prisma.transaction.createMany({
    data: [
      {
        id: 'det-future-food',
        type: 'expense',
        amount: 3000n,
        date: localDate(2026, 11, 20),
        accountId: 'det-acc-a',
        categoryId: 'det-tc-food',
      },
      {
        id: 'det-future-rent',
        type: 'expense',
        amount: 5000n,
        date: localDate(2026, 11, 25),
        accountId: 'det-acc-a',
        categoryId: 'det-tc-rent',
      },
      {
        id: 'det-future-transfer',
        type: 'transfer',
        amount: 4000n,
        date: localDate(2026, 12, 10),
        accountId: 'det-acc-a',
        toAccountId: 'det-acc-b',
        categoryId: 'det-tc-transfer',
      },
      {
        id: 'det-future-income',
        type: 'income',
        amount: 8000n,
        date: localDate(2026, 12, 20),
        accountId: 'det-acc-a',
        categoryId: 'det-tc-salary',
      },
    ],
  })

  await prisma.budget.createMany({
    data: [
      {
        id: 'det-budget-income',
        name: '每月收入',
        type: 'income',
        amount: 50000n,
        period: 'monthly',
        startDate: localDate(2026, 1, 1),
        transactionTime: null,
        accountId: 'det-acc-a',
        categoryId: 'det-tc-salary',
      },
      {
        id: 'det-budget-food',
        name: '每月伙食',
        type: 'expense',
        amount: 10000n,
        period: 'monthly',
        startDate: localDate(2026, 1, 1),
        transactionTime: null,
        accountId: 'det-acc-a',
        categoryId: 'det-tc-food',
      },
      {
        id: 'det-budget-rent',
        name: '每月房租',
        type: 'expense',
        amount: 10000n,
        period: 'monthly',
        startDate: localDate(2026, 1, 1),
        transactionTime: null,
        accountId: 'det-acc-a',
        categoryId: 'det-tc-rent',
      },
      {
        id: 'det-budget-transfer',
        name: '每月买入',
        type: 'transfer',
        amount: 2000n,
        period: 'monthly',
        startDate: localDate(2026, 1, 1),
        transactionTime: null,
        accountId: 'det-acc-a',
        toAccountId: 'det-acc-b',
        categoryId: 'det-tc-transfer',
      },
    ],
  })
}

describe('资产投影账户/分类明细', () => {
  beforeAll(async () => { await prisma.$connect() })
  afterAll(async () => { await resetData(); await prisma.$disconnect() })
  beforeEach(async () => { await seed() })

  it('按账户展开，负债取正数欠款，投资账户标注按转账排期推演', async () => {
    const res = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, from: FROM, to: TO, granularity: 'month' })

    expect(res.status).toBe(200)
    const data = res.body.data as {
      points: Array<{
        label: string
        accounts: Array<{
          accountId: string
          name: string
          type: string
          categoryId: string
          isInvestment: boolean
          actual: number
          committed: number
          planned: number
          total: number
          hasFutureEvents: boolean
          valuationNote: string | null
        }>
        categories: Array<{ categoryId: string; actual: number; committed: number; planned: number; total: number }>
      }>
    }

    const nov = data.points[0]
    const accA = nov.accounts.find((account) => account.accountId === 'det-acc-a')!
    expect(accA).toMatchObject({
      type: 'asset',
      categoryId: 'det-cat-cash',
      actual: 20000,
      // 11-30 收入预算 500 减去 11 月买入预算 20；11-20/25 真实支出合计 80 进 committed
      planned: 48000,
      committed: -8000,
      total: 60000,
      hasFutureEvents: true,
      valuationNote: null,
    })

    const accB = nov.accounts.find((account) => account.accountId === 'det-acc-b')!
    expect(accB).toMatchObject({
      actual: 30000,
      committed: 0,
      planned: 2000,
      total: 32000,
      isInvestment: true,
      valuationNote: 'transfer_schedule_only',
    })

    // 负债账户对外是正数欠款
    const accL = nov.accounts.find((account) => account.accountId === 'det-acc-l')!
    expect(accL).toMatchObject({ type: 'liability', actual: 10000, committed: 0, planned: 0, total: 10000 })

    const jan = data.points[2]
    const janA = jan.accounts.find((account) => account.accountId === 'det-acc-a')!
    // 十一月净计划 480 + 十二月支出计划 200 + 一月净计划 280 = 560
    expect(janA.planned).toBe(56000)
    // 已排定：11 月支出 −80、12 月收入 +80、12 月买入 −40
    expect(janA.committed).toBe(-4000)
    expect(janA.total).toBe(72000)
    const janB = jan.accounts.find((account) => account.accountId === 'det-acc-b')!
    // 12、1 月买入预算 20 × 2 + 12-10 已排定买入 40
    expect(janB.planned).toBe(4000)
    expect(janB.committed).toBe(4000)
    expect(janB.total).toBe(38000)

    const cashCategory = nov.categories.find((category) => category.categoryId === 'det-cat-cash')!
    expect(cashCategory).toMatchObject({ actual: 20000, planned: 48000, committed: -8000, total: 60000 })
  })
})

describe('GET /api/reports/income-expense-projection', () => {
  beforeAll(async () => { await prisma.$connect() })
  afterAll(async () => { await resetData(); await prisma.$disconnect() })
  beforeEach(async () => { await seed() })

  it('三来源合计与分类树：无预算来源的分类 planned=null', async () => {
    const res = await request(app)
      .get('/api/reports/income-expense-projection')
      .query({ asOf: AS_OF, from: FROM, to: TO, granularity: 'month' })

    expect(res.status).toBe(200)
    const data = res.body.data as {
      income: SourceValue
      expense: SourceValue
      balance: SourceValue
      incomeCategoryDetails: Array<{ categoryId: string; actual: number; committed: number; planned: number | null; total: number; hasBudget: boolean }>
      expenseCategoryDetails: Array<{ categoryId: string; actual: number; committed: number; planned: number | null; total: number; hasBudget: boolean }>
      points: Array<{ label: string; income: SourceValue; expense: SourceValue; balance: SourceValue }>
    }

    // 收入：已发生 200 + 已排定 80 + 计划 500×2（12 月点位被 12-20 覆盖）
    expect(data.income).toEqual({ actual: 20000, committed: 8000, planned: 100000, total: 128000 })
    // 支出：已排定 30 + 50；计划 100×4（11 月两个点位被覆盖）
    expect(data.expense).toEqual({ actual: 0, committed: 8000, planned: 40000, total: 48000 })
    expect(data.balance).toEqual({ actual: 20000, committed: 0, planned: 60000, total: 80000 })

    const salary = data.incomeCategoryDetails.find((node) => node.categoryId === 'det-tc-salary')!
    expect(salary).toMatchObject({ actual: 20000, committed: 8000, planned: 100000, total: 128000, hasBudget: true })

    const food = data.expenseCategoryDetails.find((node) => node.categoryId === 'det-tc-food')!
    expect(food).toMatchObject({ committed: 3000, planned: 20000, total: 23000, hasBudget: true })
    const rent = data.expenseCategoryDetails.find((node) => node.categoryId === 'det-tc-rent')!
    expect(rent).toMatchObject({ committed: 5000, planned: 20000, total: 25000, hasBudget: true })

    expect(data.points.map((point) => point.label)).toEqual(['2026-11', '2026-12', '2027-01'])
    expect(data.points[0].income).toMatchObject({ actual: 20000, committed: 0, planned: 50000, total: 70000 })
    // 12 月点位实际按桶取值：收入预算被 12-20 真实收入覆盖，planned=null
    expect(data.points[1].income).toMatchObject({ actual: 0, committed: 8000, planned: null, total: 8000 })
  })

  it('分类没有预算时 planned 为 null，而不是 0', async () => {
    await prisma.budget.deleteMany()
    await prisma.budget.create({
      data: {
        id: 'det-budget-rent-only',
        name: '只排房租',
        type: 'expense',
        amount: 10000n,
        period: 'monthly',
        startDate: localDate(2026, 1, 1),
        transactionTime: null,
        accountId: 'det-acc-a',
        categoryId: 'det-tc-rent',
      },
    })

    const res = await request(app)
      .get('/api/reports/income-expense-projection')
      .query({ asOf: AS_OF, from: FROM, to: TO, granularity: 'month' })

    const data = res.body.data as {
      expenseCategoryDetails: Array<{ categoryId: string; planned: number | null; hasBudget: boolean }>
    }
    const food = data.expenseCategoryDetails.find((node) => node.categoryId === 'det-tc-food')!
    expect(food.planned).toBeNull()
    expect(food.hasBudget).toBe(false)
    const rent = data.expenseCategoryDetails.find((node) => node.categoryId === 'det-tc-rent')!
    expect(rent.planned).not.toBeNull()
    expect(rent.hasBudget).toBe(true)
  })
})

describe('现金流投影活动分组与窗口桑基', () => {
  beforeAll(async () => { await prisma.$connect() })
  afterAll(async () => { await resetData(); await prisma.$disconnect() })
  beforeEach(async () => { await seed() })

  it('经营/投资归组、三来源合计与期初期末一致', async () => {
    const res = await request(app)
      .get('/api/reports/cash-flow-projection')
      .query({ asOf: AS_OF, from: FROM, to: TO, granularity: 'month' })

    expect(res.status).toBe(200)
    const data = res.body.data as {
      startCash: number
      endCash: number
      cashInflow: FlowValue
      cashOutflow: FlowValue
      netCashFlow: FlowValue
      byActivity: Record<'operating' | 'investing' | 'financing' | 'uncategorized', {
        inflow: FlowValue
        outflow: FlowValue
        net: FlowValue
        items: Array<{ categoryName: string; actual: number; committed: number; planned: number | null; total: number }>
      }>
      sankey: { nodes: Array<{ name: string }>; links: Array<{ source: string; target: string; value: number }> }
    }

    expect(data.byActivity.operating.inflow).toEqual({ actual: 20000, committed: 8000, planned: 100000, total: 128000 })
    expect(data.byActivity.operating.outflow).toEqual({ actual: 0, committed: 8000, planned: 40000, total: 48000 })
    expect(data.byActivity.investing.outflow).toEqual({ actual: 0, committed: 4000, planned: 4000, total: 8000 })
    expect(data.byActivity.financing.net).toEqual({ actual: 0, committed: 0, planned: 0, total: 0 })

    const salary = data.byActivity.operating.items.find((item) => item.categoryName === '工资')!
    expect(salary).toMatchObject({ actual: 20000, committed: 8000, planned: 100000, total: 128000 })
    const transfer = data.byActivity.investing.items.find((item) => item.categoryName === '投资转账')!
    expect(transfer).toMatchObject({ actual: 0, committed: -4000, planned: -4000, total: -8000 })

    expect(data.netCashFlow.total).toBe(data.cashInflow.total - data.cashOutflow.total)
    expect(data.endCash).toBe(data.startCash + data.netCashFlow.total)
    expect(data.startCash).toBe(0)
    expect(data.endCash).toBe(72000)

    expect(data.sankey.nodes.length).toBeGreaterThan(0)
    expect(data.sankey.links.length).toBeGreaterThan(0)
    expect(data.sankey.links.every((link) => link.value >= 0)).toBe(true)
  })
})

/**
 * 分类互斥专用账本：同账户、同类型、同周期，但分类不同。
 * 预算只排「房租」，真实交易记「伙食」。
 * 收紧前（只看类型+账户）真实伙食会吃掉房租点位；收紧后不会，两边都保留。
 */
describe('occurrence 互斥必须同分类', () => {
  beforeAll(async () => { await prisma.$connect() })
  afterAll(async () => { await resetData(); await prisma.$disconnect() })

  beforeEach(async () => {
    await resetData()
    await prisma.accountCategory.create({
      data: { id: 'iso-cat-cash', name: '互斥现金', type: 'asset', isCashEquivalent: true },
    })
    await prisma.account.create({
      data: { id: 'iso-acc-a', name: '互斥账户', type: 'asset', initialBalance: 0n, categoryId: 'iso-cat-cash' },
    })
    await prisma.transactionCategory.createMany({
      data: [
        { id: 'iso-tc-food', name: '伙食', type: 'expense' },
        { id: 'iso-tc-rent', name: '房租', type: 'expense' },
      ],
    })
    await prisma.transaction.create({
      data: {
        id: 'iso-food-tx',
        type: 'expense',
        amount: 3000n,
        date: localDate(2026, 12, 5),
        accountId: 'iso-acc-a',
        categoryId: 'iso-tc-food',
      },
    })
    await prisma.budget.create({
      data: {
        id: 'iso-rent-budget',
        name: '房租',
        type: 'expense',
        amount: 20000n,
        period: 'monthly',
        startDate: localDate(2026, 1, 1),
        transactionTime: null,
        accountId: 'iso-acc-a',
        categoryId: 'iso-tc-rent',
      },
    })
  })

  it('不同分类的真实交易不覆盖预算点位：planned 与 committed 两侧都保留', async () => {
    const res = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, from: FROM, to: TO, granularity: 'month' })

    const data = res.body.data as {
      points: Array<{
        label: string
        planned: { assets: number }
        committed: { assets: number }
        covered: Array<{ budgetId: string; transactionId: string }>
      }>
    }

    // 11、12 月各有房租预算 200；12-05 伙食 30 分类不同，不配对。
    expect(data.points[1].planned.assets).toBe(-40000)
    expect(data.points[1].committed.assets).toBe(-3000)
    expect(data.points[1].covered).toEqual([])
  })
})
