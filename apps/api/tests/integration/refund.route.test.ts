import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testDbPath = path.resolve(__dirname, '../../prisma/test.db')

// 必须在导入 src/prisma.ts 之前指向测试库
process.env.DATABASE_URL = `file:${testDbPath}`

const { default: app } = await import('../../src/index.js')
const { prisma } = await import('../../src/prisma.js')

describe('退款对统计数据的影响', () => {
  let testAccountId: string

  beforeAll(async () => {
    await prisma.$connect()
    await prisma.transaction.deleteMany().catch(() => {})
    await prisma.account.deleteMany().catch(() => {})
    await prisma.accountCategory.createMany({
      data: [
        { id: 'cat-cash', name: '现金', type: 'asset', sort: 0 },
        { id: 'cat-liability', name: '负债', type: 'liability', sort: 1 },
      ],
    }).catch(() => {})
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.transaction.deleteMany()
    const account = await prisma.account.create({
      data: { name: '测试账户', type: 'asset', initialBalance: 0 },
    })
    testAccountId = account.id
  })

  it('收入退款应减少净收入', async () => {
    const income = await prisma.transaction.create({
      data: { type: 'income', amount: 1000, accountId: testAccountId, date: new Date() },
    })
    await prisma.transaction.create({
      data: { type: 'refund', amount: 100, accountId: testAccountId, date: new Date(), relatedTransactionId: income.id, relatedType: 'income' },
    })

    const response = await request(app).get('/api/transactions/stats')

    expect(response.body.success).toBe(true)
    expect(response.body.data.income).toBe(900)
    expect(response.body.data.expense).toBe(0)
    expect(response.body.data.refund).toBe(100)
  })

  it('refund.amount 是净额，统计不再重复扣手续费', async () => {
    const income = await prisma.transaction.create({
      data: { type: 'income', amount: 1000, accountId: testAccountId, date: new Date() },
    })
    await prisma.transaction.create({
      data: { type: 'refund', amount: 100, fee: 5, accountId: testAccountId, date: new Date(), relatedTransactionId: income.id, relatedType: 'income' },
    })

    const response = await request(app).get('/api/transactions/stats')

    expect(response.body.data.income).toBe(900)
    expect(response.body.data.refund).toBe(100)
  })

  it('支出退款应减少净支出', async () => {
    const expense = await prisma.transaction.create({
      data: { type: 'expense', amount: 500, accountId: testAccountId, date: new Date() },
    })
    await prisma.transaction.create({
      data: { type: 'refund', amount: 100, accountId: testAccountId, date: new Date(), relatedTransactionId: expense.id, relatedType: 'expense' },
    })

    const response = await request(app).get('/api/transactions/stats')

    expect(response.body.data.income).toBe(0)
    expect(response.body.data.expense).toBe(400)
  })

  it('支出退款带手续费时仍按存储净额统计', async () => {
    const expense = await prisma.transaction.create({
      data: { type: 'expense', amount: 500, accountId: testAccountId, date: new Date() },
    })
    await prisma.transaction.create({
      data: { type: 'refund', amount: 100, fee: 5, accountId: testAccountId, date: new Date(), relatedTransactionId: expense.id, relatedType: 'expense' },
    })

    const response = await request(app).get('/api/transactions/stats')

    expect(response.body.data.expense).toBe(400)
  })

  it('收支退款同时存在时，各自统计应正确', async () => {
    const income = await prisma.transaction.create({
      data: { type: 'income', amount: 1000, accountId: testAccountId, date: new Date() },
    })
    const expense = await prisma.transaction.create({
      data: { type: 'expense', amount: 400, accountId: testAccountId, date: new Date() },
    })
    await prisma.transaction.create({
      data: { type: 'refund', amount: 200, accountId: testAccountId, date: new Date(), relatedTransactionId: income.id, relatedType: 'income' },
    })
    await prisma.transaction.create({
      data: { type: 'refund', amount: 100, accountId: testAccountId, date: new Date(), relatedTransactionId: expense.id, relatedType: 'expense' },
    })

    const response = await request(app).get('/api/transactions/stats')

    expect(response.body.data.income).toBe(800)
    expect(response.body.data.expense).toBe(300)
    expect(response.body.data.balance).toBe(500)
    expect(response.body.data.refund).toBe(300)
  })

  it('累计退款不得超过原交易金额：500 退 200 + 50 后再退 300 被拒，并给出精确原因', async () => {
    const today = new Date().toISOString().split('T')[0]
    const expense = await prisma.transaction.create({
      data: { type: 'expense', amount: 50_000, accountId: testAccountId, date: new Date() },
    })

    for (const amount of [20_000, 5_000]) {
      const created = await request(app)
        .post('/api/transactions')
        .send({ type: 'refund', amount, date: today, accountId: testAccountId, relatedTransactionId: expense.id })
      expect(created.status).toBe(201)
    }

    const rejected = await request(app)
      .post('/api/transactions')
      .send({ type: 'refund', amount: 30_000, date: today, accountId: testAccountId, relatedTransactionId: expense.id })

    expect(rejected.status).toBe(400)
    expect(rejected.body.error.message).toContain('退款金额超出可退余额')
    expect(rejected.body.error.message).toContain('原交易 ¥500.00')
    expect(rejected.body.error.message).toContain('已退款 ¥250.00')
    expect(rejected.body.error.message).toContain('本次可退 ¥250.00')
    expect(rejected.body.error.message).toContain('本次退款 ¥300.00')

    // 读取侧：原交易带两条退款，前端据此显示 已退款 ¥250.00 / 剩余 ¥250.00
    const list = await request(app).get('/api/transactions').query({ type: 'expense' })
    const original = list.body.data.list.find((item: { id: string }) => item.id === expense.id)
    expect(original.refunds.map((item: { amount: number }) => item.amount).sort((a: number, b: number) => a - b))
      .toEqual([5_000, 20_000])
  })

  it('全额退款后不可再退，原交易从可关联列表移除', async () => {
    const today = new Date().toISOString().split('T')[0]
    const expense = await prisma.transaction.create({
      data: { type: 'expense', amount: 10_000, accountId: testAccountId, date: new Date() },
    })

    const full = await request(app)
      .post('/api/transactions')
      .send({ type: 'refund', amount: 10_000, date: today, accountId: testAccountId, relatedTransactionId: expense.id })
    expect(full.status).toBe(201)

    const refundable = await request(app).get('/api/transactions/refundable/list')
    expect(refundable.body.data.some((item: { id: string }) => item.id === expense.id)).toBe(false)

    const rejected = await request(app)
      .post('/api/transactions')
      .send({ type: 'refund', amount: 1, date: today, accountId: testAccountId, relatedTransactionId: expense.id })
    expect(rejected.status).toBe(400)
    expect(rejected.body.error.message).toContain('本次可退 ¥0.00')
  })

  it('未关联退款可正常记账，但不进入收入/支出合计（只影响余额）', async () => {
    const today = new Date().toISOString().split('T')[0]
    const created = await request(app)
      .post('/api/transactions')
      .send({ type: 'refund', amount: 5_000, date: today, accountId: testAccountId, note: '未关联退款' })

    expect(created.status).toBe(201)
    expect(created.body.data.relatedTransactionId).toBeNull()
    expect(created.body.data.relatedType).toBeNull()

    const stats = await request(app).get('/api/transactions/stats')
    expect(stats.body.data.income).toBe(0)
    expect(stats.body.data.expense).toBe(0)
    expect(stats.body.data.refund).toBe(0)

    const balance = await request(app)
      .get(`/api/accounts/${testAccountId}/balance-at`)
      .query({ date: '2099-12-31' })
    expect(balance.body.data.balance).toBe(5_000)
  })

  it('删除退款后原交易已退款金额回退，撤销后恢复', async () => {
    const today = new Date().toISOString().split('T')[0]
    const expense = await prisma.transaction.create({
      data: { type: 'expense', amount: 50_000, accountId: testAccountId, date: new Date() },
    })
    const refund = await request(app)
      .post('/api/transactions')
      .send({ type: 'refund', amount: 20_000, date: today, accountId: testAccountId, relatedTransactionId: expense.id })
    expect(refund.status).toBe(201)

    const before = await request(app).get('/api/transactions').query({ type: 'expense' })
    const originalBefore = before.body.data.list.find((item: { id: string }) => item.id === expense.id)
    expect(originalBefore.refunds).toHaveLength(1)

    const deleted = await request(app).delete(`/api/transactions/${refund.body.data.id}`)
    expect(deleted.status).toBe(200)

    const afterDelete = await request(app).get('/api/transactions').query({ type: 'expense' })
    const originalAfterDelete = afterDelete.body.data.list.find((item: { id: string }) => item.id === expense.id)
    expect(originalAfterDelete.refunds).toHaveLength(0)

    const statsAfterDelete = await request(app).get('/api/transactions/stats')
    expect(statsAfterDelete.body.data.expense).toBe(50_000)

    const undo = await request(app).post(`/api/audit-events/${deleted.body.data.auditEventId}/undo`)
    expect(undo.status).toBe(200)

    const afterUndo = await request(app).get('/api/transactions').query({ type: 'expense' })
    const originalAfterUndo = afterUndo.body.data.list.find((item: { id: string }) => item.id === expense.id)
    expect(originalAfterUndo.refunds).toHaveLength(1)

    const statsAfterUndo = await request(app).get('/api/transactions/stats')
    expect(statsAfterUndo.body.data.expense).toBe(30_000)
  })

  it('编辑退款金额同样受累计上限约束，不能借编辑绕过', async () => {
    const today = new Date().toISOString().split('T')[0]
    const expense = await prisma.transaction.create({
      data: { type: 'expense', amount: 10_000, accountId: testAccountId, date: new Date() },
    })
    const first = await request(app)
      .post('/api/transactions')
      .send({ type: 'refund', amount: 4_000, date: today, accountId: testAccountId, relatedTransactionId: expense.id })
    const second = await request(app)
      .post('/api/transactions')
      .send({ type: 'refund', amount: 4_000, date: today, accountId: testAccountId, relatedTransactionId: expense.id })
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)

    const rejected = await request(app)
      .put(`/api/transactions/${first.body.data.id}`)
      .send({ amount: 6_100 })
    expect(rejected.status).toBe(400)
    expect(rejected.body.error.message).toContain('本次可退 ¥60.00')
    expect(rejected.body.error.message).toContain('本次退款 ¥61.00')
  })

  it('退款口径：统计、总览、报表都按原侧冲减，不把退款再计成收入', async () => {
    const today = new Date().toISOString().split('T')[0]
    const expense = await prisma.transaction.create({
      data: { type: 'expense', amount: 50_000, accountId: testAccountId, date: new Date() },
    })
    for (const amount of [20_000, 5_000]) {
      await request(app)
        .post('/api/transactions')
        .send({ type: 'refund', amount, date: today, accountId: testAccountId, relatedTransactionId: expense.id })
    }

    const stats = await request(app).get('/api/transactions/stats')
    expect(stats.body.data.income).toBe(0)
    expect(stats.body.data.expense).toBe(25_000)
    expect(stats.body.data.refund).toBe(25_000)

    const dashboard = await request(app).get('/api/analytics/dashboard')
    expect(dashboard.body.data.thisMonth.income).toBe(0)
    expect(dashboard.body.data.thisMonth.expense).toBe(25_000)

    const report = await request(app)
      .get('/api/reports/income-expense')
      .query({ startDate: today, endDate: today })
    expect(report.body.data.income.actual).toBe(0)
    expect(report.body.data.expense.actual).toBe(25_000)
  })

  it('关联退款归属原交易分类，预算用量与总览/报表同步冲减', async () => {
    const today = new Date().toISOString().split('T')[0]
    const now = new Date()
    const category = await prisma.transactionCategory.create({
      data: { name: '预算分类', type: 'expense' },
    })
    const refundCategory = await prisma.transactionCategory.create({
      data: { name: '退款分类', type: 'refund' },
    })
    const budgetRes = await request(app).post('/api/budgets').send({
      name: '预算', amount: 100_000, type: 'expense', period: 'monthly',
      startDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      accountId: testAccountId, categoryId: category.id,
    })
    expect(budgetRes.status).toBe(201)

    const expense = await request(app)
      .post('/api/transactions')
      .send({ type: 'expense', amount: 50_000, date: today, accountId: testAccountId, categoryId: category.id })
    const refund = await request(app)
      .post('/api/transactions')
      .send({ type: 'refund', amount: 20_000, date: today, accountId: testAccountId, categoryId: refundCategory.id, relatedTransactionId: expense.body.data.id })
    expect(refund.status).toBe(201)
    // 即使显式传了「退款」分类，关联退款仍归属原交易分类，否则预算不会冲减
    expect(refund.body.data.categoryId).toBe(category.id)

    const statuses = await request(app).get('/api/budgets/statuses').query({ ids: budgetRes.body.data.id })
    expect(statuses.body.data[0].used).toBe(30_000)
  })

  it('跨账户退款属合法业务：原账户余额不恢复，退款账户按实际金额增加（B4）', async () => {
    const refundAccount = await prisma.account.create({
      data: { name: '跨账户退款账户', type: 'asset', initialBalance: 0 },
    })
    const expense = await prisma.transaction.create({
      data: { type: 'expense', amount: 5000, accountId: testAccountId, date: new Date() },
    })

    const created = await request(app)
      .post('/api/transactions')
      .send({ type: 'refund', amount: 4000, date: new Date().toISOString().split('T')[0], accountId: refundAccount.id, relatedTransactionId: expense.id })
    expect(created.status).toBe(201)

    // 原账户不恢复（−5000），退款账户按实际金额增加（+4000）
    const originalBalance = await request(app)
      .get(`/api/accounts/${testAccountId}/balance-at`)
      .query({ date: '2099-12-31' })
    expect(originalBalance.body.data.balance).toBe(-5000)
    const refundBalance = await request(app)
      .get(`/api/accounts/${refundAccount.id}/balance-at`)
      .query({ date: '2099-12-31' })
    expect(refundBalance.body.data.balance).toBe(4000)

    // 净资产变化 = −5000 + 4000 = −1000；冲减语义：净支出 = 5000 − 4000 = 1000
    const response = await request(app).get('/api/transactions/stats')
    expect(response.body.data.expense).toBe(1000)
  })

  it('换原交易时应同步 relatedType，统计方向随新原交易（D11）', async () => {
    const income = await prisma.transaction.create({
      data: { type: 'income', amount: 1000, accountId: testAccountId, date: new Date() },
    })
    const expense = await prisma.transaction.create({
      data: { type: 'expense', amount: 500, accountId: testAccountId, date: new Date() },
    })
    const refund = await prisma.transaction.create({
      data: { type: 'refund', amount: 100, accountId: testAccountId, date: new Date(), relatedTransactionId: income.id, relatedType: 'income' },
    })

    const updated = await request(app)
      .put(`/api/transactions/${refund.id}`)
      .send({ relatedTransactionId: expense.id })
    expect(updated.status).toBe(200)

    const stored = await prisma.transaction.findUnique({ where: { id: refund.id } })
    expect(stored?.relatedType).toBe('expense')

    // 冲减方向跟着新原交易：收入不再被冲减，支出退 100
    const stats = await request(app).get('/api/transactions/stats')
    expect(stats.body.data.income).toBe(1000)
    expect(stats.body.data.expense).toBe(400)
  })

  it('统计开关：默认排除「不计收支」，includeExcluded=true 时计入全貌', async () => {
    const today = new Date().toISOString().split('T')[0]
    const otherAccount = await prisma.account.create({
      data: { name: '转账目标账户', type: 'asset', initialBalance: 0 },
    })
    await prisma.transaction.create({
      data: { type: 'income', amount: 100_000, accountId: testAccountId, date: new Date() },
    })
    await prisma.transaction.create({
      data: { type: 'expense', amount: 50_000, accountId: testAccountId, date: new Date() },
    })
    // 被标记为「不计收支」的支出与转账：余额照常变化，但默认不进收支合计。
    const excludedExpense = await prisma.transaction.create({
      data: {
        type: 'expense',
        amount: 30_000,
        accountId: testAccountId,
        date: new Date(),
        excludeFromIncomeExpense: true,
      },
    })
    await prisma.transaction.create({
      data: {
        type: 'transfer',
        amount: 20_000,
        accountId: testAccountId,
        toAccountId: otherAccount.id,
        date: new Date(),
        excludeFromIncomeExpense: true,
      },
    })

    const excluded = await request(app)
      .get('/api/transactions/stats')
      .query({ startDate: today, endDate: today })
    expect(excluded.body.data.income).toBe(100_000)
    expect(excluded.body.data.expense).toBe(50_000)
    expect(excluded.body.data.balance).toBe(50_000)
    expect(excluded.body.data.transferCount).toBe(0)

    const included = await request(app)
      .get('/api/transactions/stats')
      .query({ startDate: today, endDate: today, includeExcluded: 'true' })
    expect(included.body.data.income).toBe(100_000)
    expect(included.body.data.expense).toBe(80_000)
    expect(included.body.data.balance).toBe(20_000)
    expect(included.body.data.transferCount).toBe(1)

    // 影响面：标记只改统计口径，余额与净资产照常计入。
    const balance = await request(app)
      .get(`/api/accounts/${testAccountId}/balance-at`)
      .query({ date: '2099-12-31' })
    expect(balance.body.data.balance).toBe(0)
    expect(await prisma.transaction.findUnique({ where: { id: excludedExpense.id } })).not.toBeNull()
  })
})
