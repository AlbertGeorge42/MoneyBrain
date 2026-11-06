/**
 * 推演端点手算对照（整数分）。
 *
 * 账本场景（asOf = 2026-11-06）：
 * - 现金账户 A：期初 0，11-01 已发生收入 200（20000 分）
 * - 投资账户 B：期初 300（30000 分），非现金类
 * - 信用卡 L：期初 −100（−10000 分，负债）
 * - 未来真实交易：11-20 支出 30；12-05 收入 80；12-15 A→B 转账 10
 * - 月度预算：收入 500、支出 100、转账 20（均月末）
 *
 * 「未来日期交易」只进 committed，预算只进 planned，两者相加不重复计。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testDbPath = path.resolve(__dirname, '../../prisma/test.db')

process.env.DATABASE_URL = `file:${testDbPath}`

const { default: app } = await import('../../src/index.js')
const { prisma } = await import('../../src/prisma.js')

const AS_OF = '2026-11-06'

const localDate = (year: number, month: number, day: number): Date => new Date(year, month - 1, day)

interface Balance {
  assets: number
  liabilities: number
  netWorth: number
}

interface FlowValue {
  actual: number
  planned: number
  committed: number
  total: number
}

interface AssetPoint {
  label: string
  date: string
  actual: Balance
  planned: Balance
  committed: Balance
  total: Balance
}

interface AssetProjection {
  asOf: string
  months: number
  base: Balance
  points: AssetPoint[]
}

interface CashFlowPoint {
  label: string
  date: string
  inflow: FlowValue
  outflow: FlowValue
  net: FlowValue
  startCash: number
  endCash: number
}

interface CashFlowProjection {
  asOf: string
  months: number
  startCash: number
  endCash: number
  points: CashFlowPoint[]
}

async function resetData() {
  await prisma.transaction.deleteMany()
  await prisma.budget.deleteMany()
  await prisma.auditEvent.deleteMany()
  await prisma.account.deleteMany()
  await prisma.accountCategory.deleteMany()
  await prisma.transactionCategory.deleteMany()
}

function zero(): Balance {
  return { assets: 0, liabilities: 0, netWorth: 0 }
}

async function seed() {
  await resetData()

  await prisma.accountCategory.createMany({
    data: [
      { id: 'proj-cat-cash', name: '推演现金', type: 'asset', isCashEquivalent: true },
      { id: 'proj-cat-invest', name: '推演投资', type: 'asset', isCashEquivalent: false },
      { id: 'proj-cat-debt', name: '推演负债', type: 'liability', isCashEquivalent: false },
    ],
  })
  await prisma.account.createMany({
    data: [
      { id: 'proj-acc-a', name: '现金账户', type: 'asset', initialBalance: 0n, categoryId: 'proj-cat-cash' },
      { id: 'proj-acc-b', name: '投资账户', type: 'asset', initialBalance: 30000n, categoryId: 'proj-cat-invest' },
      { id: 'proj-acc-l', name: '信用卡', type: 'liability', initialBalance: -10000n, categoryId: 'proj-cat-debt' },
    ],
  })
  await prisma.transactionCategory.createMany({
    data: [
      { id: 'proj-tc-income', name: '收入', type: 'income' },
      { id: 'proj-tc-expense', name: '支出', type: 'expense' },
      { id: 'proj-tc-transfer', name: '转账', type: 'transfer' },
    ],
  })

  // 已发生（date ≤ asOf）
  await prisma.transaction.create({
    data: {
      id: 'proj-actual-income',
      type: 'income',
      amount: 20000n,
      date: localDate(2026, 11, 1),
      accountId: 'proj-acc-a',
      categoryId: 'proj-tc-income',
    },
  })
  // 已排定未来真实交易（date > asOf）
  await prisma.transaction.createMany({
    data: [
      {
        id: 'proj-future-expense',
        type: 'expense',
        amount: 3000n,
        date: localDate(2026, 11, 20),
        accountId: 'proj-acc-a',
        categoryId: 'proj-tc-expense',
      },
      {
        id: 'proj-future-income',
        type: 'income',
        amount: 8000n,
        date: localDate(2026, 12, 5),
        accountId: 'proj-acc-a',
        categoryId: 'proj-tc-income',
      },
      {
        id: 'proj-future-transfer',
        type: 'transfer',
        amount: 1000n,
        date: localDate(2026, 12, 15),
        accountId: 'proj-acc-a',
        toAccountId: 'proj-acc-b',
        categoryId: 'proj-tc-transfer',
      },
    ],
  })

  await prisma.budget.createMany({
    data: [
      {
        id: 'proj-budget-income',
        name: '每月收入',
        type: 'income',
        amount: 50000n,
        period: 'monthly',
        startDate: localDate(2026, 1, 1),
        transactionTime: null,
        accountId: 'proj-acc-a',
        categoryId: 'proj-tc-income',
      },
      {
        id: 'proj-budget-expense',
        name: '每月支出',
        type: 'expense',
        amount: 10000n,
        period: 'monthly',
        startDate: localDate(2026, 1, 1),
        transactionTime: null,
        accountId: 'proj-acc-a',
        categoryId: 'proj-tc-expense',
      },
      {
        id: 'proj-budget-transfer',
        name: '每月转账',
        type: 'transfer',
        amount: 2000n,
        period: 'monthly',
        startDate: localDate(2026, 1, 1),
        transactionTime: null,
        accountId: 'proj-acc-a',
        toAccountId: 'proj-acc-b',
        categoryId: 'proj-tc-transfer',
      },
    ],
  })
}

describe('GET /api/analytics/asset-projection：planned / committed 不重复计', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    await resetData()
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await seed()
  })

  it('逐月手算对照：actual 不含未来交易，planned 与 committed 各计一次', async () => {
    const res = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, months: 3 })

    expect(res.status).toBe(200)
    const data = res.body.data as AssetProjection

    // 起点 = date ≤ asOf 的真实余额：A 200 + B 300 − L 100
    expect(data.asOf).toBe(AS_OF)
    expect(data.months).toBe(3)
    expect(data.base).toEqual({ assets: 50000, liabilities: 10000, netWorth: 40000 })

    expect(data.points).toHaveLength(3)
    expect(data.points.map((point) => point.label)).toEqual(['2026-11', '2026-12', '2027-01'])
    expect(data.points.map((point) => point.date)).toEqual(['2026-11-30', '2026-12-31', '2027-01-31'])

    // 11 月：预算净 400，未来支出 30 → 资产 500 + 400 − 30 = 870
    expect(data.points[0]).toMatchObject({
      actual: { assets: 50000, liabilities: 10000, netWorth: 40000 },
      planned: { assets: 40000, liabilities: 0, netWorth: 40000 },
      committed: { assets: -3000, liabilities: 0, netWorth: -3000 },
      total: { assets: 87000, liabilities: 10000, netWorth: 77000 },
    })

    // 12 月：预算累计 +800，committed 累计 +50（800 收入 − 30 支出 + 0 内部转账）
    expect(data.points[1].planned).toEqual({ assets: 80000, liabilities: 0, netWorth: 80000 })
    expect(data.points[1].committed).toEqual({ assets: 5000, liabilities: 0, netWorth: 5000 })
    expect(data.points[1].total).toEqual({ assets: 135000, liabilities: 10000, netWorth: 125000 })

    // 1 月：预算累计 +1200
    expect(data.points[2].planned).toEqual({ assets: 120000, liabilities: 0, netWorth: 120000 })
    expect(data.points[2].committed).toEqual({ assets: 5000, liabilities: 0, netWorth: 5000 })
    expect(data.points[2].total).toEqual({ assets: 175000, liabilities: 10000, netWorth: 165000 })

    // 每个点位上：actual + planned + committed = total（逐项相加，不存在第二份未来交易）
    for (const point of data.points) {
      expect(point.total.assets).toBe(point.actual.assets + point.planned.assets + point.committed.assets)
      expect(point.total.liabilities).toBe(point.actual.liabilities + point.planned.liabilities + point.committed.liabilities)
      expect(point.total.netWorth).toBe(point.actual.netWorth + point.planned.netWorth + point.committed.netWorth)
    }
  })

  it('12 个月的前 6 个点与单独请求 6 个月一致', async () => {
    const [twelve, six] = await Promise.all([
      request(app).get('/api/analytics/asset-projection').query({ asOf: AS_OF, months: 12 }),
      request(app).get('/api/analytics/asset-projection').query({ asOf: AS_OF, months: 6 }),
    ])

    expect(twelve.status).toBe(200)
    expect(six.status).toBe(200)
    const twelveData = twelve.body.data as AssetProjection
    const sixData = six.body.data as AssetProjection

    expect(twelveData.points.slice(0, 6)).toEqual(sixData.points)
    expect(twelveData.base).toEqual(sixData.base)
  })

  it('关闭 planned 后只保留 committed，关闭 committed 后只保留 planned', async () => {
    const noPlanned = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, months: 3, includePlanned: 'false' })
    const noCommitted = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, months: 3, includeCommitted: 'false' })

    expect(noPlanned.status).toBe(200)
    expect(noCommitted.status).toBe(200)

    const noPlannedData = noPlanned.body.data as AssetProjection
    const noCommittedData = noCommitted.body.data as AssetProjection

    expect(noPlannedData.points[0].planned).toEqual(zero())
    expect(noPlannedData.points[0].committed).toEqual({ assets: -3000, liabilities: 0, netWorth: -3000 })
    expect(noPlannedData.points[0].total.assets).toBe(47000)

    expect(noCommittedData.points[0].planned).toEqual({ assets: 40000, liabilities: 0, netWorth: 40000 })
    expect(noCommittedData.points[0].committed).toEqual(zero())
    expect(noCommittedData.points[0].total.assets).toBe(90000)
  })
})

describe('GET /api/reports/cash-flow-projection：期初 + 净额 = 期末', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    await resetData()
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await seed()
  })

  it('逐月 inflow/outflow/net 手算对照（现金流账户仅 A）', async () => {
    const res = await request(app)
      .get('/api/reports/cash-flow-projection')
      .query({ asOf: AS_OF, months: 3 })

    expect(res.status).toBe(200)
    const data = res.body.data as CashFlowProjection

    expect(data.startCash).toBe(0)
    expect(data.endCash).toBe(138000)

    // 11 月：期初 0 + 实际收入 200 + 预算净 380 − 未来支出 30 = 550
    expect(data.points[0]).toMatchObject({
      label: '2026-11',
      startCash: 0,
      endCash: 55000,
      inflow: { actual: 20000, planned: 50000, committed: 0, total: 70000 },
      outflow: { actual: 0, planned: 12000, committed: 3000, total: 15000 },
      net: { actual: 20000, planned: 38000, committed: -3000, total: 55000 },
    })

    // 12 月：预算净 380 + 未来收入 80 − 转出 10 = 450
    expect(data.points[1]).toMatchObject({
      label: '2026-12',
      startCash: 55000,
      endCash: 100000,
      inflow: { actual: 0, planned: 50000, committed: 8000, total: 58000 },
      outflow: { actual: 0, planned: 12000, committed: 1000, total: 13000 },
      net: { actual: 0, planned: 38000, committed: 7000, total: 45000 },
    })

    // 1 月：只剩预算净 380
    expect(data.points[2]).toMatchObject({
      label: '2027-01',
      startCash: 100000,
      endCash: 138000,
      inflow: { actual: 0, planned: 50000, committed: 0, total: 50000 },
      outflow: { actual: 0, planned: 12000, committed: 0, total: 12000 },
      net: { actual: 0, planned: 38000, committed: 0, total: 38000 },
    })

    for (const point of data.points) {
      expect(point.endCash).toBe(point.startCash + point.net.total)
      expect(point.inflow.total).toBe(point.inflow.actual + point.inflow.planned + point.inflow.committed)
      expect(point.outflow.total).toBe(point.outflow.actual + point.outflow.planned + point.outflow.committed)
      expect(point.net.total).toBe(point.inflow.total - point.outflow.total)
    }
  })

  it('12 个月的前 6 个点与单独请求 6 个月一致', async () => {
    const [twelve, six] = await Promise.all([
      request(app).get('/api/reports/cash-flow-projection').query({ asOf: AS_OF, months: 12 }),
      request(app).get('/api/reports/cash-flow-projection').query({ asOf: AS_OF, months: 6 }),
    ])

    const twelveData = twelve.body.data as CashFlowProjection
    const sixData = six.body.data as CashFlowProjection

    expect(twelveData.points.slice(0, 6)).toEqual(sixData.points)
    expect(twelveData.startCash).toBe(sixData.startCash)
  })
})

describe('GET /api/budgets/period-plan：未设预算的月份表达', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    await resetData()
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await seed()
    // 只保留一个 11 月有效的预算
    await prisma.budget.deleteMany()
    await prisma.budget.create({
      data: {
        id: 'proj-only-nov',
        name: '仅 11 月收入',
        type: 'income',
        amount: 50000n,
        period: 'monthly',
        startDate: localDate(2026, 11, 1),
        endDate: localDate(2026, 11, 30),
        transactionTime: null,
        accountId: 'proj-acc-a',
        categoryId: 'proj-tc-income',
      },
    })
  })

  it('有预算的月份给额度，无预算的月份给 hasBudget=false / totals=null', async () => {
    const res = await request(app)
      .get('/api/budgets/period-plan')
      .query({ fromMonth: '2026-11', months: 3 })

    expect(res.status).toBe(200)
    const data = res.body.data as {
      fromMonth: string
      months: number
      points: Array<{
        month: string
        hasBudget: boolean
        budgets: Array<{ budgetId: string; date: string; amount: number; type: string }>
        totals: { income: number; expense: number; transfer: number } | null
      }>
    }

    expect(data.points.map((point) => point.month)).toEqual(['2026-11', '2026-12', '2027-01'])

    expect(data.points[0].hasBudget).toBe(true)
    expect(data.points[0].totals).toEqual({ income: 50000, expense: 0, transfer: 0 })
    expect(data.points[0].budgets).toEqual([
      { budgetId: 'proj-only-nov', budgetName: '仅 11 月收入', type: 'income', date: '2026-11-30', amount: 50000 },
    ])

    // 无预算 = null，而不是 0
    expect(data.points[1].hasBudget).toBe(false)
    expect(data.points[1].totals).toBeNull()
    expect(data.points[1].budgets).toEqual([])
    expect(data.points[2].hasBudget).toBe(false)
    expect(data.points[2].totals).toBeNull()
  })
})
