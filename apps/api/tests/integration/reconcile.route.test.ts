import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'

const { default: app } = await import('../../src/index.js')
const { prisma } = await import('../../src/prisma.js')

const DATE = '2026-11-02'
const BOOK_BEFORE = 100000 // 期初 ¥1,000.00
const EXPENSE = 20000 // 11-01 支出 ¥200.00 → 11-02 账面 ¥800.00

async function createAccount(initialBalance = BOOK_BEFORE) {
  return prisma.account.create({
    data: { name: '对账测试账户', type: 'asset', initialBalance, initialBalanceDate: new Date('2026-01-01T00:00:00') },
  })
}

async function createExpense(accountId: string) {
  return prisma.transaction.create({
    data: {
      type: 'expense',
      amount: BigInt(EXPENSE),
      date: new Date('2026-11-01T00:00:00'),
      accountId,
    },
  })
}

describe('POST /api/accounts/:id/reconcile', () => {
  beforeAll(async () => {
    await prisma.$connect()
    await prisma.budget.deleteMany().catch(() => {})
    await prisma.transaction.deleteMany().catch(() => {})
    await prisma.account.deleteMany().catch(() => {})
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.transaction.deleteMany()
    await prisma.account.deleteMany()
  })

  it('生成一条平账分录，金额等于真实值减账面推导值，且期初余额不变', async () => {
    const account = await createAccount()
    await createExpense(account.id)

    const response = await request(app)
      .post(`/api/accounts/${account.id}/reconcile`)
      .send({ date: DATE, actualBalance: 90000 })

    expect(response.status).toBe(200)
    expect(response.body.data.status).toBe('created')
    expect(response.body.data.bookBalance).toBe(80000)
    expect(response.body.data.actualBalance).toBe(90000)
    expect(response.body.data.difference).toBe(10000)

    const adjustment = await prisma.transaction.findFirst({
      where: { accountId: account.id, type: 'adjustment' },
    })
    expect(adjustment).not.toBeNull()
    expect(Number(adjustment!.amount)).toBe(10000)
    expect(adjustment!.note).toContain('对账矫正：账面 ¥800.00，实际 ¥900.00')

    // 改当前余额只落平账分录，绝不折算进 initialBalance。
    const afterAccount = await prisma.account.findUnique({ where: { id: account.id } })
    expect(Number(afterAccount!.initialBalance)).toBe(BOOK_BEFORE)

    const balanceAt = await request(app)
      .get(`/api/accounts/${account.id}/balance-at`)
      .query({ date: DATE })
    expect(balanceAt.body.data.balance).toBe(90000)

    // 平账不计入收支统计。
    const stats = await request(app)
      .get('/api/transactions/stats')
      .query({ startDate: '2026-11-01', endDate: DATE })
    expect(stats.body.data.income).toBe(0)
    expect(stats.body.data.expense).toBe(EXPENSE)
  })

  it('负数差额生成负数平账分录（账面高于实际）', async () => {
    const account = await createAccount()
    await createExpense(account.id)

    const response = await request(app)
      .post(`/api/accounts/${account.id}/reconcile`)
      .send({ date: DATE, actualBalance: 70000 })

    expect(response.body.data.difference).toBe(-10000)
    const adjustment = await prisma.transaction.findFirst({
      where: { accountId: account.id, type: 'adjustment' },
    })
    expect(Number(adjustment!.amount)).toBe(-10000)
  })

  it('账面已等于实际时不生成分录', async () => {
    const account = await createAccount()
    await createExpense(account.id)

    const response = await request(app)
      .post(`/api/accounts/${account.id}/reconcile`)
      .send({ date: DATE, actualBalance: 80000 })

    expect(response.body.data.status).toBe('balanced')
    expect(response.body.data.difference).toBe(0)
    expect(await prisma.transaction.count({ where: { accountId: account.id, type: 'adjustment' } })).toBe(0)
  })

  it('同账户同日第二次不静默追加：未指定 mode 返回 409 且不新增记录', async () => {
    const account = await createAccount()
    await createExpense(account.id)

    await request(app)
      .post(`/api/accounts/${account.id}/reconcile`)
      .send({ date: DATE, actualBalance: 90000 })

    const conflict = await request(app)
      .post(`/api/accounts/${account.id}/reconcile`)
      .send({ date: DATE, actualBalance: 95000 })

    expect(conflict.status).toBe(409)
    expect(conflict.body.error.code).toBe('CONFLICT')
    expect(conflict.body.error.details?.code).toBe('RECONCILE_CONFLICT')
    expect(await prisma.transaction.count({ where: { accountId: account.id, type: 'adjustment' } })).toBe(1)
  })

  it('覆盖路径：连续两次同账户同日对账仍只有一条记录，余额等于最新实际值', async () => {
    const account = await createAccount()
    await createExpense(account.id)

    const first = await request(app)
      .post(`/api/accounts/${account.id}/reconcile`)
      .send({ date: DATE, actualBalance: 90000 })
    const second = await request(app)
      .post(`/api/accounts/${account.id}/reconcile`)
      .send({ date: DATE, actualBalance: 95000, mode: 'overwrite' })

    expect(second.body.data.status).toBe('overwritten')
    expect(second.body.data.difference).toBe(15000)
    expect(await prisma.transaction.count({ where: { accountId: account.id, type: 'adjustment' } })).toBe(1)

    const single = await prisma.transaction.findFirst({
      where: { accountId: account.id, type: 'adjustment' },
    })
    expect(Number(single!.amount)).toBe(15000)
    expect(single!.id).toBe(first.body.data.transactionId)

    const balanceAt = await request(app)
      .get(`/api/accounts/${account.id}/balance-at`)
      .query({ date: DATE })
    expect(balanceAt.body.data.balance).toBe(95000)

    // 覆盖也留审计事件
    const events = await prisma.auditEvent.count({ where: { entityId: single!.id, action: 'updated' } })
    expect(events).toBeGreaterThan(0)
  })

  it('覆盖后差额归零：软删除原平账记录并写审计事件，不保留 0 元记录', async () => {
    const account = await createAccount()
    await createExpense(account.id)

    const first = await request(app)
      .post(`/api/accounts/${account.id}/reconcile`)
      .send({ date: DATE, actualBalance: 90000 })
    const second = await request(app)
      .post(`/api/accounts/${account.id}/reconcile`)
      .send({ date: DATE, actualBalance: 80000, mode: 'overwrite' })

    expect(second.body.data.status).toBe('balanced')
    expect(second.body.data.difference).toBe(0)
    expect(await prisma.transaction.count({
      where: { accountId: account.id, type: 'adjustment', deletedAt: null },
    })).toBe(0)

    const deleted = await prisma.transaction.findUnique({
      where: { id: first.body.data.transactionId },
    })
    expect(deleted!.deletedAt).not.toBeNull()

    const deletedEvents = await prisma.auditEvent.count({
      where: { entityId: first.body.data.transactionId, action: 'deleted' },
    })
    expect(deletedEvents).toBeGreaterThan(0)

    const balanceAt = await request(app)
      .get(`/api/accounts/${account.id}/balance-at`)
      .query({ date: DATE })
    expect(balanceAt.body.data.balance).toBe(80000)
  })

  it('追加路径：显式 mode=append 才新增第二条，合计仍等于差额', async () => {
    const account = await createAccount()
    await createExpense(account.id)

    await request(app)
      .post(`/api/accounts/${account.id}/reconcile`)
      .send({ date: DATE, actualBalance: 90000 })
    const append = await request(app)
      .post(`/api/accounts/${account.id}/reconcile`)
      .send({ date: DATE, actualBalance: 95000, mode: 'append' })

    expect(append.body.data.status).toBe('appended')
    expect(append.body.data.bookBalance).toBe(90000)
    expect(append.body.data.difference).toBe(5000)
    expect(await prisma.transaction.count({ where: { accountId: account.id, type: 'adjustment' } })).toBe(2)

    const balanceAt = await request(app)
      .get(`/api/accounts/${account.id}/balance-at`)
      .query({ date: DATE })
    expect(balanceAt.body.data.balance).toBe(95000)
  })
})
