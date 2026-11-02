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

// B2：软删除 + 审计事件 + 撤销 + 回收站 的端到端场景。
// 验收口径：删除 → 回收站可见 → 恢复 → 余额复原；删除 → 撤销 → 余额复原。

const today = () => new Date().toISOString().split('T')[0]
const farFuture = '2099-12-31'

let accountId: string
const categoryId = 'b2-txcat-expense'

const balanceAt = () =>
  request(app).get(`/api/accounts/${accountId}/balance-at`).query({ date: farFuture })

const createExpense = (amount: number, note: string) =>
  request(app)
    .post('/api/transactions')
    .send({ type: 'expense', amount, date: today(), accountId, categoryId, note })

const createIncome = (amount: number, note: string) =>
  request(app)
    .post('/api/transactions')
    .send({ type: 'income', amount, date: today(), accountId, categoryId, note })

describe('B2 软删除 / 审计事件 / 撤销 / 回收站', () => {
  beforeAll(async () => {
    await prisma.$connect()
    await prisma.accountCategory
      .createMany({ data: [{ id: 'b2-cat-asset', name: 'B2现金', type: 'asset', sort: 0 }] })
      .catch(() => {})
    await prisma.transactionCategory
      .createMany({ data: [{ id: categoryId, name: 'B2餐饮', type: 'expense', sort: 0 }] })
      .catch(() => {})
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany()
    await prisma.transaction.deleteMany()
    await prisma.account.deleteMany()
    const account = await prisma.account.create({
      data: { name: 'B2测试账户', type: 'asset', initialBalance: 0, categoryId: 'b2-cat-asset' },
    })
    accountId = account.id
  })

  it('场景一：删除 → 回收站可见 → 恢复 → 余额复原', async () => {
    const created = await createExpense(10000, '回收站场景')
    expect(created.status).toBe(201)
    const txId = created.body.data.id
    expect((await balanceAt()).body.data.balance).toBe(-10000)

    const del = await request(app).delete(`/api/transactions/${txId}`)
    expect(del.status).toBe(200)
    expect(del.body.data.auditEventId).toBeTruthy()

    // 软删除后：余额复原、列表不可见、回收站可见
    expect((await balanceAt()).body.data.balance).toBe(0)
    const list = await request(app).get('/api/transactions')
    expect(list.body.data.total).toBe(0)
    const bin = await request(app).get('/api/transactions/recycle-bin')
    expect(bin.body.data.list).toHaveLength(1)
    expect(bin.body.data.list[0].transaction.id).toBe(txId)
    expect(bin.body.data.list[0].transaction.deletedAt).not.toBeNull()
    expect(bin.body.data.list[0].deleteEventId).toBeTruthy()

    // 恢复 = 撤销最近一条 deleted 事件（与提示条撤销同一条路径）
    const undo = await request(app).post(
      `/api/audit-events/${bin.body.data.list[0].deleteEventId}/undo`,
    )
    expect(undo.status).toBe(200)
    expect(undo.body.data.deletedAt).toBeNull()

    // 余额复原，回收站清空，历史可见删除与恢复事件
    expect((await balanceAt()).body.data.balance).toBe(-10000)
    const binAfter = await request(app).get('/api/transactions/recycle-bin')
    expect(binAfter.body.data.list).toHaveLength(0)

    const history = await request(app).get(`/api/transactions/${txId}/history`)
    const actions = history.body.data.list.map((event: { action: string }) => event.action)
    expect(actions).toContain('deleted')
    expect(actions).toContain('restored')
  })

  it('场景二：删除 → 提示条撤销 → 余额复原', async () => {
    const created = await createExpense(5000, '撤销场景')
    const txId = created.body.data.id

    const del = await request(app).delete(`/api/transactions/${txId}`)
    const { auditEventId } = del.body.data
    expect((await balanceAt()).body.data.balance).toBe(0)

    const undo = await request(app).post(`/api/audit-events/${auditEventId}/undo`)
    expect(undo.status).toBe(200)

    expect((await balanceAt()).body.data.balance).toBe(-5000)
    const list = await request(app).get('/api/transactions')
    expect(list.body.data.total).toBe(1)
  })

  it('存在退款的原交易禁止删除（校验保留，回收站里的退款也阻断）', async () => {
    const income = await createIncome(20000, '被退款的原交易')
    const originalId = income.body.data.id
    const refund = await request(app)
      .post('/api/transactions')
      .send({ type: 'refund', amount: 3000, date: today(), accountId, relatedTransactionId: originalId })
    expect(refund.status).toBe(201)

    const blocked = await request(app).delete(`/api/transactions/${originalId}`)
    expect(blocked.status).toBe(400)
    expect(blocked.body.error.message).toMatch(/退款/)

    // 退款被软删除（进回收站）后，原交易仍不可删：恢复退款时链必须还在
    const refundDel = await request(app).delete(`/api/transactions/${refund.body.data.id}`)
    expect(refundDel.status).toBe(200)
    const blockedAgain = await request(app).delete(`/api/transactions/${originalId}`)
    expect(blockedAgain.status).toBe(400)

    // 退款可软删除，删除后可退余额回到全额
    const refundable = await request(app).get('/api/transactions/refundable/list')
    const original = refundable.body.data.find(
      (tx: { id: string }) => tx.id === originalId,
    )
    expect(original).toBeTruthy()
    expect(original.refunds).toHaveLength(0)
  })

  it('导出与备份统计排除已删除交易', async () => {
    await createExpense(8800, '留下的交易')
    const doomed = await createExpense(1200, '删掉的交易')
    await request(app).delete(`/api/transactions/${doomed.body.data.id}`)

    const { exportTransactionsCSV } = await import(
      '../../src/services/export/transaction-export.service.js'
    )
    const csv = await exportTransactionsCSV()
    expect(csv).toContain('留下的交易')
    expect(csv).not.toContain('删掉的交易')

    const { createManifest } = await import('../../src/services/backup.service.js')
    const manifest = await createManifest(['transactions'])
    expect(manifest.stats.transactions).toBe(1)
  })

  it('修改写审计事件，撤销后回到旧值', async () => {
    const created = await createExpense(10000, '修改场景')
    const txId = created.body.data.id

    const upd = await request(app)
      .put(`/api/transactions/${txId}`)
      .send({ amount: 20000 })
    expect(upd.status).toBe(200)
    expect((await balanceAt()).body.data.balance).toBe(-20000)

    const history = await request(app).get(`/api/transactions/${txId}/history`)
    expect(history.body.data.list).toHaveLength(1)
    const event = history.body.data.list[0]
    expect(event.action).toBe('updated')
    const before = JSON.parse(event.beforeJson)
    const after = JSON.parse(event.afterJson)
    expect(before.amount).toBe('10000')
    expect(after.amount).toBe('20000')

    const undo = await request(app).post(`/api/audit-events/${event.id}/undo`)
    expect(undo.status).toBe(200)
    expect((await balanceAt()).body.data.balance).toBe(-10000)
  })
})
