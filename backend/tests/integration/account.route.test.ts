import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import { PrismaClient } from '@prisma/client'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 测试数据库文件路径（使用绝对路径）
const testDbPath = path.resolve(__dirname, '../../prisma/test.db')
const testDbUrl = `file:${testDbPath}`

// 创建测试应用实例
const createTestApp = (prisma: PrismaClient) => {
  const app = express()
  app.use(express.json())

  // 健康检查
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

  // 账户路由（简化版本用于集成测试）
  app.get('/api/accounts', async (_req, res) => {
    try {
      const accounts = await prisma.account.findMany({
        include: { category: true },
        orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
      })
      res.json({ success: true, data: accounts, timestamp: new Date().toISOString() })
    } catch (error) {
      res.status(500).json({ success: false, error: { code: 'ERROR', message: String(error) }, timestamp: new Date().toISOString() })
    }
  })

  app.get('/api/accounts/:id', async (req, res) => {
    try {
      const account = await prisma.account.findUnique({
        where: { id: req.params.id },
        include: { category: true },
      })
      if (!account) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '账户不存在' }, timestamp: new Date().toISOString() })
      }
      res.json({ success: true, data: account, timestamp: new Date().toISOString() })
    } catch (error) {
      res.status(500).json({ success: false, error: { code: 'ERROR', message: String(error) }, timestamp: new Date().toISOString() })
    }
  })

  app.post('/api/accounts', async (req, res) => {
    try {
      const { name, type, initialBalance, icon, categoryId } = req.body
      const account = await prisma.account.create({
        data: {
          name,
          type,
          initialBalance: initialBalance ?? 0,
          icon: icon ?? null,
          categoryId: categoryId ?? null,
        },
        include: { category: true },
      })
      res.status(201).json({ success: true, data: account, timestamp: new Date().toISOString() })
    } catch (error) {
      res.status(500).json({ success: false, error: { code: 'ERROR', message: String(error) }, timestamp: new Date().toISOString() })
    }
  })

  app.put('/api/accounts/:id', async (req, res) => {
    try {
      const account = await prisma.account.update({
        where: { id: req.params.id },
        data: req.body,
        include: { category: true },
      })
      res.json({ success: true, data: account, timestamp: new Date().toISOString() })
    } catch (error: any) {
      if (error.code === 'P2025') {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '账户不存在' }, timestamp: new Date().toISOString() })
      }
      res.status(500).json({ success: false, error: { code: 'ERROR', message: String(error) }, timestamp: new Date().toISOString() })
    }
  })

  app.delete('/api/accounts/:id', async (req, res) => {
    try {
      const { force } = req.query
      const transactionsCount = await prisma.transaction.count({ where: { accountId: req.params.id } })

      if (transactionsCount > 0 && force !== 'true') {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: `该账户下存在 ${transactionsCount} 条交易记录，无法删除` },
          timestamp: new Date().toISOString()
        })
      }

      await prisma.$transaction([
        prisma.transaction.deleteMany({ where: { accountId: req.params.id } }),
        prisma.account.delete({ where: { id: req.params.id } }),
      ])
      res.json({ success: true, data: { message: '删除成功', deletedTransactions: transactionsCount }, timestamp: new Date().toISOString() })
    } catch (error: any) {
      if (error.code === 'P2025') {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '账户不存在' }, timestamp: new Date().toISOString() })
      }
      res.status(500).json({ success: false, error: { code: 'ERROR', message: String(error) }, timestamp: new Date().toISOString() })
    }
  })

  return app
}

describe('Account API Integration Tests', () => {
  let app: express.Application
  let prisma: PrismaClient

  beforeAll(async () => {
    // 创建 PrismaClient 连接测试数据库
    prisma = new PrismaClient({
      datasources: { db: { url: testDbUrl } },
    })

    // 尝试连接数据库，如果失败则跳过集成测试
    try {
      await prisma.$connect()
      // 完整清理数据库（包含可能来自其他测试文件的数据）
      await prisma.investmentAllocationItem.deleteMany().catch(() => {})
      await prisma.investmentAllocationSnapshot.deleteMany().catch(() => {})
      await prisma.investmentAssetClass.deleteMany().catch(() => {})
      await prisma.budget.deleteMany().catch(() => {})
      await prisma.transaction.deleteMany().catch(() => {})
      await prisma.account.deleteMany().catch(() => {})
      await prisma.accountCategory.deleteMany().catch(() => {})

      // 创建测试分类
      await prisma.accountCategory.createMany({
        data: [
          { id: 'cat-cash', name: '现金', type: 'asset', sort: 0 },
          { id: 'cat-liability', name: '负债', type: 'liability', sort: 1 },
        ],
      }).catch(() => {})
    } catch (error) {
      console.warn('测试数据库连接失败，跳过集成测试:', error)
    }

    app = createTestApp(prisma)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    // 每个测试前清理账户和交易
    try {
      await prisma.transaction.deleteMany()
      await prisma.account.deleteMany()
    } catch (error) {
      // 忽略清理错误
    }
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
        data: { name: '测试账户', type: 'asset', initialBalance: 1000 },
      })

      const response = await request(app).get('/api/accounts')

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.length).toBeGreaterThan(0)
      expect(response.body.data[0]).toHaveProperty('name', '测试账户')
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
      expect(Number(response.body.data.initialBalance)).toBe(5000)
    })

    it('应该使用默认余额 0', async () => {
      const response = await request(app)
        .post('/api/accounts')
        .send({ name: '无余额账户', type: 'asset' })

      expect(response.status).toBe(201)
      expect(Number(response.body.data.initialBalance)).toBe(0)
    })
  })

  describe('GET /api/accounts/:id', () => {
    it('应该返回账户详情', async () => {
      const account = await prisma.account.create({
        data: { name: '详情账户', type: 'asset', initialBalance: 2000 },
      })

      const response = await request(app).get(`/api/accounts/${account.id}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.name).toBe('详情账户')
    })

    it('不存在的账户应该返回 404', async () => {
      const response = await request(app).get('/api/accounts/non-existent-id')

      expect(response.status).toBe(404)
      expect(response.body.success).toBe(false)
      expect(response.body.error.code).toBe('NOT_FOUND')
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
