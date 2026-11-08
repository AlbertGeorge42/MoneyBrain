/**
 * 账本日期契约（本地日历日）。
 *
 * 覆盖：
 * - 创建 / 列表 / 详情返回 `YYYY-MM-DD`，不是 ISO 瞬时；
 * - 月初 00:05 与月末 23:55 不落到相邻月份；
 * - 跨年 12-31 / 01-01 各归各年；
 * - 预算月度周期只计本期首末两笔；
 * - 报表期间合计 = 本期首末两笔；
 * - 导出 CSV / 预算 JSON 的日期与接口同一日历日。
 *
 * 期间取「运行时的当前月」，因此不依赖具体执行日期；
 * 同一份用例在 UTC+8 / UTC-5 / UTC 下必须全部通过。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'

const { default: app } = await import('../../src/index.js')
const { prisma } = await import('../../src/prisma.js')
const { formatDateLocal } = await import('../../src/common/date.js')

const ACCOUNT_ID = 'date-contract-account'
const CATEGORY_ID = 'date-contract-category'

const now = new Date()
const YEAR = now.getFullYear()
const MONTH = now.getMonth()

/** 当前月：首日 00:05、末日 23:55；相邻月：上月末日 23:55、下月首日 00:05。 */
const MONTH_START = new Date(YEAR, MONTH, 1, 0, 5, 0)
const MONTH_END = new Date(YEAR, MONTH + 1, 0, 23, 55, 0)
const PREV_MONTH_END = new Date(YEAR, MONTH, 0, 23, 55, 0)
const NEXT_MONTH_START = new Date(YEAR, MONTH + 1, 1, 0, 5, 0)

const pad = (value: number): string => String(value).padStart(2, '0')

function dayOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const MONTH_START_DAY = dayOf(MONTH_START)
const MONTH_END_DAY = dayOf(MONTH_END)
const PREV_MONTH_END_DAY = dayOf(PREV_MONTH_END)
const NEXT_MONTH_START_DAY = dayOf(NEXT_MONTH_START)

async function createExpense(date: Date, amount: number, note: string) {
  return request(app)
    .post('/api/transactions')
    .send({
      type: 'expense',
      amount,
      date: date.toISOString(),
      accountId: ACCOUNT_ID,
      categoryId: CATEGORY_ID,
      note,
    })
}

