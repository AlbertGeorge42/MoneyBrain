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
 * planned 与 committed 的数据源不重叠；同一 occurrence 两者都有时互斥，
 * 点位从 planned 剔除、金额只留在 committed，并在点位 `covered` 中标注。
 * 本场景 11 月支出、12 月收入、12 月转账三处发生覆盖。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'

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

interface CoveredOccurrence {
  budgetId: string
  budgetName: string
  type: string
  date: string
  amount: number
  transactionId: string
  transactionDate: string
}

interface AssetPoint {
  granularity: string
  label: string
  start: string
  end: string
  date: string
  actual: Balance
  planned: Balance
  committed: Balance
  total: Balance
  covered: CoveredOccurrence[]
}

interface AssetProjection {
  asOf: string
  granularity: string
  start: string
  end: string
  bucketCount: number
  fromMonth?: string
  months?: number
  base: Balance
  points: AssetPoint[]
}

interface CashFlowPoint {
  granularity: string
  label: string
  start: string
  end: string
  date: string
  inflow: FlowValue
  outflow: FlowValue
  net: FlowValue
  startCash: number
  endCash: number
  covered: CoveredOccurrence[]
}

interface CashFlowProjection {
  asOf: string
  granularity: string
  start: string
  end: string
  bucketCount: number
  fromMonth?: string
  months?: number
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

  it('逐月手算对照：同一 occurrence 只计一次，actual 不含未来交易', async () => {
    const res = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, months: 3 })

    expect(res.status).toBe(200)
    const data = res.body.data as AssetProjection

    // 起点 = date ≤ asOf 的真实余额：A 200 + B 300 − L 100
    expect(data.asOf).toBe(AS_OF)
    expect(data.fromMonth).toBe('2026-11')
    expect(data.months).toBe(3)
    expect(data.base).toEqual({ assets: 50000, liabilities: 10000, netWorth: 40000 })

    expect(data.points).toHaveLength(3)
    expect(data.points.map((point) => point.label)).toEqual(['2026-11', '2026-12', '2027-01'])
    expect(data.points.map((point) => point.date)).toEqual(['2026-11-30', '2026-12-31', '2027-01-31'])

    // 11 月：收入预算 500 在 planned；支出预算 100 被 11-20 真实支出 30 覆盖，从 planned 剔除。
    // total 资产 = 500 + 500 − 30 = 970，净资产 970 − 100 = 870。
    expect(data.points[0]).toMatchObject({
      actual: { assets: 50000, liabilities: 10000, netWorth: 40000 },
      planned: { assets: 50000, liabilities: 0, netWorth: 50000 },
      committed: { assets: -3000, liabilities: 0, netWorth: -3000 },
      total: { assets: 97000, liabilities: 10000, netWorth: 87000 },
    })
    expect(data.points[0].covered).toEqual([
      {
        budgetId: 'proj-budget-expense',
        budgetName: '每月支出',
        type: 'expense',
        date: '2026-11-30',
        amount: 10000,
        transactionId: 'proj-future-expense',
        transactionDate: '2026-11-20',
      },
    ])

    // 12 月：planned 累计 500（11 月收入）− 100（12 月支出）= 400；
    // committed 累计 −30（11 月支出）+ 80（12 月收入）+ 0（内部转账）= +50。
    expect(data.points[1].planned).toEqual({ assets: 40000, liabilities: 0, netWorth: 40000 })
    expect(data.points[1].committed).toEqual({ assets: 5000, liabilities: 0, netWorth: 5000 })
    expect(data.points[1].total).toEqual({ assets: 95000, liabilities: 10000, netWorth: 85000 })

    // 12 月两处覆盖：收入预算 500 ← 12-05 真实收入 80；转账预算 20 ← 12-15 真实转账 10
    expect(data.points[1].covered).toHaveLength(2)
    const coveredIncome = data.points[1].covered.find((item) => item.budgetId === 'proj-budget-income')
    expect(coveredIncome).toMatchObject({
      type: 'income',
      date: '2026-12-31',
      amount: 50000,
      transactionId: 'proj-future-income',
      transactionDate: '2026-12-05',
    })
    const coveredTransfer = data.points[1].covered.find((item) => item.budgetId === 'proj-budget-transfer')
    expect(coveredTransfer).toMatchObject({
      type: 'transfer',
      date: '2026-12-31',
      amount: 2000,
      transactionId: 'proj-future-transfer',
      transactionDate: '2026-12-15',
    })

    // 1 月：planned 累计 500 − 100 − 100 + 500 = 800；committed 仍是 50。
    expect(data.points[2].planned).toEqual({ assets: 80000, liabilities: 0, netWorth: 80000 })
    expect(data.points[2].committed).toEqual({ assets: 5000, liabilities: 0, netWorth: 5000 })
    expect(data.points[2].total).toEqual({ assets: 135000, liabilities: 10000, netWorth: 125000 })
    expect(data.points[2].covered).toEqual([])

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

