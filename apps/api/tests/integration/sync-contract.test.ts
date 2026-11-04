import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import path from 'path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testDbPath = path.resolve(__dirname, '../../prisma/test.db')

// 必须在导入 src/prisma.ts 之前指向测试库
process.env.DATABASE_URL = `file:${testDbPath}`

const { default: app } = await import('../../src/index.js')
const { prisma } = await import('../../src/prisma.js')
const { getSyncIdentity } = await import('../../src/db/sync-identity.js')
const { parseVersionVector } = await import('../../src/db/sync-version.js')

// F-A：客户端 UUID 身份 + rev/vv 版本戳 + 删除墓碑（端到端）。
// 验收口径：断网创建后补写库不换 ID；同一 ID 导入不重复；每次写入 rev 递增、vv 更新；
// 删除产生墓碑；设备身份稳定。

const today = () => new Date().toISOString().split('T')[0]
const uuid = () => randomUUID()

let deviceId: string
let accountId: string
let expenseCategoryId: string

const readVersion = async (id: string, model: 'transaction' | 'account' | 'budget') => {
  const row =
    model === 'transaction'
      ? await prisma.transaction.findUnique({ where: { id }, select: { rev: true, vv: true, deletedAt: true } })
      : model === 'account'
        ? await prisma.account.findUnique({ where: { id }, select: { rev: true, vv: true } })
        : await prisma.budget.findUnique({ where: { id }, select: { rev: true, vv: true } })
  if (!row) throw new Error(`${model} ${id} 不存在`)
  return { ...row, vector: parseVersionVector(row.vv) }
}

