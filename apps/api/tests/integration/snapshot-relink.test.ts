/**
 * 投资快照前链：写入 / 删除 / 回滚后都按 Domain 唯一规则重算。
 *
 * 真实 SQLite，重点验证外键 ON DELETE SET NULL 造成的断链能被 relinkSnapshots 修复，
 * 以及重链只写派生字段、不推进 rev / vv。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { csvBuffer } from '../helpers/csv.js'

const { prisma } = await import('../../src/prisma.js')
const { withTransaction } = await import('../../src/db/transaction.js')
const { relinkSnapshots } = await import('../../src/db/repositories/snapshot-chain.repository.js')
const { rollbackImportBatch } = await import('../../src/services/import-batch.service.js')
const { importBackup } = await import('../../src/services/import/smart-import.service.js')

const CATEGORY_ID = 'relink-category'
const ACCOUNT_ID = 'relink-account'
const ACCOUNT_NAME = '重链测试账户'

const SNAPSHOT_CSV_HEADER = [
  '账户名称', '快照日期', '账户余额', '上次快照日期', '备注',
  '资产类别', '市值', '期内净流入', '排序',
]

async function seedAccount() {
  await prisma.accountCategory.create({
    data: { id: CATEGORY_ID, name: '投资', type: 'asset', sort: 0 },
  })
  await prisma.account.create({
    data: {
      id: ACCOUNT_ID,
      name: ACCOUNT_NAME,
      type: 'asset',
      initialBalance: 0n,
      categoryId: CATEGORY_ID,
    },
  })
}

async function seedChain() {
  await seedAccount()
  for (const [id, month, previous] of [
    ['s1', 0, null], ['s2', 1, 's1'], ['s3', 2, 's2'],
  ] as const) {
    await prisma.investmentAllocationSnapshot.create({
      data: {
        id,
        accountId: ACCOUNT_ID,
        date: new Date(2024, month, 1),
        accountBalance: 10000n,
        previousSnapshotId: previous,
        rev: 2,
        vv: '{"deviceA":2}',
      },
    })
  }
}

async function chain() {
  const rows = await prisma.investmentAllocationSnapshot.findMany({
    where: { accountId: ACCOUNT_ID },
    orderBy: { date: 'asc' },
    select: { id: true, previousSnapshotId: true, rev: true, vv: true },
  })
  return rows
}

describe('投资快照前链重算', () => {
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
    await prisma.importBatch.deleteMany()
    await prisma.transaction.deleteMany()
    await prisma.auditEvent.deleteMany()
    await prisma.account.deleteMany()
    await prisma.accountCategory.deleteMany()
  })

  it('删中间快照后外键置空，重链修复且 rev / vv 不变；重复重链零写入', async () => {
    await seedChain()
    await prisma.investmentAllocationSnapshot.delete({ where: { id: 's2' } })

    expect((await chain()).find(row => row.id === 's3')!.previousSnapshotId).toBeNull()

    const updated = await withTransaction(tx => relinkSnapshots(tx, [ACCOUNT_ID]))
    expect(updated).toBe(1)

    const after = await chain()
    expect(after.map(row => [row.id, row.previousSnapshotId])).toEqual([
      ['s1', null], ['s3', 's1'],
    ])
    expect(after.every(row => row.rev === 2 && row.vv === '{"deviceA":2}')).toBe(true)
    expect(await withTransaction(tx => relinkSnapshots(tx, [ACCOUNT_ID]))).toBe(0)
  })

  it('导入批次回滚部分删除快照后，链自动重接', async () => {
    await seedChain()
    await prisma.importBatch.create({
      data: {
        id: 'relink-batch',
        filename: 'snapshots.csv',
        mode: 'merge',
        includesJson: '["snapshots"]',
        importedJson: '{}',
        createdJson: JSON.stringify({
          transaction: [],
          budget: [],
          investmentAllocationItem: [],
          investmentAllocationSnapshot: ['s2'],
          investmentAssetClass: [],
          account: [],
          transactionCategory: [],
          accountCategory: [],
        }),
      },
    })

    const result = await rollbackImportBatch('relink-batch')
    expect(result.removed.investmentAllocationSnapshot).toBe(1)
    expect((await chain()).map(row => [row.id, row.previousSnapshotId])).toEqual([
      ['s1', null], ['s3', 's1'],
    ])
  })

  it('导入事务收口统一重链：乱序快照 CSV 与库内存量快照一起成链', async () => {
    await seedAccount()
    await prisma.investmentAssetClass.create({
      data: { id: 'relink-class', accountId: ACCOUNT_ID, name: '股票', sort: 0 },
    })
    await prisma.investmentAllocationSnapshot.create({
      data: {
        id: 's0',
        accountId: ACCOUNT_ID,
        date: new Date(2023, 11, 1),
        accountBalance: 5000n,
      },
    })

    const csv = csvBuffer([
      [ACCOUNT_NAME, '2024-03-01', '30000', '', '', '股票', '18000', '0', '0'],
      [ACCOUNT_NAME, '2024-01-01', '10000', '', '', '股票', '6000', '0', '0'],
      // 显式列故意写错：不采信，由 Domain 按日期定序
      [ACCOUNT_NAME, '2024-02-01', '20000', '2024-03-01', '', '股票', '12000', '0', '0'],
    ], { header: SNAPSHOT_CSV_HEADER, bom: true })

    await importBackup(csv, 'snapshots.csv', 'merge')

    const rows = await chain()
    expect(rows.map(row => row.id)).toHaveLength(4)
    const links = new Map(rows.map(row => [row.id, row.previousSnapshotId]))
    expect(links.get('s0')).toBeNull()
    expect(rows[1]!.previousSnapshotId).toBe('s0')
    expect(rows[2]!.previousSnapshotId).toBe(rows[1]!.id)
    expect(rows[3]!.previousSnapshotId).toBe(rows[2]!.id)
  })
})
