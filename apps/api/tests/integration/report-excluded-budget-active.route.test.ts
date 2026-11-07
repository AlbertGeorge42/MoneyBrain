/**
 * 报表口径与预算启停的真实路由回归
 *
 * ① /reports/income-expense 的 includeExcluded 必须真实改变金额：同一期间、
 *    同一条「不计收支」流水，关闭时不计入、开启时分入，两组数字可区分。
 * ② Budget.isActive 通过 PUT /budgets/:id 持久化，并在 GET /budgets 中回读；
 *    停用后不再出现在只取启用预算的列表里。
 *
 * 说明：集成测试共用 prisma/test.db，本文件只清自己的数据（预算 → 流水 → 账户 → 分类），
 * 不整体清表，避免把后续测试文件的固定分类 / 账户一起删掉。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testDbPath = path.resolve(__dirname, '../../prisma/test.db')

process.env.DATABASE_URL = `file:${testDbPath}`

const { default: app } = await import('../../src/index.js')
const { prisma } = await import('../../src/prisma.js')

const START = '2026-11-01'
const END = '2026-11-30'
const CATEGORY_ID = 'report-excluded-cat'
const CATEGORY_NAME = '不计收支口径测试'

describe('报表「计入不计收支」与预算启停', () => {
  let accountId = ''
  let categoryId = ''
  const budgetIds = new Set<string>()

  beforeAll(async () => {
    await prisma.$connect()
    await prisma.transactionCategory
      .createMany({ data: [{ id: CATEGORY_ID, name: CATEGORY_NAME, type: 'expense', sort: 0 }] })
      .catch(() => {})
    categoryId = CATEGORY_ID
    const account = await prisma.account.create({
      data: {
        name: '口径测试账户',
        type: 'asset',
        initialBalance: 1_000_000,
        initialBalanceDate: new Date('2026-01-01T00:00:00'),
      },
    })
    accountId = account.id
  })

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { accountId } })
    await prisma.budget.deleteMany({ where: { id: { in: [...budgetIds] } } })
    await prisma.account.deleteMany({ where: { id: accountId } })
    await prisma.transactionCategory.deleteMany({ where: { id: CATEGORY_ID } })
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    // 报表断言要的是本文件构造的两笔流水；先清掉其它测试文件残留的流水与预算。
    await prisma.budget.deleteMany()
    await prisma.transaction.deleteMany()
  })

  it('includeExcluded 关闭 / 开启得到两组不同金额', async () => {
    await prisma.transaction.create({
      data: {
        type: 'expense',
        ruleVersion: 1,
        amount: BigInt(10_000),
        date: new Date('2026-11-02T00:00:00'),
        accountId,
        categoryId,
      },
    })
    await prisma.transaction.create({
      data: {
        type: 'expense',
        ruleVersion: 1,
        amount: BigInt(20_000),
        date: new Date('2026-11-03T00:00:00'),
        accountId,
        categoryId,
        excludeFromIncomeExpense: true,
      },
    })

    const excluded = await request(app)
      .get('/api/reports/income-expense')
      .query({ startDate: START, endDate: END, includeExcluded: 'false' })
    const included = await request(app)
      .get('/api/reports/income-expense')
      .query({ startDate: START, endDate: END, includeExcluded: 'true' })

    expect(excluded.status).toBe(200)
    expect(included.status).toBe(200)
    expect(Math.abs(excluded.body.data.expense.actual)).toBe(10_000)
    expect(Math.abs(included.body.data.expense.actual)).toBe(30_000)
    expect(Math.abs(included.body.data.expense.actual)).toBeGreaterThan(
      Math.abs(excluded.body.data.expense.actual),
    )
  })

  it('PUT /budgets/:id 持久化 isActive，GET 可按启用状态过滤', async () => {
    const budget = await prisma.budget.create({
      data: {
        name: '启停测试预算',
        type: 'expense',
        amount: BigInt(100_000),
        period: 'monthly',
        startDate: new Date('2026-11-01T00:00:00'),
        accountId,
        categoryId,
      },
    })
    budgetIds.add(budget.id)

    const updated = await request(app)
      .put(`/api/budgets/${budget.id}`)
      .send({
        name: '启停测试预算',
        amount: 100_000,
        type: 'expense',
        period: 'monthly',
        startDate: '2026-11-01',
        accountId,
        categoryId,
        isActive: false,
      })

    expect(updated.status).toBe(200)
    expect(updated.body.data.isActive).toBe(false)

    const all = await request(app).get('/api/budgets')
    expect(all.body.data.find((item: { id: string }) => item.id === budget.id)?.isActive).toBe(false)

    const activeOnly = await request(app).get('/api/budgets').query({ isActive: 'true' })
    expect(activeOnly.body.data.some((item: { id: string }) => item.id === budget.id)).toBe(false)
  })
})