describe('F-A 同步身份 / 版本戳 / 墓碑', () => {
  beforeAll(async () => {
    await prisma.$connect()
    deviceId = (await getSyncIdentity()).deviceId
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany()
    await prisma.investmentAllocationItem.deleteMany()
    await prisma.investmentAllocationSnapshot.deleteMany()
    await prisma.investmentAssetClass.deleteMany()
    await prisma.budget.deleteMany()
    await prisma.transaction.deleteMany()
    await prisma.account.deleteMany()
    await prisma.transactionCategory.deleteMany()
    await prisma.accountCategory.deleteMany()

    await prisma.accountCategory.create({
      data: { id: 'sync-cat-asset', name: '同步现金', type: 'asset', sort: 0 },
    })
    const expenseCategory = await prisma.transactionCategory.create({
      data: { id: 'sync-cat-expense', name: '同步餐饮', type: 'expense', sort: 0 },
    })
    expenseCategoryId = expenseCategory.id
    const account = await prisma.account.create({
      data: { name: '同步测试账户', type: 'asset', initialBalance: 0, categoryId: 'sync-cat-asset' },
    })
    accountId = account.id
  })

  it('六个可同步实体的创建入口保留客户端 UUID', async () => {
    const accountCategoryId = uuid()
    const accountCategory = await request(app)
      .post('/api/account-categories')
      .send({ id: accountCategoryId, name: '同步账户分类', type: 'asset' })
    expect(accountCategory.status).toBe(201)
    expect(accountCategory.body.data.id).toBe(accountCategoryId)

    const transactionCategoryId = uuid()
    const transactionCategory = await request(app)
      .post('/api/transaction-categories')
      .send({ id: transactionCategoryId, name: '同步收支分类', type: 'expense' })
    expect(transactionCategory.status).toBe(201)
    expect(transactionCategory.body.data.id).toBe(transactionCategoryId)

    const clientAccountId = uuid()
    const account = await request(app)
      .post('/api/accounts')
      .send({ id: clientAccountId, name: '断网创建的账户', type: 'asset' })
    expect(account.status).toBe(201)
    expect(account.body.data.id).toBe(clientAccountId)

    const transactionId = uuid()
    const transaction = await request(app)
      .post('/api/transactions')
      .send({
        id: transactionId,
        type: 'expense',
        amount: 1000,
        date: today(),
        accountId: clientAccountId,
        categoryId: expenseCategoryId,
      })
    expect(transaction.status).toBe(201)
    expect(transaction.body.data.id).toBe(transactionId)

    const budgetId = uuid()
    const budget = await request(app)
      .post('/api/budgets')
      .send({
        id: budgetId,
        name: '断网创建的预算',
        amount: 100000,
        type: 'expense',
        period: 'monthly',
        accountId: clientAccountId,
        categoryId: expenseCategoryId,
      })
    expect(budget.status).toBe(201)
    expect(budget.body.data.id).toBe(budgetId)
  })

  it('同一客户端 ID 重复写入不产生第二行', async () => {
    const clientAccountId = uuid()
    const payload = { id: clientAccountId, name: '幂等账户', type: 'asset' }
    const first = await request(app).post('/api/accounts').send(payload)
    const second = await request(app).post('/api/accounts').send(payload)
    expect(first.status).toBe(201)
    expect(second.body.data.id).toBe(clientAccountId)
    expect(await prisma.account.count({ where: { id: clientAccountId } })).toBe(1)

    const transactionId = uuid()
    const txPayload = {
      id: transactionId,
      type: 'expense',
      amount: 500,
      date: today(),
      accountId,
      categoryId: expenseCategoryId,
    }
    await request(app).post('/api/transactions').send(txPayload)
    await request(app).post('/api/transactions').send(txPayload)
    expect(await prisma.transaction.count({ where: { id: transactionId } })).toBe(1)
  })

  it('每次写入 rev 递增、vv 推进本设备维度', async () => {
    const transactionId = uuid()
    await request(app)
      .post('/api/transactions')
      .send({
        id: transactionId,
        type: 'expense',
        amount: 1000,
        date: today(),
        accountId,
        categoryId: expenseCategoryId,
      })

    const created = await readVersion(transactionId, 'transaction')
    expect(created.rev).toBe(1)
    expect(created.vector[deviceId]).toBe(1)

    const updated = await request(app)
      .put(`/api/transactions/${transactionId}`)
      .send({ amount: 2000 })
    expect(updated.status).toBe(200)

    const afterUpdate = await readVersion(transactionId, 'transaction')
    expect(afterUpdate.rev).toBe(2)
    expect(afterUpdate.vector[deviceId]).toBe(2)

    const accountIdForUpdate = uuid()
    await request(app)
      .post('/api/accounts')
      .send({ id: accountIdForUpdate, name: '版本账户', type: 'asset' })
    await request(app)
      .put(`/api/accounts/${accountIdForUpdate}`)
      .send({ name: '版本账户改名' })
    const accountVersion = await readVersion(accountIdForUpdate, 'account')
    expect(accountVersion.rev).toBe(2)
    expect(accountVersion.vector[deviceId]).toBe(2)
  })

  it('删除交易产生墓碑（deletedAt）并推进版本', async () => {
    const transactionId = uuid()
    await request(app)
      .post('/api/transactions')
      .send({
        id: transactionId,
        type: 'expense',
        amount: 1000,
        date: today(),
        accountId,
        categoryId: expenseCategoryId,
      })

    const deleted = await request(app).delete(`/api/transactions/${transactionId}`)
    expect(deleted.status).toBe(200)

    const tombstone = await readVersion(transactionId, 'transaction')
    expect(tombstone.deletedAt).not.toBeNull()
    expect(tombstone.rev).toBe(2)
    expect(tombstone.vector[deviceId]).toBe(2)
  })

  it('非法客户端 ID 被拒绝，避免同一记录出现两个身份', async () => {
    const response = await request(app)
      .post('/api/accounts')
      .send({ id: 'not-a-uuid', name: '非法 ID 账户', type: 'asset' })
    expect(response.status).toBe(400)
    expect(response.body.error.message).toMatch(/UUID/)
  })

  it('设备身份在多次读取间保持稳定', async () => {
    const again = await getSyncIdentity()
    expect(again.deviceId).toBe(deviceId)
  })
})