  it('逐月 inflow/outflow/net 手算对照（现金流账户仅 A，覆盖点位不进 planned）', async () => {
    const res = await request(app)
      .get('/api/reports/cash-flow-projection')
      .query({ asOf: AS_OF, months: 3 })

    expect(res.status).toBe(200)
    const data = res.body.data as CashFlowProjection

    expect(data.fromMonth).toBe('2026-11')
    expect(data.startCash).toBe(0)
    expect(data.endCash).toBe(100000)

    // 11 月：期初 0 + 实际收入 200 + 预算净 480（收入 500 − 转账 20，支出预算被覆盖）− 未来支出 30 = 650
    expect(data.points[0]).toMatchObject({
      label: '2026-11',
      startCash: 0,
      endCash: 65000,
      inflow: { actual: 20000, planned: 50000, committed: 0, total: 70000 },
      outflow: { actual: 0, planned: 2000, committed: 3000, total: 5000 },
      net: { actual: 20000, planned: 48000, committed: -3000, total: 65000 },
    })

    // 12 月：收入/转账预算点位被覆盖，planned 只剩支出 100；真实收入 80 与转账 10 留在 committed
    expect(data.points[1]).toMatchObject({
      label: '2026-12',
      startCash: 65000,
      endCash: 62000,
      inflow: { actual: 0, planned: 0, committed: 8000, total: 8000 },
      outflow: { actual: 0, planned: 10000, committed: 1000, total: 11000 },
      net: { actual: 0, planned: -10000, committed: 7000, total: -3000 },
    })
    expect(data.points[1].covered).toHaveLength(2)

    // 1 月：只剩预算净 380
    expect(data.points[2]).toMatchObject({
      label: '2027-01',
      startCash: 62000,
      endCash: 100000,
      inflow: { actual: 0, planned: 50000, committed: 0, total: 50000 },
      outflow: { actual: 0, planned: 12000, committed: 0, total: 12000 },
      net: { actual: 0, planned: 38000, committed: 0, total: 38000 },
    })
    expect(data.points[2].covered).toEqual([])

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

describe('fromMonth：只截取输出窗口，累计仍从 asOf 所在月起', () => {
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

  it('资产推演从 2027-01 输出：planned/committed 包含 11、12 月的累计', async () => {
    const res = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, fromMonth: '2027-01', months: 1 })

    expect(res.status).toBe(200)
    const data = res.body.data as AssetProjection

    expect(data.asOf).toBe(AS_OF)
    expect(data.fromMonth).toBe('2027-01')
    expect(data.months).toBe(1)
    expect(data.base).toEqual({ assets: 50000, liabilities: 10000, netWorth: 40000 })
    expect(data.points).toHaveLength(1)
    expect(data.points[0]).toMatchObject({
      label: '2027-01',
      date: '2027-01-31',
      // 与 months=3 的第 3 个点位一致：累计包含 11、12 月，而不是从 1 月重新开始。
      planned: { assets: 80000, liabilities: 0, netWorth: 80000 },
      committed: { assets: 5000, liabilities: 0, netWorth: 5000 },
      total: { assets: 135000, liabilities: 10000, netWorth: 125000 },
      covered: [],
    })
  })

  it('现金流推演从 2027-01 输出：startCash 包含 11、12 月净额', async () => {
    const res = await request(app)
      .get('/api/reports/cash-flow-projection')
      .query({ asOf: AS_OF, fromMonth: '2027-01', months: 1 })

    expect(res.status).toBe(200)
    const data = res.body.data as CashFlowProjection

    expect(data.asOf).toBe(AS_OF)
    expect(data.fromMonth).toBe('2027-01')
    expect(data.months).toBe(1)
    // 11 月期末 650 − 12 月净额 30 = 620；1 月从 620 开始，而不是从 0 开始。
    expect(data.startCash).toBe(62000)
    expect(data.endCash).toBe(100000)
    expect(data.points).toHaveLength(1)
    expect(data.points[0]).toMatchObject({
      label: '2027-01',
      startCash: 62000,
      endCash: 100000,
      inflow: { actual: 0, planned: 50000, committed: 0, total: 50000 },
      outflow: { actual: 0, planned: 12000, committed: 0, total: 12000 },
      net: { actual: 0, planned: 38000, committed: 0, total: 38000 },
      covered: [],
    })
  })

  it('fromMonth 省略时行为不变；等于 asOf 所在月时与省略一致', async () => {
    const [omitted, explicit] = await Promise.all([
      request(app).get('/api/analytics/asset-projection').query({ asOf: AS_OF, months: 3 }),
      request(app).get('/api/analytics/asset-projection').query({ asOf: AS_OF, fromMonth: '2026-11', months: 3 }),
    ])

    expect(omitted.status).toBe(200)
    expect(explicit.status).toBe(200)
    expect(explicit.body.data).toEqual(omitted.body.data)
  })

  it('非法 fromMonth / months 与超出 12 个未来月返回 400', async () => {
    const before = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, fromMonth: '2026-10', months: 1 })
    const tooFar = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, fromMonth: '2028-01', months: 1 })
    const badMonth = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, fromMonth: '2027-1', months: 1 })
    const badMonths = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, months: 13 })

    expect(before.status).toBe(400)
    expect(tooFar.status).toBe(400)
    expect(badMonth.status).toBe(400)
    expect(badMonths.status).toBe(400)
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

