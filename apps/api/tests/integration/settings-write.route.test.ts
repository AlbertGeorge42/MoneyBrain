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

const today = () => new Date().toISOString().split('T')[0]
const accountCategoryId = 's-cat-asset'
const foodId = 's-txcat-food'
const shopId = 's-txcat-shop'
const moveRootId = 's-txcat-root'
const moveChildId = 's-txcat-child'

describe('设置页账户 / 分类真实读写', () => {
  beforeAll(async () => {
    await prisma.$connect()
    await prisma.accountCategory
      .createMany({
        data: [{ id: accountCategoryId, name: '设置页现金', type: 'asset', sort: 0 }],
      })
      .catch(() => {})
    await prisma.transactionCategory
      .createMany({
        data: [
          { id: foodId, name: '设置页餐饮', type: 'expense', sort: 0 },
          { id: shopId, name: '设置页购物', type: 'expense', sort: 1 },
          { id: moveRootId, name: '设置页一级', type: 'expense', sort: 2 },
          { id: moveChildId, name: '设置页二级', type: 'expense', sort: 3 },
        ],
      })
      .catch(() => {})
    // 清掉上一轮遗留：接口新建的「临时分类」与移动过的二级分类父级。
    await prisma.transactionCategory.deleteMany({ where: { name: '临时分类' } })
    await prisma.transactionCategory.updateMany({
      where: { id: moveChildId },
      data: { parentId: null },
    })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.budget.deleteMany()
    await prisma.auditEvent.deleteMany()
    await prisma.transaction.deleteMany()
    await prisma.account.deleteMany()
    await prisma.transactionCategory.deleteMany({
      where: { id: { in: ['s-cat-budget-only', 's-cat-budget-tx'] } },
    })
  })

  it('账户排序落库：sort/batch 后 GET 顺序一致', async () => {
    const first = await prisma.account.create({
      data: {
        name: '排序A',
        type: 'asset',
        initialBalance: 0,
        categoryId: accountCategoryId,
        sort: 0,
      },
    })
    const second = await prisma.account.create({
      data: {
        name: '排序B',
        type: 'asset',
        initialBalance: 0,
        categoryId: accountCategoryId,
        sort: 1,
      },
    })

    const sort = await request(app)
      .put('/api/accounts/sort/batch')
      .send({
        items: [
          { id: second.id, sort: 0, categoryId: accountCategoryId },
          { id: first.id, sort: 1, categoryId: accountCategoryId },
        ],
      })
    expect(sort.status).toBe(200)

    const list = await request(app).get('/api/accounts')
    expect(list.body.data.map((account: { id: string }) => account.id)).toEqual([
      second.id,
      first.id,
    ])
  })

  it('账户删除返回 auditEventId；撤销后回收站清空、账户复原', async () => {
    const account = await prisma.account.create({
      data: { name: '待撤销账户', type: 'asset', initialBalance: 0, categoryId: accountCategoryId },
    })

    const del = await request(app).delete(`/api/accounts/${account.id}`)
    expect(del.status).toBe(200)
    expect(del.body.data.auditEventId).toBeTruthy()

    const bin = await request(app).get('/api/transactions/recycle-bin')
    expect(bin.body.data.accounts).toHaveLength(1)
    expect(bin.body.data.accounts[0]).toMatchObject({
      entity: 'account',
      entityId: account.id,
      name: '待撤销账户',
      canRestore: true,
    })

    const undo = await request(app).post(
      `/api/audit-events/${del.body.data.auditEventId}/undo`,
    )
    expect(undo.status).toBe(200)
    expect(await prisma.account.findUnique({ where: { id: account.id } })).not.toBeNull()

    const after = await request(app).get('/api/transactions/recycle-bin')
    expect(after.body.data.accounts).toHaveLength(0)
  })

  it('账户有交易时删除被拒，原因可读', async () => {
    const account = await prisma.account.create({
      data: { name: '有交易账户', type: 'asset', initialBalance: 0, categoryId: accountCategoryId },
    })
    await prisma.transaction.create({
      data: { type: 'expense', amount: 100, accountId: account.id, categoryId: foodId, date: new Date() },
    })

    const del = await request(app).delete(`/api/accounts/${account.id}`)
    expect(del.status).toBe(400)
    expect(del.body.error.message).toContain('交易')
  })

  it('分类删除返回 auditEventId；回收站列表与恢复可用', async () => {
    const created = await request(app)
      .post('/api/transaction-categories')
      .send({ name: '临时分类', type: 'expense' })
    expect(created.status).toBe(201)
    const categoryId = created.body.data.id

    const del = await request(app).delete(`/api/transaction-categories/${categoryId}`)
    expect(del.status).toBe(200)
    expect(del.body.data.auditEventId).toBeTruthy()

    const bin = await request(app).get('/api/transactions/recycle-bin')
    const item = bin.body.data.categories.find(
      (category: { entityId: string }) => category.entityId === categoryId,
    )
    expect(item).toBeTruthy()
    expect(item.name).toBe('临时分类')

    const undo = await request(app).post(`/api/audit-events/${del.body.data.auditEventId}/undo`)
    expect(undo.status).toBe(200)
    const restored = await prisma.transactionCategory.findUnique({ where: { id: categoryId } })
    expect(restored?.name).toBe('临时分类')
  })

  it('分类带交易时转移后删除；撤销恢复分类与原归属', async () => {
    const account = await prisma.account.create({
      data: { name: '转移账户', type: 'asset', initialBalance: 0, categoryId: accountCategoryId },
    })
    await prisma.transactionCategory.deleteMany({ where: { id: 's-txcat-tmp' } })
    const source = await prisma.transactionCategory.create({
      data: { id: 's-txcat-tmp', name: '待转移分类', type: 'expense', sort: 20 },
    })
    const tx = await prisma.transaction.create({
      data: { type: 'expense', amount: 500, accountId: account.id, categoryId: source.id, date: new Date() },
    })

    const del = await request(app)
      .delete(`/api/transaction-categories/${source.id}`)
      .query({ transferToCategoryId: foodId })
    expect(del.status).toBe(200)
    expect(del.body.data.auditEventId).toBeTruthy()
    expect(del.body.data.transferredTransactions).toBe(1)

    const moved = await prisma.transaction.findUnique({ where: { id: tx.id } })
    expect(moved?.categoryId).toBe(foodId)

    const undo = await request(app).post(`/api/audit-events/${del.body.data.auditEventId}/undo`)
    expect(undo.status).toBe(200)
    const restoredCategory = await prisma.transactionCategory.findUnique({ where: { id: source.id } })
    expect(restoredCategory?.name).toBe('待转移分类')
    const back = await prisma.transaction.findUnique({ where: { id: tx.id } })
    expect(back?.categoryId).toBe(source.id)
  })

  it('分类带交易与预算：转移删除后交易和预算都归目标，撤销一起回位', async () => {
    const account = await prisma.account.create({
      data: { name: '预算转移账户', type: 'asset', initialBalance: 0, categoryId: accountCategoryId },
    })
    const source = await prisma.transactionCategory.create({
      data: { id: 's-cat-budget-tx', name: '预算转移分类', type: 'expense', sort: 30 },
    })
    const tx = await prisma.transaction.create({
      data: { type: 'expense', amount: 500, accountId: account.id, categoryId: source.id, date: new Date() },
    })
    const budget = await prisma.budget.create({
      data: {
        id: 's-budget-transfer',
        name: '预算转移预算',
        type: 'expense',
        amount: 1000,
        period: 'monthly',
        startDate: new Date('2026-11-01'),
        accountId: account.id,
        categoryId: source.id,
      },
    })

    const before = {
      transactionCount: await prisma.transaction.count(),
      transactionAmount: (await prisma.transaction.aggregate({ _sum: { amount: true } }))._sum.amount,
      budgetCount: await prisma.budget.count(),
      budgetAmount: (await prisma.budget.aggregate({ _sum: { amount: true } }))._sum.amount,
    }

    const del = await request(app)
      .delete(`/api/transaction-categories/${source.id}`)
      .query({ transferToCategoryId: foodId })
    expect(del.status).toBe(200)
    expect(del.body.data.transferredTransactions).toBe(1)
    expect(del.body.data.transferredBudgets).toBe(1)

    expect((await prisma.transaction.findUnique({ where: { id: tx.id } }))?.categoryId).toBe(foodId)
    expect((await prisma.budget.findUnique({ where: { id: budget.id } }))?.categoryId).toBe(foodId)
    const after = {
      transactionCount: await prisma.transaction.count(),
      transactionAmount: (await prisma.transaction.aggregate({ _sum: { amount: true } }))._sum.amount,
      budgetCount: await prisma.budget.count(),
      budgetAmount: (await prisma.budget.aggregate({ _sum: { amount: true } }))._sum.amount,
    }
    expect(after).toEqual(before)

    const undo = await request(app).post(`/api/audit-events/${del.body.data.auditEventId}/undo`)
    expect(undo.status).toBe(200)
    expect((await prisma.transactionCategory.findUnique({ where: { id: source.id } }))?.name).toBe(
      '预算转移分类',
    )
    expect((await prisma.transaction.findUnique({ where: { id: tx.id } }))?.categoryId).toBe(source.id)
  })

  it('分类只被预算引用且未选转移：拒绝文案精确，不再 FOREIGN_KEY_ERROR', async () => {
    const account = await prisma.account.create({
      data: { name: '预算账户', type: 'asset', initialBalance: 0, categoryId: accountCategoryId },
    })
    const source = await prisma.transactionCategory.create({
      data: { id: 's-cat-budget-only', name: '仅预算分类', type: 'expense', sort: 31 },
    })
    await prisma.budget.create({
      data: {
        id: 's-budget-only',
        name: '仅预算',
        type: 'expense',
        amount: 1000,
        period: 'monthly',
        startDate: new Date('2026-11-01'),
        accountId: account.id,
        categoryId: source.id,
      },
    })

    const del = await request(app).delete(`/api/transaction-categories/${source.id}`)
    expect(del.status).toBe(400)
    expect(del.body.error.message).toContain('1 个预算')
    expect(del.body.error.message).toContain('转移')
    expect(del.body.error.message).not.toContain('FOREIGN_KEY')
    expect(await prisma.transactionCategory.findUnique({ where: { id: source.id } })).not.toBeNull()
  })

  it('父子移动落库：move 后 parentId 改变', async () => {
    const moved = await request(app)
      .put(`/api/transaction-categories/${moveChildId}/move`)
      .send({ newParentId: moveRootId })
    expect(moved.status).toBe(200)

    const category = await prisma.transactionCategory.findUnique({ where: { id: moveChildId } })
    expect(category?.parentId).toBe(moveRootId)
  })

  it('账户余额口径：改期初后 balance-at 与目标一致', async () => {
    const account = await prisma.account.create({
      data: { name: '余额账户', type: 'asset', initialBalance: 1000, categoryId: accountCategoryId },
    })
    // 设置页「当前余额」编辑 = 期初差额修正
    const updated = await request(app)
      .put(`/api/accounts/${account.id}`)
      .send({ initialBalance: 3000 })
    expect(updated.status).toBe(200)

    const balance = await request(app)
      .get(`/api/accounts/${account.id}/balance-at`)
      .query({ date: today() })
    expect(balance.body.data.balance).toBe(3000)
  })
})
