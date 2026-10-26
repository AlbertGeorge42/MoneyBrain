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

describe('Account API Integration Tests', () => {
  beforeAll(async () => {
    await prisma.$connect()
    await prisma.investmentAllocationItem.deleteMany().catch(() => {})
    await prisma.investmentAllocationSnapshot.deleteMany().catch(() => {})
    await prisma.investmentAssetClass.deleteMany().catch(() => {})
    await prisma.budget.deleteMany().catch(() => {})
    await prisma.transaction.deleteMany().catch(() => {})
    await prisma.account.deleteMany().catch(() => {})
    await prisma.accountCategory.deleteMany().catch(() => {})

    await prisma.accountCategory.createMany({
      data: [
        { id: 'cat-cash', name: '现金', type: 'asset', sort: 0 },
        { id: 'cat-liability', name: '负债', type: 'liability', sort: 1 },
      ],
    })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.transaction.deleteMany()
    await prisma.account.deleteMany()
  })

  describe('GET /api/accounts', () => {
    it('应该返回空数组当没有账户时', async () => {
      const response = await request(app).get('/api/accounts')

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data).toEqual([])
    })

    it('应该返回账户列表', async () => {
      await prisma.account.create({
        data: { name: '测试账户', type: 'asset', initialBalance: 100000 },
      })

      const response = await request(app).get('/api/accounts')

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.length).toBeGreaterThan(0)
      expect(response.body.data[0]).toHaveProperty('name', '测试账户')
      // BigInt 分在 JSON 里是 number 分
      expect(response.body.data[0].initialBalance).toBe(100000)
    })
  })

  describe('POST /api/accounts', () => {
    it('应该创建账户并返回 201', async () => {
      const response = await request(app)
        .post('/api/accounts')
        .send({ name: '新账户', type: 'asset', initialBalance: 5000 })

      expect(response.status).toBe(201)
      expect(response.body.success).toBe(true)
      expect(response.body.data.name).toBe('新账户')
      expect(response.body.data.initialBalance).toBe(5000)
    })

    it('应该使用默认余额 0', async () => {
      const response = await request(app)
        .post('/api/accounts')
        .send({ name: '无余额账户', type: 'asset' })

      expect(response.status).toBe(201)
      expect(response.body.data.initialBalance).toBe(0)
    })
  })

  describe('PUT /api/accounts/:id', () => {
    it('应该更新账户', async () => {
      const account = await prisma.account.create({
        data: { name: '原名称', type: 'asset', initialBalance: 1000 },
      })

      const response = await request(app)
        .put(`/api/accounts/${account.id}`)
        .send({ name: '新名称' })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.name).toBe('新名称')
    })
  })

  describe('DELETE /api/accounts/:id', () => {
    it('无交易的账户应该直接删除', async () => {
      const account = await prisma.account.create({
        data: { name: '待删除', type: 'asset', initialBalance: 0 },
      })

      const response = await request(app).delete(`/api/accounts/${account.id}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.message).toBe('删除成功')
    })

    it('有交易的账户非 force 模式应该返回 400', async () => {
      const account = await prisma.account.create({
        data: { name: '有交易', type: 'asset', initialBalance: 1000 },
      })
      await prisma.transaction.create({
        data: { type: 'income', amount: 500, accountId: account.id, date: new Date() },
      })

      const response = await request(app).delete(`/api/accounts/${account.id}`)

      expect(response.status).toBe(400)
      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('force 模式应该级联删除', async () => {
      const account = await prisma.account.create({
        data: { name: '强制删除', type: 'asset', initialBalance: 1000 },
      })
      await prisma.transaction.create({
        data: { type: 'income', amount: 500, accountId: account.id, date: new Date() },
      })

      const response = await request(app)
        .delete(`/api/accounts/${account.id}`)
        .query({ force: 'true' })

      expect(response.status).toBe(200)
      expect(response.body.data.deletedTransactions).toBe(1)
    })
  })
})