describe('GET /api/budgets/period-plan：from/to + 四粒度', () => {
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

  it('day 粒度按 occurrence 日期归组，totals 由后端求和', async () => {
    const res = await request(app)
      .get('/api/budgets/period-plan')
      .query({ asOf: AS_OF, from: '2026-12-30', to: '2027-01-02', granularity: 'day' })

    expect(res.status).toBe(200)
    const data = res.body.data as {
      asOf: string
      granularity: string
      start: string
      end: string
      bucketCount: number
      points: Array<{
        label: string
        start: string
        end: string
        hasBudget: boolean
        budgets: Array<{ date: string; type: string; amount: number }>
        totals: { income: number; expense: number; transfer: number } | null
      }>
    }

    expect(data).toMatchObject({
      asOf: AS_OF,
      granularity: 'day',
      start: '2026-12-30',
      end: '2027-01-02',
      bucketCount: 4,
    })
    expect(data.points.map((point) => point.label)).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ])

    const dec31 = data.points[1]
    expect(dec31.hasBudget).toBe(true)
    expect(dec31.budgets.map((budget) => budget.date)).toEqual([
      '2026-12-31',
      '2026-12-31',
      '2026-12-31',
    ])
    expect(dec31.totals).toEqual({ income: 50000, expense: 10000, transfer: 2000 })

    // 无预算 = null，而不是 0
    expect(data.points[0].hasBudget).toBe(false)
    expect(data.points[0].totals).toBeNull()
    expect(data.points[0].budgets).toEqual([])
  })

  it('year 粒度向外对齐到自然年，桶内保留全部 occurrence', async () => {
    const res = await request(app)
      .get('/api/budgets/period-plan')
      .query({ asOf: AS_OF, from: '2026-03-01', to: '2026-12-31', granularity: 'year' })

    expect(res.status).toBe(200)
    const data = res.body.data as {
      granularity: string
      start: string
      end: string
      bucketCount: number
      points: Array<{
        label: string
        budgets: Array<{ date: string }>
        totals: { income: number; expense: number; transfer: number } | null
      }>
    }

    expect(data).toMatchObject({
      granularity: 'year',
      start: '2026-01-01',
      end: '2026-12-31',
      bucketCount: 1,
    })
    expect(data.points[0].label).toBe('2026')
    // 月粒度预算在每月月末出点；年桶向外对齐后包含整年的 12 个月点位。
    expect(data.points[0].budgets[0].date).toBe('2026-01-31')
    expect(data.points[0].budgets.slice(-3).map((budget) => budget.date)).toEqual([
      '2026-12-31',
      '2026-12-31',
      '2026-12-31',
    ])
    expect(data.points[0].totals).toEqual({ income: 600000, expense: 120000, transfer: 24000 })
  })

  it('month from/to 与旧 fromMonth/months 的点位一致，但不再回填旧字段', async () => {
    const [windowed, legacy] = await Promise.all([
      request(app)
        .get('/api/budgets/period-plan')
        .query({ asOf: AS_OF, from: '2026-11-01', to: '2026-11-30', granularity: 'month' }),
      request(app)
        .get('/api/budgets/period-plan')
        .query({ asOf: AS_OF, fromMonth: '2026-11', months: 1 }),
    ])

    expect(windowed.status).toBe(200)
    expect(legacy.status).toBe(200)
    const windowedData = windowed.body.data as { fromMonth?: string; months?: number; points: unknown[] }
    const legacyData = legacy.body.data as { fromMonth?: string; months?: number; points: unknown[] }
    expect(windowedData.fromMonth).toBeUndefined()
    expect(windowedData.months).toBeUndefined()
    expect(windowedData.points).toEqual(legacyData.points)
  })

  it('非法粒度窗口返回 400', async () => {
    const dayWithoutRange = await request(app)
      .get('/api/budgets/period-plan')
      .query({ asOf: AS_OF, granularity: 'day' })
    const missingTo = await request(app)
      .get('/api/budgets/period-plan')
      .query({ asOf: AS_OF, from: '2026-11-01', granularity: 'month' })
    const mixedParams = await request(app)
      .get('/api/budgets/period-plan')
      .query({ asOf: AS_OF, from: '2026-11-01', to: '2026-11-30', granularity: 'month', fromMonth: '2026-11' })

    expect(dayWithoutRange.status).toBe(400)
    expect(missingTo.status).toBe(400)
    expect(mixedParams.status).toBe(400)
  })
})

