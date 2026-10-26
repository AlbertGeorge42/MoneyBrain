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
})