describe('账本日期契约：本地日历日', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.transaction.deleteMany()
    await prisma.budget.deleteMany()
    await prisma.auditEvent.deleteMany()
    await prisma.account.deleteMany()
    await prisma.accountCategory.deleteMany()
    await prisma.transactionCategory.deleteMany()

    await prisma.accountCategory.create({
      data: { id: 'date-contract-acc-cat', name: '日期契约现金', type: 'asset', sort: 0 },
    })
    await prisma.account.create({
      data: {
        id: ACCOUNT_ID,
        name: '日期契约账户',
        type: 'asset',
        initialBalance: 0,
        categoryId: 'date-contract-acc-cat',
      },
    })
    await prisma.transactionCategory.create({
      data: { id: CATEGORY_ID, name: '日期契约分类', type: 'expense', sort: 0 },
    })
  })

  it('创建 / 列表（详情抽屉同源）都返回本地日历日', async () => {
    const created = await createExpense(MONTH_START, 100, '月初 00:05')
    expect(created.status).toBe(201)
    expect(created.body.data.date).toBe(MONTH_START_DAY)

    const list = await request(app)
      .get('/api/transactions')
      .query({ startDate: MONTH_START_DAY, endDate: MONTH_END_DAY, pageSize: 50 })

    expect(list.body.data.list.map((item: { date: string }) => item.date)).toEqual([MONTH_START_DAY])
    expect(list.body.data.list[0].id).toBe(created.body.data.id)
    expect(list.body.data.list[0].accountId).toBe(ACCOUNT_ID)
  })

  it('写侧按 YYYY-MM-DD 保存：选 11-06 后列表 / 报表归属仍是 11-06', async () => {
    const day = '2026-11-06'
    const created = await request(app)
      .post('/api/transactions')
      .send({
        type: 'expense',
        amount: 12300,
        date: day,
        accountId: ACCOUNT_ID,
        categoryId: CATEGORY_ID,
        note: '写侧日历日',
      })

    expect(created.status).toBe(201)
    expect(created.body.data.date).toBe(day)
    // 响应里不能出现 T16:00Z / T00:00:00 这类瞬时。
    expect(created.body.data.date).not.toContain('T')

    // 读回同一个本地日历日，而不是 UTC 转换后的前一天。
    const row = await prisma.transaction.findUnique({ where: { id: created.body.data.id } })
    expect(row).not.toBeNull()
    expect(formatDateLocal(row!.date)).toBe(day)

    const list = await request(app)
      .get('/api/transactions')
      .query({ startDate: day, endDate: day, pageSize: 50 })
    expect(list.body.data.list.map((item: { date: string }) => item.date)).toEqual([day])

    const report = await request(app)
      .get('/api/reports/income-expense')
      .query({ startDate: day, endDate: day })
    expect(report.status).toBe(200)
    expect(report.body.data.expense.actual).toBe(12300)

    const budget = await request(app)
      .post('/api/budgets')
      .send({
        name: '写侧日期预算',
        amount: 50000,
        type: 'expense',
        period: 'monthly',
        accountId: ACCOUNT_ID,
        categoryId: CATEGORY_ID,
        startDate: day,
        endDate: day,
      })
    expect(budget.status).toBe(201)
    expect(budget.body.data.startDate).toBe(day)
    expect(budget.body.data.endDate).toBe(day)
  })

  it('账户 initialBalanceDate 也是日历日', async () => {
    const created = await request(app)
      .post('/api/accounts')
      .send({ name: '期初日期账户', type: 'asset', initialBalanceDate: '2026-01-01' })

    expect(created.status).toBe(201)
    expect(created.body.data.initialBalanceDate).toBe('2026-01-01')

    const list = await request(app).get('/api/accounts')
    const target = list.body.data.find((item: { name: string }) => item.name === '期初日期账户')
    expect(target.initialBalanceDate).toBe('2026-01-01')
  })

  it('月初 00:05 / 月末 23:55 不落到相邻月份', async () => {
    await createExpense(PREV_MONTH_END, 400, '上月末日 23:55')
    await createExpense(MONTH_START, 100, '本月首日 00:05')
    await createExpense(MONTH_END, 200, '本月末日 23:55')
    await createExpense(NEXT_MONTH_START, 800, '下月首日 00:05')

    const list = await request(app)
      .get('/api/transactions')
      .query({ startDate: MONTH_START_DAY, endDate: MONTH_END_DAY, pageSize: 50 })
    expect(list.body.data.total).toBe(2)
    expect(list.body.data.list.map((item: { date: string }) => item.date)).toEqual([
      MONTH_END_DAY,
      MONTH_START_DAY,
    ])

    const stats = await request(app)
      .get('/api/transactions/stats')
      .query({ startDate: MONTH_START_DAY, endDate: MONTH_END_DAY })
    expect(stats.body.data.expense).toBe(300)

    const prevDay = await request(app)
      .get('/api/transactions')
      .query({ startDate: PREV_MONTH_END_DAY, endDate: PREV_MONTH_END_DAY, pageSize: 50 })
    expect(prevDay.body.data.list.map((item: { note: string }) => item.note)).toEqual(['上月末日 23:55'])

    const nextDay = await request(app)
      .get('/api/transactions')
      .query({ startDate: NEXT_MONTH_START_DAY, endDate: NEXT_MONTH_START_DAY, pageSize: 50 })
    expect(nextDay.body.data.list.map((item: { note: string }) => item.note)).toEqual(['下月首日 00:05'])
  })

  it('跨年 12-31 / 01-01 各自归属当年，不串到邻年', async () => {
    const yearEnd = new Date(YEAR, 11, 31, 23, 55, 0)
    const nextYearStart = new Date(YEAR + 1, 0, 1, 0, 5, 0)
    const yearEndDay = dayOf(yearEnd)
    const nextYearStartDay = dayOf(nextYearStart)

    await createExpense(yearEnd, 100, '跨年 12-31 23:55')
    await createExpense(nextYearStart, 200, '跨年 01-01 00:05')

    const lastDay = await request(app)
      .get('/api/transactions')
      .query({ startDate: yearEndDay, endDate: yearEndDay, pageSize: 50 })
    expect(lastDay.body.data.list.map((item: { date: string }) => item.date)).toEqual([yearEndDay])
    expect(lastDay.body.data.list[0].note).toBe('跨年 12-31 23:55')

    const firstDay = await request(app)
      .get('/api/transactions')
      .query({ startDate: nextYearStartDay, endDate: nextYearStartDay, pageSize: 50 })
    expect(firstDay.body.data.list.map((item: { date: string }) => item.date)).toEqual([nextYearStartDay])
    expect(firstDay.body.data.list[0].note).toBe('跨年 01-01 00:05')

    const both = await request(app)
      .get('/api/transactions/stats')
      .query({ startDate: yearEndDay, endDate: nextYearStartDay })
    expect(both.body.data.expense).toBe(300)
  })

  it('预算月度周期只计本期首末两笔，相邻月不上浮', async () => {
    const budget = await request(app).post('/api/budgets').send({
      name: '日期契约月度预算',
      amount: 100_000,
      type: 'expense',
      period: 'monthly',
      accountId: ACCOUNT_ID,
      categoryId: CATEGORY_ID,
      startDate: `${YEAR}-01-01`,
    })
    expect(budget.status).toBe(201)
    expect(budget.body.data.startDate).toBe(`${YEAR}-01-01`)

    await createExpense(PREV_MONTH_END, 400, '上月末日 23:55')
    await createExpense(MONTH_START, 100, '本月首日 00:05')
    await createExpense(MONTH_END, 200, '本月末日 23:55')
    await createExpense(NEXT_MONTH_START, 800, '下月首日 00:05')

    const statuses = await request(app)
      .get('/api/budgets/statuses')
      .query({ ids: budget.body.data.id })
    expect(statuses.status).toBe(200)
    expect(statuses.body.data[0].used).toBe(300)
  })

  it('报表期间合计只含本期首末两笔', async () => {
    await createExpense(PREV_MONTH_END, 400, '上月末日 23:55')
    await createExpense(MONTH_START, 100, '本月首日 00:05')
    await createExpense(MONTH_END, 200, '本月末日 23:55')
    await createExpense(NEXT_MONTH_START, 800, '下月首日 00:05')

    const report = await request(app)
      .get('/api/reports/income-expense')
      .query({ startDate: MONTH_START_DAY, endDate: MONTH_END_DAY })

    expect(report.status).toBe(200)
    expect(report.body.data.startDate).toBe(MONTH_START_DAY)
    expect(report.body.data.endDate).toBe(MONTH_END_DAY)
    expect(report.body.data.expense.actual).toBe(300)
  })

  it('预算导出 JSON 的 startDate 是日历日', async () => {
    const budget = await request(app).post('/api/budgets').send({
      name: '日期契约导出预算',
      amount: 100_000,
      type: 'expense',
      period: 'monthly',
      accountId: ACCOUNT_ID,
      categoryId: CATEGORY_ID,
      startDate: '2026-01-01',
    })
    expect(budget.status).toBe(201)

    const exported = await request(app)
      .post('/api/data/export-custom')
      .send({ includes: ['budgets'] })

    expect(exported.status).toBe(200)
    const text = Buffer.isBuffer(exported.body) ? exported.body.toString('utf8') : exported.text
    expect(text).toContain('"startDate": "2026-01-01"')
  })
})