/**
 * 同一 occurrence 互斥的专用账本（房租）。
 *
 * - 账户「房租账户」A（现金），期初 0，asOf 前无已发生交易
 * - 月度支出预算「房租」200（20000 分），月末点位
 * - 已排定 12-05 真实房租支出 200（20000 分），落在 A、类型 expense
 *
 * 12-31 的预算点位与 12-05 的真实交易是同一 occurrence：改前两边都计，
 * 12 月 total 资产 −600，1 月累计 −800；改后计划点位从 planned 剔除，
 * 12 月 total −400，1 月累计 −600，差额 200 只出现一次。
 */
async function seedOccurrenceOverlap() {
  await resetData()

  await prisma.accountCategory.createMany({
    data: [{ id: 'occ-cat-cash', name: '互斥现金', type: 'asset', isCashEquivalent: true }],
  })
  await prisma.account.create({
    data: { id: 'occ-acc-a', name: '房租账户', type: 'asset', initialBalance: 0n, categoryId: 'occ-cat-cash' },
  })
  await prisma.transactionCategory.create({
    data: { id: 'occ-tc-expense', name: '房租支出', type: 'expense' },
  })
  // 已排定的未来真实房租（date > asOf）
  await prisma.transaction.create({
    data: {
      id: 'occ-rent-tx',
      type: 'expense',
      amount: 20000n,
      date: localDate(2026, 12, 5),
      accountId: 'occ-acc-a',
      categoryId: 'occ-tc-expense',
    },
  })
  await prisma.budget.create({
    data: {
      id: 'occ-rent-budget',
      name: '房租',
      type: 'expense',
      amount: 20000n,
      period: 'monthly',
      startDate: localDate(2026, 1, 1),
      transactionTime: null,
      accountId: 'occ-acc-a',
      categoryId: 'occ-tc-expense',
    },
  })
}

describe('同一 occurrence 的 planned 与 committed 互斥（房租账本）', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    await resetData()
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await seedOccurrenceOverlap()
  })

  it('12 月房租既在预算又已有真实交易：改前 total −60000，改后 −40000', async () => {
    const res = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, months: 3 })

    expect(res.status).toBe(200)
    const data = res.body.data as AssetProjection
    expect(data.base).toEqual(zero())

    // 11 月：只有 11-30 预算点位，planned −20000
    expect(data.points[0]).toMatchObject({
      planned: { assets: -20000, liabilities: 0, netWorth: -20000 },
      committed: { assets: 0, liabilities: 0, netWorth: 0 },
      total: { assets: -20000, liabilities: 0, netWorth: -20000 },
    })
    expect(data.points[0].covered).toEqual([])

    // 12 月：12-31 点位被 12-05 真实交易覆盖。
    // 改前（不剔除）：planned 累计 −40000 + committed −20000 → total −60000（双计 20000）
    // 改后：planned 累计 −20000 + committed −20000 → total −40000
    expect(data.points[1]).toMatchObject({
      planned: { assets: -20000, liabilities: 0, netWorth: -20000 },
      committed: { assets: -20000, liabilities: 0, netWorth: -20000 },
      total: { assets: -40000, liabilities: 0, netWorth: -40000 },
    })
    expect(data.points[1].covered).toEqual([
      {
        budgetId: 'occ-rent-budget',
        budgetName: '房租',
        type: 'expense',
        date: '2026-12-31',
        amount: 20000,
        transactionId: 'occ-rent-tx',
        transactionDate: '2026-12-05',
      },
    ])

    // 1 月：被覆盖的点位不会回到 planned；累计 = 11 月 + 1 月 = −40000。
    // 改前累计会是 −60000 + committed −20000 = −80000，改后 −60000。
    expect(data.points[2]).toMatchObject({
      planned: { assets: -40000, liabilities: 0, netWorth: -40000 },
      committed: { assets: -20000, liabilities: 0, netWorth: -20000 },
      total: { assets: -60000, liabilities: 0, netWorth: -60000 },
    })
    expect(data.points[2].covered).toEqual([])

    for (const point of data.points) {
      expect(point.total.assets).toBe(point.actual.assets + point.planned.assets + point.committed.assets)
      expect(point.total.netWorth).toBe(point.actual.netWorth + point.planned.netWorth + point.committed.netWorth)
    }
  })

  it('现金流同口径：12 月 outflow planned 0，committed 只计一次', async () => {
    const res = await request(app)
      .get('/api/reports/cash-flow-projection')
      .query({ asOf: AS_OF, months: 3 })

    expect(res.status).toBe(200)
    const data = res.body.data as CashFlowProjection

    expect(data.startCash).toBe(0)

    // 11 月：预算房租 200 流出，无真实交易
    expect(data.points[0]).toMatchObject({
      startCash: 0,
      endCash: -20000,
      inflow: { actual: 0, planned: 0, committed: 0, total: 0 },
      outflow: { actual: 0, planned: 20000, committed: 0, total: 20000 },
      net: { actual: 0, planned: -20000, committed: 0, total: -20000 },
    })

    // 12 月：计划点位被覆盖 → planned 流出 0；committed 流出 200。
    // 改前 planned 200 + committed 200 = 400（双计 200），改后 200。
    expect(data.points[1]).toMatchObject({
      startCash: -20000,
      endCash: -40000,
      inflow: { actual: 0, planned: 0, committed: 0, total: 0 },
      outflow: { actual: 0, planned: 0, committed: 20000, total: 20000 },
      net: { actual: 0, planned: 0, committed: -20000, total: -20000 },
    })
    expect(data.points[1].covered).toHaveLength(1)

    // 1 月：只剩 1-31 预算点位
    expect(data.points[2]).toMatchObject({
      startCash: -40000,
      endCash: -60000,
      inflow: { actual: 0, planned: 0, committed: 0, total: 0 },
      outflow: { actual: 0, planned: 20000, committed: 0, total: 20000 },
      net: { actual: 0, planned: -20000, committed: 0, total: -20000 },
    })
    expect(data.points[2].covered).toEqual([])
    expect(data.endCash).toBe(-60000)

    for (const point of data.points) {
      expect(point.endCash).toBe(point.startCash + point.net.total)
      expect(point.net.total).toBe(point.inflow.total - point.outflow.total)
    }
  })
})

