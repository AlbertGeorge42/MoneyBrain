import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testDbPath = path.resolve(__dirname, '../../prisma/test.db')

// 必须在导入 src/prisma.ts 之前指向测试库
process.env.DATABASE_URL = `file:${testDbPath}`

const { prisma } = await import('../../src/prisma.js')
const { clearSelectedDataForImport } = await import('../../src/services/clear-data.service.js')

// A0 验收：清库覆盖正常 / 边界 / 空数据三个场景。
// 清库按外键依赖顺序删除（子表先于父表），范围之间严格隔离，范围外数据不得误删。

/** 清空全部业务表，保证用例相互独立。 */
async function truncateAll(): Promise<void> {
  await prisma.auditEvent.deleteMany()
  await prisma.transaction.deleteMany()
  await prisma.investmentAllocationItem.deleteMany()
  await prisma.investmentAllocationSnapshot.deleteMany()
  await prisma.budget.deleteMany()
  await prisma.investmentAssetClass.deleteMany()
  await prisma.account.deleteMany()
  await prisma.accountCategory.deleteMany()
  await prisma.transactionCategory.deleteMany()
}

/** 造一套覆盖所有表、带外键链的数据。 */
async function seedFullDataset(): Promise<void> {
  const parentCategory = await prisma.accountCategory.create({
    data: { id: 'a0-parent', name: '资产', type: 'asset', sort: 0 },
  })
  await prisma.accountCategory.create({
    data: { id: 'a0-child', name: '投资', type: 'asset', parentId: parentCategory.id, sort: 0 },
  })
  const account = await prisma.account.create({
    data: { id: 'a0-account', name: 'A0账户', type: 'asset', initialBalance: 100000, categoryId: 'a0-child' },
  })
  const txCategory = await prisma.transactionCategory.create({
    data: { id: 'a0-txcat', name: 'A0餐饮', type: 'expense', sort: 0 },
  })
  await prisma.transaction.createMany({
    data: [
      {
        id: 'a0-tx-income',
        type: 'income',
        ruleVersion: 1,
        amount: BigInt(50000),
        fee: BigInt(0),
        coupon: BigInt(0),
        date: new Date('2026-10-01'),
        accountId: account.id,
        categoryId: txCategory.id,
        excludeFromIncomeExpense: false,
      },
      {
        id: 'a0-tx-transfer',
        type: 'transfer',
        ruleVersion: 1,
        amount: BigInt(20000),
        fee: BigInt(100),
        coupon: BigInt(0),
        date: new Date('2026-10-02'),
        accountId: account.id,
        toAccountId: account.id,
        excludeFromIncomeExpense: false,
      },
    ],
  })
  await prisma.budget.create({
    data: {
      id: 'a0-budget',
      name: 'A0预算',
      type: 'expense',
      period: 'monthly',
      account: { connect: { id: account.id } },
      category: { connect: { id: txCategory.id } },
      amount: BigInt(30000),
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-31'),
    },
  })
  const assetClass = await prisma.investmentAssetClass.create({
    data: { id: 'a0-asset-class', account: { connect: { id: account.id } }, name: '股票', sort: 0 },
  })
  const snapshot = await prisma.investmentAllocationSnapshot.create({
    data: {
      id: 'a0-snapshot',
      account: { connect: { id: account.id } },
      date: new Date('2026-10-31'),
      accountBalance: BigInt(1000),
    },
  })
  await prisma.investmentAllocationItem.create({
    data: {
      id: 'a0-item',
      snapshot: { connect: { id: snapshot.id } },
      assetClass: { connect: { id: assetClass.id } },
      marketValue: BigInt(1000),
    },
  })
}

const countOfAll = async () => ({
  transactions: await prisma.transaction.count(),
  snapshots: await prisma.investmentAllocationSnapshot.count(),
  items: await prisma.investmentAllocationItem.count(),
  budgets: await prisma.budget.count(),
  assetClasses: await prisma.investmentAssetClass.count(),
  accounts: await prisma.account.count(),
  accountCategories: await prisma.accountCategory.count(),
  transactionCategories: await prisma.transactionCategory.count(),
})

const clear = (includes: string[]) =>
  prisma.$transaction((tx) => clearSelectedDataForImport(tx, includes as never))

describe('清库（A0：正常 / 边界 / 空数据）', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await truncateAll()
  })

  it('正常：全范围清库后所有业务表为空（外键顺序正确，无残留）', async () => {
    await seedFullDataset()
    const before = await countOfAll()
    expect(before.transactions).toBe(2)
    expect(before.accounts).toBe(1)

    await clear(['transactions', 'snapshots', 'budgets', 'config'])

    const after = await countOfAll()
    expect(after).toEqual({
      transactions: 0,
      snapshots: 0,
      items: 0,
      budgets: 0,
      assetClasses: 0,
      accounts: 0,
      accountCategories: 0,
      transactionCategories: 0,
    })
  })

  it('边界：只清交易，配置 / 预算 / 快照留存，不误删范围外数据', async () => {
    await seedFullDataset()

    await clear(['transactions'])

    const after = await countOfAll()
    expect(after.transactions).toBe(0)
    expect(after.budgets).toBe(1)
    expect(after.snapshots).toBe(1)
    expect(after.items).toBe(1)
    expect(after.assetClasses).toBe(1)
    expect(after.accounts).toBe(1)
    expect(after.accountCategories).toBe(2)
    expect(after.transactionCategories).toBe(1)
  })

  it('边界：覆盖配置但仍有未纳入范围的交易 → 拒绝并保留数据', async () => {
    await seedFullDataset()

    await expect(clear(['config'])).rejects.toThrow(/覆盖配置/)

    const after = await countOfAll()
    expect(after.transactions).toBe(2)
    expect(after.accounts).toBe(1)
  })

  it('空数据：空库清库不炸，可重复执行（幂等）', async () => {
    await clear(['transactions'])
    await clear(['transactions', 'snapshots', 'budgets', 'config'])

    const after = await countOfAll()
    expect(Object.values(after).every((count) => count === 0)).toBe(true)
  })
})
