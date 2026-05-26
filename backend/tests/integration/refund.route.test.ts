import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import { PrismaClient } from '@prisma/client'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const testDbPath = path.resolve(__dirname, '../../prisma/test.db')
const testDbUrl = `file:${testDbPath}`

const createTestApp = (prisma: PrismaClient) => {
  const app = express()
  app.use(express.json())

  app.get('/api/transactions/stats', async (req, res) => {
    try {
      const where: any = { isAdjustment: false }

      const [incomeResult, expenseResult, incomeRefundResult, expenseRefundResult, transferCount] = await Promise.all([
        prisma.transaction.aggregate({ where: { ...where, type: 'income' }, _sum: { amount: true } }),
        prisma.transaction.aggregate({ where: { ...where, type: 'expense' }, _sum: { amount: true } }),
        prisma.transaction.aggregate({ where: { ...where, type: 'refund', relatedType: 'income' }, _sum: { amount: true, fee: true } }),
        prisma.transaction.aggregate({ where: { ...where, type: 'refund', relatedType: 'expense' }, _sum: { amount: true, fee: true } }),
        prisma.transaction.count({ where: { ...where, type: 'transfer' } }),
      ])

      const income = parseFloat(String(incomeResult._sum.amount || 0))
      const expense = parseFloat(String(expenseResult._sum.amount || 0))
      const incomeRefund = parseFloat(String(incomeRefundResult._sum.amount || 0)) - parseFloat(String(incomeRefundResult._sum.fee || 0))
      const expenseRefund = parseFloat(String(expenseRefundResult._sum.amount || 0)) - parseFloat(String(expenseRefundResult._sum.fee || 0))
      const totalRefund = incomeRefund + expenseRefund

      res.json({
        success: true,
        data: {
          income: income - incomeRefund,
          expense: expense - expenseRefund,
          refund: totalRefund,
          balance: income - incomeRefund - expense + expenseRefund,
          transferCount,
        },
      })
    } catch (error) {
      res.status(500).json({ success: false, error: { code: 'ERROR', message: String(error) } })
    }
  })

  return app
}

describe('退款对统计数据的影响', () => {
  let app: express.Application
  let prisma: PrismaClient
  let testAccountId: string

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: testDbUrl } } })

    try {
      await prisma.$connect()
      await prisma.accountCategory.createMany({
        data: [
          { id: 'cat-cash', name: '现金', type: 'asset', sort: 0 },
          { id: 'cat-liability', name: '负债', type: 'liability', sort: 1 },
        ],
      }).catch(() => {})
    } catch (error) {
      console.warn('测试数据库连接失败:', error)
    }

    app = createTestApp(prisma)
    const existing = await prisma.account.findFirst()
    testAccountId = existing?.id || ''
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.transaction.deleteMany()
    const account = await prisma.account.update({
      where: { id: testAccountId },
      data: { initialBalance: 0 },
    }).catch(async () => {
      const a = await prisma.account.create({
        data: { name: '测试账户', type: 'asset', initialBalance: 0 },
      })
      return a
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

  it('收入退款有手续费时，净收入应扣减 (退款金额 - 手续费)', async () => {
    const income = await prisma.transaction.create({
      data: { type: 'income', amount: 1000, accountId: testAccountId, date: new Date() },
    })
    await prisma.transaction.create({
      data: { type: 'refund', amount: 100, fee: 5, accountId: testAccountId, date: new Date(), relatedTransactionId: income.id, relatedType: 'income' },
    })

    const response = await request(app).get('/api/transactions/stats')

    expect(response.body.data.income).toBe(905)
    expect(response.body.data.refund).toBe(95)
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

  it('支出退款有手续费时，净支出应扣减 (退款金额 - 手续费)', async () => {
    const expense = await prisma.transaction.create({
      data: { type: 'expense', amount: 500, accountId: testAccountId, date: new Date() },
    })
    await prisma.transaction.create({
      data: { type: 'refund', amount: 100, fee: 5, accountId: testAccountId, date: new Date(), relatedTransactionId: expense.id, relatedType: 'expense' },
    })

    const response = await request(app).get('/api/transactions/stats')

    expect(response.body.data.expense).toBe(405)
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

  it('退款不应被重复计入 balance', async () => {
    const income = await prisma.transaction.create({
      data: { type: 'income', amount: 1000, accountId: testAccountId, date: new Date() },
    })
    await prisma.transaction.create({
      data: { type: 'refund', amount: 100, accountId: testAccountId, date: new Date(), relatedTransactionId: income.id, relatedType: 'income' },
    })

    const response = await request(app).get('/api/transactions/stats')

    expect(response.body.data.balance).toBe(900)
  })

  it('无退款时统计应正常计算', async () => {
    await prisma.transaction.create({
      data: { type: 'income', amount: 1000, accountId: testAccountId, date: new Date() },
    })
    await prisma.transaction.create({
      data: { type: 'expense', amount: 300, accountId: testAccountId, date: new Date() },
    })

    const response = await request(app).get('/api/transactions/stats')

    expect(response.body.data.income).toBe(1000)
    expect(response.body.data.expense).toBe(300)
    expect(response.body.data.balance).toBe(700)
    expect(response.body.data.refund).toBe(0)
  })

  it('收入退款只从收入中扣减，不影响支出', async () => {
    const income = await prisma.transaction.create({
      data: { type: 'income', amount: 1000, accountId: testAccountId, date: new Date() },
    })
    const expense = await prisma.transaction.create({
      data: { type: 'expense', amount: 300, accountId: testAccountId, date: new Date() },
    })
    await prisma.transaction.create({
      data: { type: 'refund', amount: 100, accountId: testAccountId, date: new Date(), relatedTransactionId: income.id, relatedType: 'income' },
    })

    const response = await request(app).get('/api/transactions/stats')

    expect(response.body.data.income).toBe(900)
    expect(response.body.data.expense).toBe(300)
    expect(response.body.data.balance).toBe(600)
  })

  it('支出退款只从支出中扣减，不影响收入', async () => {
    const income = await prisma.transaction.create({
      data: { type: 'income', amount: 1000, accountId: testAccountId, date: new Date() },
    })
    const expense = await prisma.transaction.create({
      data: { type: 'expense', amount: 300, accountId: testAccountId, date: new Date() },
    })
    await prisma.transaction.create({
      data: { type: 'refund', amount: 100, accountId: testAccountId, date: new Date(), relatedTransactionId: expense.id, relatedType: 'expense' },
    })

    const response = await request(app).get('/api/transactions/stats')

    expect(response.body.data.income).toBe(1000)
    expect(response.body.data.expense).toBe(200)
    expect(response.body.data.balance).toBe(800)
  })
})