describe('四粒度窗口：day / week / month / year', () => {
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

  it('日粒度：历史桶取真实余额，混合/未来桶累计，桶内 covered 按日期归属', async () => {
    const res = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, granularity: 'day', from: '2026-11-01', to: '2026-11-30' })

    expect(res.status).toBe(200)
    const data = res.body.data as AssetProjection

    expect(data.granularity).toBe('day')
    expect(data.start).toBe('2026-11-01')
    expect(data.end).toBe('2026-11-30')
    expect(data.bucketCount).toBe(30)
    expect(data.fromMonth).toBeUndefined()
    expect(data.months).toBeUndefined()
    expect(data.base).toEqual({ assets: 50000, liabilities: 10000, netWorth: 40000 })
    expect(data.points).toHaveLength(30)

    // 11-01 已是历史桶：真实余额（11-01 收入 200 已入账），预测项为 0。
    expect(data.points[0]).toMatchObject({
      granularity: 'day',
      label: '2026-11-01',
      start: '2026-11-01',
      end: '2026-11-01',
      date: '2026-11-01',
      actual: { assets: 50000, liabilities: 10000, netWorth: 40000 },
      planned: zero(),
      committed: zero(),
      total: { assets: 50000, liabilities: 10000, netWorth: 40000 },
      covered: [],
    })
    // 11-06 仍是历史桶，余额与 11-01 相同（之后无已发生交易）。
    expect(data.points[5]).toMatchObject({
      label: '2026-11-06',
      actual: { assets: 50000, liabilities: 10000, netWorth: 40000 },
      total: { assets: 50000, liabilities: 10000, netWorth: 40000 },
    })
    // 11-07 起是未来桶：actual = asOf 起点余额，尚无预测事件。
    expect(data.points[6]).toMatchObject({
      label: '2026-11-07',
      actual: { assets: 50000, liabilities: 10000, netWorth: 40000 },
      planned: zero(),
      committed: zero(),
      total: { assets: 50000, liabilities: 10000, netWorth: 40000 },
    })

    // 11-20 已排定支出 30 落入当日：committed −30000。
    expect(data.points[19]).toMatchObject({
      label: '2026-11-20',
      committed: { assets: -3000, liabilities: 0, netWorth: -3000 },
      total: { assets: 47000, liabilities: 10000, netWorth: 37000 },
    })

    // 11-30：收入预算 500 在 planned，11-20 支出仍在 committed；
    // 支出预算点位被覆盖，只出现在 covered 里。
    expect(data.points[29]).toMatchObject({
      label: '2026-11-30',
      planned: { assets: 50000, liabilities: 0, netWorth: 50000 },
      committed: { assets: -3000, liabilities: 0, netWorth: -3000 },
      total: { assets: 97000, liabilities: 10000, netWorth: 87000 },
    })
    expect(data.points[29].covered).toHaveLength(1)
    expect(data.points[29].covered[0]).toMatchObject({
      budgetId: 'proj-budget-expense',
      transactionId: 'proj-future-expense',
      transactionDate: '2026-11-20',
    })

    for (const point of data.points) {
      expect(point.total.assets).toBe(point.actual.assets + point.planned.assets + point.committed.assets)
      expect(point.total.liabilities).toBe(point.actual.liabilities + point.planned.liabilities + point.committed.liabilities)
      expect(point.total.netWorth).toBe(point.actual.netWorth + point.planned.netWorth + point.committed.netWorth)
      expect(point.end).toBe(point.date)
    }
  })

  it('日粒度现金流：逐日 actual 求和，期初/期末逐桶滚动', async () => {
    const res = await request(app)
      .get('/api/reports/cash-flow-projection')
      .query({ asOf: AS_OF, granularity: 'day', from: '2026-11-01', to: '2026-11-30' })

    expect(res.status).toBe(200)
    const data = res.body.data as CashFlowProjection

    expect(data.granularity).toBe('day')
    expect(data.bucketCount).toBe(30)
    expect(data.startCash).toBe(0)
    expect(data.endCash).toBe(65000)

    // 11-01：期初 0 + 已发生收入 200 = 20000。
    expect(data.points[0]).toMatchObject({
      label: '2026-11-01',
      startCash: 0,
      endCash: 20000,
      inflow: { actual: 20000, planned: 0, committed: 0, total: 20000 },
      outflow: { actual: 0, planned: 0, committed: 0, total: 0 },
      net: { actual: 20000, planned: 0, committed: 0, total: 20000 },
    })
    // 11-06：无新流水，期初=期末 20000。
    expect(data.points[5]).toMatchObject({ startCash: 20000, endCash: 20000 })
    // 11-20：已排定支出 30 流出。
    expect(data.points[19]).toMatchObject({
      startCash: 20000,
      endCash: 17000,
      outflow: { actual: 0, planned: 0, committed: 3000, total: 3000 },
      net: { actual: 0, planned: 0, committed: -3000, total: -3000 },
    })
    // 11-30：收入预算 500 入账、转账预算 20 流出；11-20 支出已在当日桶计入，不重复。
    expect(data.points[29]).toMatchObject({
      startCash: 17000,
      endCash: 65000,
      inflow: { actual: 0, planned: 50000, committed: 0, total: 50000 },
      outflow: { actual: 0, planned: 2000, committed: 0, total: 2000 },
      net: { actual: 0, planned: 48000, committed: 0, total: 48000 },
    })
    expect(data.points[29].covered).toHaveLength(1)

    for (const point of data.points) {
      expect(point.endCash).toBe(point.startCash + point.net.total)
      expect(point.net.total).toBe(point.inflow.total - point.outflow.total)
    }
  })

  it('周粒度：ISO 周一向外对齐，跨桶事件归属正确', async () => {
    const res = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, granularity: 'week', from: '2026-11-01', to: '2026-11-30' })

    expect(res.status).toBe(200)
    const data = res.body.data as AssetProjection

    expect(data.granularity).toBe('week')
    expect(data.start).toBe('2026-10-26')
    expect(data.end).toBe('2026-12-06')
    expect(data.bucketCount).toBe(6)
    expect(data.points.map((point) => point.label)).toEqual([
      '2026-W44', '2026-W45', '2026-W46', '2026-W47', '2026-W48', '2026-W49',
    ])
    expect(data.points.map((point) => point.start)).toEqual([
      '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30',
    ])
    expect(data.points.map((point) => point.end)).toEqual([
      '2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29', '2026-12-06',
    ])

    // 首桶终点 11-01 ≤ asOf：真实余额；第二桶（11-02~11-08）已跨过 asOf：actual = 起点余额。
    expect(data.points[0]).toMatchObject({
      actual: { assets: 50000, liabilities: 10000, netWorth: 40000 },
      planned: zero(),
      committed: zero(),
      total: { assets: 50000, liabilities: 10000, netWorth: 40000 },
    })
    expect(data.points[1]).toMatchObject({
      actual: { assets: 50000, liabilities: 10000, netWorth: 40000 },
      planned: zero(),
      committed: zero(),
      total: { assets: 50000, liabilities: 10000, netWorth: 40000 },
    })

    // 11-16~11-22 桶包含 11-20 支出。
    expect(data.points[3]).toMatchObject({
      committed: { assets: -3000, liabilities: 0, netWorth: -3000 },
      total: { assets: 47000, liabilities: 10000, netWorth: 37000 },
    })

    // 11-30~12-06 桶：计划收入 500 + 已排定 −30/+80（内部转账不计资产）。
    expect(data.points[5]).toMatchObject({
      planned: { assets: 50000, liabilities: 0, netWorth: 50000 },
      committed: { assets: 5000, liabilities: 0, netWorth: 5000 },
      total: { assets: 105000, liabilities: 10000, netWorth: 95000 },
    })
    expect(data.points[5].covered).toHaveLength(1)
  })

  it('周粒度现金流：期初现金 + 桶内净额滚动到 70000', async () => {
    const res = await request(app)
      .get('/api/reports/cash-flow-projection')
      .query({ asOf: AS_OF, granularity: 'week', from: '2026-11-01', to: '2026-11-30' })

    expect(res.status).toBe(200)
    const data = res.body.data as CashFlowProjection

    expect(data.startCash).toBe(0)
    expect(data.endCash).toBe(73000)
    expect(data.points[0]).toMatchObject({
      startCash: 0,
      endCash: 20000,
      inflow: { actual: 20000, planned: 0, committed: 0, total: 20000 },
    })
    expect(data.points[3]).toMatchObject({
      startCash: 20000,
      endCash: 17000,
      outflow: { actual: 0, planned: 0, committed: 3000, total: 3000 },
      net: { actual: 0, planned: 0, committed: -3000, total: -3000 },
    })
    expect(data.points[5]).toMatchObject({
      startCash: 17000,
      endCash: 73000,
      inflow: { actual: 0, planned: 50000, committed: 8000, total: 58000 },
      outflow: { actual: 0, planned: 2000, committed: 0, total: 2000 },
      net: { actual: 0, planned: 48000, committed: 8000, total: 56000 },
    })

    for (const point of data.points) {
      expect(point.endCash).toBe(point.startCash + point.net.total)
    }
  })

  it('月粒度 from/to 与旧 fromMonth/months 等值；不传 granularity 时结果不变', async () => {
    const [legacy, ranged, explicitMonth] = await Promise.all([
      request(app).get('/api/analytics/asset-projection').query({ asOf: AS_OF, months: 3 }),
      request(app)
        .get('/api/analytics/asset-projection')
        .query({ asOf: AS_OF, granularity: 'month', from: '2026-11-01', to: '2027-01-31' }),
      request(app).get('/api/analytics/asset-projection').query({ asOf: AS_OF, granularity: 'month', months: 3 }),
    ])

    expect(legacy.status).toBe(200)
    expect(ranged.status).toBe(200)
    expect(explicitMonth.status).toBe(200)

    const legacyData = legacy.body.data as AssetProjection
    const rangedData = ranged.body.data as AssetProjection
    const explicitData = explicitMonth.body.data as AssetProjection

    // 同一窗口：新入口只省略兼容字段，点位与累计完全一致。
    expect(rangedData.points).toEqual(legacyData.points)
    expect(rangedData.base).toEqual(legacyData.base)
    expect(rangedData.granularity).toBe('month')
    expect(rangedData.start).toBe('2026-11-01')
    expect(rangedData.end).toBe('2027-01-31')
    expect(rangedData.bucketCount).toBe(3)
    expect(rangedData.fromMonth).toBeUndefined()
    expect(rangedData.months).toBeUndefined()

    // 不传 granularity 与显式 month 完全一致（默认兼容）。
    expect(explicitData).toEqual(legacyData)
    expect(legacyData.granularity).toBe('month')
    expect(legacyData.bucketCount).toBe(3)
  })

  it('年粒度：3 个自然年桶，桶末累计与桶内 planned/committed 正确', async () => {
    const res = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, granularity: 'year', from: '2026-01-01', to: '2028-12-31' })

    expect(res.status).toBe(200)
    const data = res.body.data as AssetProjection

    expect(data.granularity).toBe('year')
    expect(data.bucketCount).toBe(3)
    expect(data.points.map((point) => point.label)).toEqual(['2026', '2027', '2028'])
    expect(data.points.map((point) => point.start)).toEqual(['2026-01-01', '2027-01-01', '2028-01-01'])
    expect(data.points.map((point) => point.end)).toEqual(['2026-12-31', '2027-12-31', '2028-12-31'])

    // 2026：收入预算 500 − 12 月未被覆盖的支出预算 100 = 400；已排定净 +50。
    expect(data.points[0]).toMatchObject({
      planned: { assets: 40000, liabilities: 0, netWorth: 40000 },
      committed: { assets: 5000, liabilities: 0, netWorth: 5000 },
      total: { assets: 95000, liabilities: 10000, netWorth: 85000 },
    })
    expect(data.points[0].covered).toHaveLength(3)

    // 2027：在 2026 累计 400 基础上再累计 12 个月 × 净 400 = 4800 → 5200。
    expect(data.points[1]).toMatchObject({
      planned: { assets: 520000, liabilities: 0, netWorth: 520000 },
      committed: { assets: 5000, liabilities: 0, netWorth: 5000 },
      total: { assets: 575000, liabilities: 10000, netWorth: 565000 },
      covered: [],
    })

    // 2028：累计 24 个月 + 2026 的 400 → 10000。
    expect(data.points[2]).toMatchObject({
      planned: { assets: 1000000, liabilities: 0, netWorth: 1000000 },
      committed: { assets: 5000, liabilities: 0, netWorth: 5000 },
      total: { assets: 1055000, liabilities: 10000, netWorth: 1045000 },
      covered: [],
    })
  })

  it('ISO 周跨年不拆桶：2026-12-28 属于 2026-W53', async () => {
    const res = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, granularity: 'week', from: '2026-12-28', to: '2027-01-03' })

    expect(res.status).toBe(200)
    const data = res.body.data as AssetProjection

    expect(data.bucketCount).toBe(1)
    expect(data.start).toBe('2026-12-28')
    expect(data.end).toBe('2027-01-03')
    expect(data.points[0]).toMatchObject({
      label: '2026-W53',
      start: '2026-12-28',
      end: '2027-01-03',
      // 累计到 2027-01-03：收入预算 500 − 12 月未被覆盖的支出预算 100 = 400；已排定累计 +50。
      planned: { assets: 40000, liabilities: 0, netWorth: 40000 },
      committed: { assets: 5000, liabilities: 0, netWorth: 5000 },
      total: { assets: 95000, liabilities: 10000, netWorth: 85000 },
    })
    // 12-31 收入预算与转账预算在这周内被覆盖。
    expect(data.points[0].covered).toHaveLength(2)
  })

  it('from/to 参数校验：缺参、混用旧参数、非法粒度均返回 400', async () => {
    const missingTo = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, granularity: 'day', from: '2026-11-01' })
    const mixed = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, granularity: 'day', from: '2026-11-01', to: '2026-11-30', months: 3 })
    const noRange = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, granularity: 'week', months: 3 })
    const badGranularity = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, granularity: 'quarter', from: '2026-11-01', to: '2026-11-30' })
    const invalidFrom = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, granularity: 'day', from: '2026-11-31', to: '2026-12-01' })
    const reversed = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, granularity: 'day', from: '2026-12-01', to: '2026-11-01' })

    for (const res of [missingTo, mixed, noRange, badGranularity, invalidFrom, reversed]) {
      expect(res.status).toBe(400)
    }
  })

  it('未来上限：日 3 月 / 周 6 月 / 月 12 月 / 年 3 年；超出返回可操作的报错', async () => {
    const dayLimit = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, granularity: 'day', from: '2026-11-01', to: '2027-02-06' })
    expect(dayLimit.status).toBe(200)
    expect(dayLimit.body.data.bucketCount).toBe(98)
    expect(dayLimit.body.data.end).toBe('2027-02-06')

    const dayTooFar = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, granularity: 'day', from: '2026-11-01', to: '2027-03-01' })
    const weekTooFar = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, granularity: 'week', from: '2026-11-01', to: '2027-06-01' })
    const monthTooFar = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, granularity: 'month', from: '2026-11-01', to: '2027-12-01' })
    const yearTooFar = await request(app)
      .get('/api/analytics/asset-projection')
      .query({ asOf: AS_OF, granularity: 'year', from: '2026-01-01', to: '2030-12-31' })

    expect(dayTooFar.status).toBe(400)
    expect(dayTooFar.body.error.message).toContain('更粗的粒度')
    expect(weekTooFar.status).toBe(400)
    expect(monthTooFar.status).toBe(400)
    expect(yearTooFar.status).toBe(400)
    expect(yearTooFar.body.error.message).toContain('把结束日期 to 调早')
  })
})

