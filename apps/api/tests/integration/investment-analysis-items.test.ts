/**
 * 投资分析持仓明细：byCategory[].accounts[].items 与 byCategory[].items。
 *
 * - 有持仓：账户明细带该账户的资产类型持仓；分类明细按资产类型合并各账户持仓；
 * - 无持仓（账户未配置资产类型 / 无快照）：返回空数组，而不是缺字段。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'

const { default: app } = await import('../../src/index.js')
const { prisma } = await import('../../src/prisma.js')

const HOLDING_CATEGORY_ID = 'items-holding-category'
const EMPTY_CATEGORY_ID = 'items-empty-category'
const HOLDING_ACCOUNT_ID = 'items-holding-account'
const CASH_ACCOUNT_ID = 'items-cash-account'
const EMPTY_ACCOUNT_ID = 'items-empty-account'

const PERIOD = { startDate: '2026-03-01', endDate: '2026-03-31' }

async function createAssetClass(accountId: string, name: string, targetRatio: number) {
  const response = await request(app)
    .post(`/api/investments/${accountId}/asset-classes`)
    .send({ name, targetRatio, sort: 0 })
  expect(response.status).toBe(200)
  return response.body.data.id as string
}

describe('投资分析：账户 / 分类持仓明细 items', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.investmentAllocationItem.deleteMany()
    await prisma.investmentAllocationSnapshot.deleteMany()
    await prisma.investmentAssetClass.deleteMany()
    await prisma.transaction.deleteMany()
    await prisma.auditEvent.deleteMany()
    await prisma.account.deleteMany()
    await prisma.accountCategory.deleteMany()
    await prisma.transactionCategory.deleteMany()

    await prisma.accountCategory.create({
      data: { id: HOLDING_CATEGORY_ID, name: '持仓分类', type: 'asset', sort: 0, isInvestment: true },
    })
    await prisma.accountCategory.create({
      data: { id: EMPTY_CATEGORY_ID, name: '空持仓分类', type: 'asset', sort: 0, isInvestment: true },
    })

    // 有持仓账户：余额 100000，快照 60000 股票 + 40000 债券（无未分类差额）
    await prisma.account.create({
      data: {
        id: HOLDING_ACCOUNT_ID,
        name: '有持仓账户',
        type: 'asset',
        initialBalance: 100000,
        categoryId: HOLDING_CATEGORY_ID,
      },
    })
    // 同分类下的无资产类型账户：再验证账户级 items 为空数组
    await prisma.account.create({
      data: {
        id: CASH_ACCOUNT_ID,
        name: '无资产类型账户',
        type: 'asset',
        initialBalance: 50000,
        categoryId: HOLDING_CATEGORY_ID,
      },
    })
    // 另一分类下的无资产类型账户：验证分类级 items 为空数组
    await prisma.account.create({
      data: {
        id: EMPTY_ACCOUNT_ID,
        name: '空分类账户',
        type: 'asset',
        initialBalance: 30000,
        categoryId: EMPTY_CATEGORY_ID,
      },
    })

    const stockId = await createAssetClass(HOLDING_ACCOUNT_ID, '股票', 60)
    const bondId = await createAssetClass(HOLDING_ACCOUNT_ID, '债券', 40)
    const snapshot = await request(app)
      .post('/api/investments/allocations')
      .send({
        accountId: HOLDING_ACCOUNT_ID,
        date: '2026-03-10',
        items: [
          { assetClassId: stockId, marketValue: 60000, periodNetFlow: 0 },
          { assetClassId: bondId, marketValue: 40000, periodNetFlow: 0 },
        ],
      })
    expect(snapshot.status).toBe(200)
  })

  async function fetchAnalysis() {
    const response = await request(app)
      .get('/api/reports/investment-analysis')
      .query(PERIOD)
    expect(response.status).toBe(200)
    return response.body.data
  }

  it('有持仓：账户明细与分类明细都带 items', async () => {
    const data = await fetchAnalysis()
    const category = data.byCategory.find(
      (item: { categoryId: string }) => item.categoryId === HOLDING_CATEGORY_ID,
    )
    expect(category).toBeTruthy()

    const holdingAccount = category.accounts.find(
      (account: { id: string }) => account.id === HOLDING_ACCOUNT_ID,
    )
    expect(holdingAccount.items).toHaveLength(2)
    expect(holdingAccount.items.map((item: { name: string }) => item.name)).toEqual(['股票', '债券'])
    expect(holdingAccount.items[0]).toMatchObject({
      name: '股票',
      marketValue: 60000,
      ratio: 60,
      targetRatio: 60,
      deviation: 0,
    })

    // 分类级：同分类下无持仓账户不贡献条目，只保留有持仓账户的资产类型
    expect(category.items).toHaveLength(2)
    expect(category.items.map((item: { name: string }) => item.name)).toEqual(['股票', '债券'])
    expect(category.items[0]).toMatchObject({ marketValue: 60000, ratio: 60, targetRatio: 60 })
  })

  it('无持仓：账户未配置资产类型时 items 为空数组（分类同理）', async () => {
    const data = await fetchAnalysis()

    const holdingCategory = data.byCategory.find(
      (item: { categoryId: string }) => item.categoryId === HOLDING_CATEGORY_ID,
    )
    const cashAccount = holdingCategory.accounts.find(
      (account: { id: string }) => account.id === CASH_ACCOUNT_ID,
    )
    expect(cashAccount.items).toEqual([])

    const emptyCategory = data.byCategory.find(
      (item: { categoryId: string }) => item.categoryId === EMPTY_CATEGORY_ID,
    )
    expect(emptyCategory.accounts[0].items).toEqual([])
    expect(emptyCategory.items).toEqual([])
  })
})
