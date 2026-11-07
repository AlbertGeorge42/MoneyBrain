import { describe, it, expect, beforeEach, afterEach } from 'vitest'

const { prisma } = await import('../../src/prisma.js')
const { clearSelectedDataForImport } = await import('../../src/services/clear-data.service.js')
const {
  createSnapshot,
  listSnapshotPoints,
  restoreSnapshot,
  deleteSnapshot,
} = await import('../../src/services/rollback.service.js')

/**
 * 回滚点测试跑在真实 SQLite 上（本次运行独占的临时库副本）——
 * VACUUM INTO 与 ATTACH 是 SQLite 的原生能力，mock 测不出真伪。
 */

const TABLES = [
  'transactions',
  'budgets',
  'accounts',
  'accountCategories',
  'transactionCategories',
  'investmentAssetClass',
  'investmentAllocationSnapshot',
  'investmentAllocationItem',
] as const

async function cleanAll() {
  await prisma.$transaction([
    prisma.investmentAllocationItem.deleteMany(),
    prisma.investmentAllocationSnapshot.deleteMany(),
    prisma.investmentAssetClass.deleteMany(),
    prisma.budget.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.account.deleteMany(),
    prisma.transactionCategory.deleteMany(),
    prisma.accountCategory.deleteMany(),
  ])
}

async function seed() {
  const category = await prisma.accountCategory.create({
    data: { name: '资产', type: 'asset', sort: 1 },
  })
  const account = await prisma.account.create({
    data: { name: '现金', type: 'asset', categoryId: category.id, initialBalance: 0n, sort: 1 },
  })
  const txCategory = await prisma.transactionCategory.create({
    data: { name: '餐饮', type: 'expense', sort: 1 },
  })
  await prisma.transaction.create({
    data: {
      type: 'expense',
      amount: 5000n,
      date: new Date('2026-01-15'),
      accountId: account.id,
      categoryId: txCategory.id,
      note: '午饭',
    },
  })
  await prisma.transaction.create({
    data: {
      type: 'expense',
      amount: 3000n,
      date: new Date('2026-01-16'),
      accountId: account.id,
      categoryId: txCategory.id,
      note: '咖啡',
    },
  })
  return { accountId: account.id, categoryId: category.id }
}

describe('rollback.service', () => {
  let createdIds: string[] = []

  beforeEach(async () => {
    await cleanAll()
    createdIds = []
  })

  afterEach(async () => {
    // 并行删除：保留上限的用例会一次建 7 个快照，
    // 逐个串行删会拖慢钩子。
    await Promise.all(createdIds.map((id) => deleteSnapshot(id).catch(() => {})))
    await cleanAll()
  }, 60000)

  it('创建的快照记录了当时的行数统计', async () => {
    await seed()
    const snapshot = await createSnapshot('覆盖导入前', ['transactions'])
    createdIds.push(snapshot.id)

    expect(snapshot.stats.transactions).toBe(2)
    expect(snapshot.stats.accounts).toBe(1)
    expect(snapshot.reason).toBe('覆盖导入前')
    expect(snapshot.includes).toEqual(['transactions'])
  })

  it('回滚后数据与快照时刻完全一致', async () => {
    await seed()
    const snapshot = await createSnapshot('覆盖导入前', ['transactions'])
    createdIds.push(snapshot.id)

    // 模拟「覆盖导入把数据搞坏了」
    await prisma.$transaction(async (tx) => {
      await tx.transaction.deleteMany()
      await tx.transaction.create({
        data: {
          type: 'expense',
          amount: 99999n,
          date: new Date('2026-02-01'),
          accountId: 'does-not-exist',
        },
      }).catch(() => {})
    })

    const result = await restoreSnapshot(snapshot.id)

    expect(result.stats.transactions).toBe(2)
    expect(await prisma.transaction.count()).toBe(2)
    const amounts = (await prisma.transaction.findMany({ orderBy: { date: 'asc' } })).map((t) => t.amount)
    expect(amounts.map(String)).toEqual(['5000', '3000'])
  })

  it('回滚能恢复被清空的账户与分类', async () => {
    const seeded = await seed()
    const snapshot = await createSnapshot('覆盖导入前', ['config', 'transactions'])
    createdIds.push(snapshot.id)

    await prisma.$transaction(async (tx) => {
      await clearSelectedDataForImport(tx, ['config', 'transactions'])
    })

    expect(await prisma.transaction.count()).toBe(0)
    expect(await prisma.account.count()).toBe(0)

    await restoreSnapshot(snapshot.id)

    expect(await prisma.transaction.count()).toBe(2)
    expect(await prisma.account.count()).toBe(1)
    expect((await prisma.account.findFirst())?.id).toBe(seeded.accountId)
  })

  it('列出的回滚点按创建时间倒序', async () => {
    await seed()
    const first = await createSnapshot('覆盖导入前', ['transactions'])
    const second = await createSnapshot('覆盖导入前', ['transactions'])
    createdIds.push(first.id, second.id)

    const points = await listSnapshotPoints()
    const ids = points.map((p) => p.id)
    expect(ids).toContain(first.id)
    expect(ids).toContain(second.id)
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id))
  })

  it('快照 ID 唯一——同一毫秒建两个不会互相覆盖', async () => {
    await seed()
    const first = await createSnapshot('覆盖导入前', ['transactions'])
    const second = await createSnapshot('覆盖导入前', ['transactions'])
    createdIds.push(first.id, second.id)

    expect(first.id).not.toBe(second.id)

    const points = await listSnapshotPoints()
    expect(points.map((p) => p.id)).toContain(first.id)
    expect(points.map((p) => p.id)).toContain(second.id)
  })

  it('回滚点数量超出上限时自动清理最旧的', { timeout: 60000 }, async () => {
    await seed()
    // 连续建 7 个，超过上限 5 个
    const ids: string[] = []
    for (let i = 0; i < 7; i++) {
      const snapshot = await createSnapshot('覆盖导入前', ['transactions'])
      ids.push(snapshot.id)
    }
    createdIds.push(...ids)

    const points = await listSnapshotPoints()
    expect(points).toHaveLength(5)

    // 最新的 5 个还在，最早的 2 个被清理
    const remaining = points.map((p) => p.id)
    expect(remaining).toContain(ids[6])
    expect(remaining).toContain(ids[2])
    expect(remaining).not.toContain(ids[0])
    expect(remaining).not.toContain(ids[1])
  })

  it('被清理的回滚点不能回滚', { timeout: 60000 }, async () => {
    await seed()
    const ids: string[] = []
    for (let i = 0; i < 6; i++) {
      const snapshot = await createSnapshot('覆盖导入前', ['transactions'])
      ids.push(snapshot.id)
    }
    createdIds.push(...ids)

    await expect(restoreSnapshot(ids[0])).rejects.toThrow('回滚点不存在')
  })

  it('回滚点不存在时明确报错', async () => {
    await expect(restoreSnapshot('no-such-point')).rejects.toThrow('回滚点不存在')
  })

  it('删除回滚点后不可再回滚', async () => {
    await seed()
    const snapshot = await createSnapshot('覆盖导入前', ['transactions'])
    await deleteSnapshot(snapshot.id)

    await expect(restoreSnapshot(snapshot.id)).rejects.toThrow('回滚点不存在')
  })
})