/**
 * 极端数据量：18 个日预算 × 约 1120 天 = 20178 个 occurrence，超过 20000 保护阈值。
 * 请求本身落在合法范围（年粒度、3 年上限内），仍应给出可操作的 422，而不是静默计算。
 */
async function seedEventBurst() {
  await resetData()

  await prisma.accountCategory.createMany({
    data: [{ id: 'burst-cat-cash', name: '突发现金', type: 'asset', isCashEquivalent: true }],
  })
  await prisma.account.create({
    data: { id: 'burst-acc-a', name: '突发账户', type: 'asset', initialBalance: 0n, categoryId: 'burst-cat-cash' },
  })
  await prisma.transactionCategory.create({
    data: { id: 'burst-tc-income', name: '突发收入', type: 'income' },
  })

  await prisma.budget.createMany({
    data: Array.from({ length: 18 }, (_, index) => ({
      id: `burst-budget-${index}`,
      name: `每日预算 ${index}`,
      type: 'income',
      amount: 100n,
      period: 'daily',
      startDate: localDate(2026, 1, 1),
      endDate: localDate(2029, 12, 31),
      transactionTime: null,
      accountId: 'burst-acc-a',
      categoryId: 'burst-tc-income',
    })),
  })
}

describe('20,000 事件保护阈值', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    await resetData()
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await seedEventBurst()
  })

  it('合法窗口但事件量超限：返回 422 并提示缩小范围或换更粗粒度', async () => {
    const res = await request(app)
      .get('/api/reports/cash-flow-projection')
      .query({ asOf: AS_OF, granularity: 'year', from: '2027-01-01', to: '2029-12-31' })

    expect(res.status).toBe(422)
    expect(res.body.error.message).toContain('缩小 from/to 范围')
    expect(res.body.error.message).toContain('更粗的粒度')
    expect(res.body.error.details).toMatchObject({ limit: 20000 })
  })
})
