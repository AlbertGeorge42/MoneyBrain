/**
 * 报表下钻期间（GET /transactions?from&to）边界契约。
 *
 * - from / to 都是可选参数，各自独立生效；
 * - 闭区间按「本地日历日」理解：from 当天 00:00（含）→ to 次日 00:00（不含），
 *   与报表主查询 `date < 目标日次日` 同一套语义；
 * - 只给一端时另一端不设限；都不给时不加日期过滤；
 * - from 晚于 to 直接 400，避免静默返回空集。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'

const { default: app } = await import('../../src/index.js')
const { prisma } = await import('../../src/prisma.js')

const ACCOUNT_ID = 'drill-range-account'
const ACCOUNT_CATEGORY_ID = 'drill-range-acc-cat'
const CATEGORY_ID = 'drill-range-category'

/** 固定日历日，避免用例受执行日期影响。 */
const FROM_DAY = '2026-03-01'
const MID_DAY = '2026-03-15'
const TO_DAY = '2026-03-31'
const BEFORE_DAY = '2026-02-28'
const AFTER_DAY = '2026-04-01'

async function createExpense(date: Date, note: string) {
  const created = await request(app)
    .post('/api/transactions')
    .send({
      type: 'expense',
      amount: 100,
      date: date.toISOString(),
      accountId: ACCOUNT_ID,
      categoryId: CATEGORY_ID,
      note,
    })
  expect(created.status).toBe(201)
  return created.body.data.id as string
}

async function listNotes(query: Record<string, string>) {
  const response = await request(app)
    .get('/api/transactions')
    .query({ pageSize: 50, ...query })
  expect(response.status).toBe(200)
  return (response.body.data.list as { note: string }[]).map((item) => item.note)
}

describe('报表下钻期间：GET /transactions?from&to', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.transaction.deleteMany()
    await prisma.auditEvent.deleteMany()
    await prisma.account.deleteMany()
    await prisma.accountCategory.deleteMany()
    await prisma.transactionCategory.deleteMany()

    await prisma.accountCategory.create({
      data: { id: ACCOUNT_CATEGORY_ID, name: '下钻期间现金', type: 'asset', sort: 0 },
    })
    await prisma.account.create({
      data: {
        id: ACCOUNT_ID,
        name: '下钻期间账户',
        type: 'asset',
        initialBalance: 0,
        categoryId: ACCOUNT_CATEGORY_ID,
      },
    })
    await prisma.transactionCategory.create({
      data: { id: CATEGORY_ID, name: '下钻期间分类', type: 'expense', sort: 0 },
    })

    // 首末日都取当天极值时刻，验证端点按日历日包含。
    await createExpense(new Date(2026, 1, 28, 23, 55), '区间前')
    await createExpense(new Date(2026, 2, 1, 0, 5), '首日 00:05')
    await createExpense(new Date(2026, 2, 15, 12, 0), '区间中')
    await createExpense(new Date(2026, 2, 31, 23, 55), '末日 23:55')
    await createExpense(new Date(2026, 3, 1, 0, 5), '区间后')
  })

  it('同时给 from/to：两端当天都算在区间内（含端点）', async () => {
    const notes = await listNotes({ from: FROM_DAY, to: TO_DAY })
    expect(notes.sort()).toEqual(['末日 23:55', '区间中', '首日 00:05'].sort())
  })

  it('只给 from：从 from 当天零点起，不设上界', async () => {
    const notes = await listNotes({ from: FROM_DAY })
    expect(notes.sort()).toEqual(['末日 23:55', '区间中', '区间后', '首日 00:05'].sort())
  })

  it('只给 to：到 to 当天结束为止，不设下界', async () => {
    const notes = await listNotes({ to: TO_DAY })
    expect(notes.sort()).toEqual(['区间前', '末日 23:55', '区间中', '首日 00:05'].sort())
  })

  it('from/to 都不给：不加日期过滤', async () => {
    const notes = await listNotes({})
    expect(notes.sort()).toEqual(['区间前', '末日 23:55', '区间中', '区间后', '首日 00:05'].sort())
  })

  it('from 晚于 to：400，而不是静默返回空集', async () => {
    const response = await request(app)
      .get('/api/transactions')
      .query({ from: AFTER_DAY, to: FROM_DAY })
    expect(response.status).toBe(400)
    expect(response.body.error.message).toBe('开始日期不能晚于结束日期')
  })

  it('from/to 优先于 startDate/endDate', async () => {
    const notes = await listNotes({
      from: FROM_DAY,
      to: MID_DAY,
      startDate: AFTER_DAY,
      endDate: AFTER_DAY,
    })
    expect(notes.sort()).toEqual(['区间中', '首日 00:05'].sort())
  })
})
