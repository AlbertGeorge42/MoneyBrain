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

  it('退款金额高于原额属合法业务：允许写入，余额与统计按实际金额正确（B4）', async () => {
    const expense = await prisma.transaction.create({
      data: { type: 'expense', amount: 5000, accountId: testAccountId, date: new Date() },
    })

    // 5000 分的支出退 6000 分——不设上限，允许写入
    const created = await request(app)
      .post('/api/transactions')
      .send({ type: 'refund', amount: 6000, date: new Date().toISOString().split('T')[0], accountId: testAccountId, relatedTransactionId: expense.id })
    expect(created.status).toBe(201)

    // 余额按实际退款金额变动：−5000 + 6000 = +1000
    const balance = await request(app)
      .get(`/api/accounts/${testAccountId}/balance-at`)
      .query({ date: '2099-12-31' })
    expect(balance.body.data.balance).toBe(1000)

    // 冲减语义不变：净支出 = 5000 − 6000 = −1000（超退冲减后为负是口径的自然结果）
    const response = await request(app).get('/api/transactions/stats')
    expect(response.body.data.expense).toBe(-1000)
    expect(response.body.data.refund).toBe(6000)
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
})
