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

// 关键词口径：只搜备注 / 账户 / 分类 / 方向，不搜金额文本。
// 与 web 种子版 `filterTransactions` 保持一致，避免同一关键词两侧结果不同。

const categoryId = 'kw-txcat-expense'
const accountCategoryId = 'kw-cat-asset'
let accountId: string

const list = (query: string) => request(app).get('/api/transactions').query(query)

describe('关键词口径（GET /transactions）', () => {
  beforeAll(async () => {
    await prisma.$connect()
    await prisma.accountCategory
      .createMany({
        data: [{ id: accountCategoryId, name: 'KW现金', type: 'asset', sort: 0 }],
      })
      .catch(() => {})
    await prisma.transactionCategory
      .createMany({
        data: [{ id: categoryId, name: 'KW餐饮', type: 'expense', sort: 0 }],
      })
      .catch(() => {})
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.transaction.deleteMany()
    await prisma.account.deleteMany()
    const account = await prisma.account.create({
      data: {
        name: 'KW招商储蓄卡',
        type: 'asset',
        initialBalance: 0,
        categoryId: accountCategoryId,
      },
    })
    accountId = account.id
  })

  it('金额文本不命中，文本字段与金额区间各自生效', async () => {
    const created = await request(app).post('/api/transactions').send({
      type: 'expense',
      amount: 32_800,
      date: '2026-10-05',
      accountId,
      categoryId,
      note: '午餐',
    })
    expect(created.status).toBe(201)
    const txId = created.body.data.id

    // 金额文本：0 条（种子版同口径断言见 web 单测）
    const byAmount = await list('keyword=328')
    expect(byAmount.status).toBe(200)
    expect(byAmount.body.data.total).toBe(0)
    expect(byAmount.body.data.list).toHaveLength(0)
    expect((await list('keyword=328.00')).body.data.total).toBe(0)

    // 文本：备注 / 账户 / 分类 / 方向
    for (const keyword of ['午餐', 'KW招商', 'KW餐饮', '支出']) {
      const matched = await list(`keyword=${encodeURIComponent(keyword)}`)
      expect(matched.body.data.total).toBe(1)
      expect(matched.body.data.list.map((item: { id: string }) => item.id)).toEqual([txId])
    }

    // 金额有独立区间筛选
    const byRange = await list('amountMin=32800&amountMax=32800')
    expect(byRange.body.data.total).toBe(1)
    expect(byRange.body.data.list[0].id).toBe(txId)
  })
})
