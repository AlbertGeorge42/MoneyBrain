import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import path from 'path'
import { fileURLToPath } from 'url'
import { ZipArchive } from 'archiver'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testDbPath = path.resolve(__dirname, '../../prisma/test.db')

// 必须在导入 src/prisma.ts 之前指向测试库
process.env.DATABASE_URL = `file:${testDbPath}`

const { prisma } = await import('../../src/prisma.js')
const { previewImport, importBackup } = await import('../../src/services/import/smart-import.service.js')
const { listImportBatches, rollbackImportBatch } = await import('../../src/services/import-batch.service.js')
const { clearAllData } = await import('../../src/services/clear-data.service.js')
const { exportFullBackup } = await import('../../src/services/export/index.js')

const HEADER = 'ID,时间,分类,二级分类,类型,金额,币种,账户1,账户2,备注,已报销,手续费,优惠券,记账者,账单标记,标签,账单图片,关联账单,口径版本'

function buildCsv(rows: string[]): Buffer {
  return Buffer.from('\uFEFF' + [HEADER, ...rows].join('\n'), 'utf-8')
}

function row(id: string, date: string, category: string, amount = '100.00', account = '新账户') {
  return [
    id, date, category, '', '支出', amount, 'CNY', account, '', `导入-${id}`,
    '', '0.00', '0.00', 'MoneyBrain', '', '', '', '', '1',
  ].join(',')
}

const SAMPLE_ROWS = [
  row('t1', '2026-03-01 10:00:00', '测试分类'),
  row('t2', '2026-03-02 10:00:00', '测试分类'),
  row('t3', '2026-03-03 10:00:00', '测试分类'),
  row('t4', '2026-03-04 10:00:00', '测试分类'),
  row('t5', '2026-03-05 10:00:00', '测试分类'),
]

const sampleCsv = () => buildCsv(SAMPLE_ROWS)

async function truncateAll(): Promise<void> {
  await prisma.importBatch.deleteMany()
  await prisma.auditEvent.deleteMany()
  await prisma.transaction.deleteMany()
  await prisma.investmentAllocationItem.deleteMany()
  await prisma.investmentAllocationSnapshot.deleteMany()
  await prisma.budget.deleteMany()
  await prisma.investmentAssetClass.deleteMany()
  await prisma.account.deleteMany()
  await prisma.transactionCategory.deleteMany()
  await prisma.accountCategory.deleteMany()
}

/** 导入前就存在的账户 + 一笔流水，用来验证回滚不误删。 */
async function seedExisting() {
  const category = await prisma.accountCategory.create({
    data: { id: 'ib-cat', name: '既有资产', type: 'asset', sort: 0 },
  })
  const account = await prisma.account.create({
    data: { id: 'ib-account', name: '既有账户', type: 'asset', initialBalance: 0, categoryId: category.id },
  })
  await prisma.transaction.create({
    data: {
      id: 'ib-existing-tx',
      type: 'expense',
      ruleVersion: 1,
      amount: BigInt(1234),
      fee: BigInt(0),
      coupon: BigInt(0),
      date: new Date('2026-02-01T00:00:00'),
      accountId: account.id,
      excludeFromIncomeExpense: false,
      note: '导入前就有的流水',
    },
  })
  return account
}

describe('导入预览摘要 / 批次回滚 / 全成或全不成', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await truncateAll()
  })

  it('预览给出期间跨度、笔数、金额合计、未知账户分类与重复项', async () => {
    const preview = await previewImport(sampleCsv(), 'sample.csv', 'merge')

    expect(preview.imported.transactions).toBe(5)
    expect(preview.summary).toMatchObject({
      total: 5,
      amountTotal: 5 * 10000,
      dateFrom: '2026-03-01',
      dateTo: '2026-03-05',
      duplicates: 0,
    })
    expect(preview.summary?.unknownAccounts).toContain('新账户')
    expect(preview.summary?.unknownCategories).toContain('测试分类')

    // 预览不写库
    expect(await prisma.transaction.count()).toBe(0)
    expect(await prisma.importBatch.count()).toBe(0)
  })

  it('导入 5 笔后按 importId 回滚：精确少 5 笔，导入前的数据仍在', async () => {
    await seedExisting()
    const before = await prisma.transaction.count()
    expect(before).toBe(1)

    const result = await importBackup(sampleCsv(), 'sample.csv', 'merge')
    expect(result.imported.transactions).toBe(5)
    expect(result.importId).toBeTruthy()
    expect(await prisma.transaction.count()).toBe(6)

    const batches = await listImportBatches()
    expect(batches[0]).toMatchObject({ id: result.importId, transactionCount: 5, status: 'active' })

    const rollback = await rollbackImportBatch(result.importId!)
    expect(rollback.removedTransactions).toBe(5)
    expect(await prisma.transaction.count()).toBe(1)
    // 导入前就有的流水与账户没有被误删
    expect(await prisma.transaction.findUnique({ where: { id: 'ib-existing-tx' } })).not.toBeNull()
    expect(await prisma.account.findUnique({ where: { id: 'ib-account' } })).not.toBeNull()
    // 该批新建的账户被撤销
    expect(await prisma.account.findFirst({ where: { name: '新账户' } })).toBeNull()

    const afterBatch = (await listImportBatches())[0]
    expect(afterBatch.status).toBe('rolledBack')
    expect(afterBatch.rolledBack).toMatchObject({ transaction: 5 })

    await expect(rollbackImportBatch(result.importId!)).rejects.toThrow(/已经回滚/)
  })

  it('同一文件第二次预览把已存在的行计为疑似重复', async () => {
    await importBackup(sampleCsv(), 'sample.csv', 'merge')
    const second = await previewImport(sampleCsv(), 'sample.csv', 'merge')

    expect(second.summary).toMatchObject({ total: 5, duplicates: 5, amountTotal: 5 * 10000 })
    // 账户/分类已经由第一次导入建立，不再是未知
    expect(second.summary?.unknownAccounts).toEqual([])
    expect(second.summary?.unknownCategories).toEqual([])
    expect(second.imported.transactions).toBe(0)
    expect(second.skipped.transactions).toBe(5)
  })

  it('中途失败（交易已插入、预算解析失败）→ 全都不写库', async () => {
    await seedExisting()
    const before = await prisma.transaction.count()

    const archive = new ZipArchive({ zlib: { level: 9 } })
    const chunks: Buffer[] = []
    archive.on('data', (chunk: Buffer) => chunks.push(chunk))
    archive.append(JSON.stringify({ includes: ['transactions', 'budgets'] }), { name: 'manifest.json' })
    archive.append(sampleCsv(), { name: 'transactions.csv' })
    archive.append('{ 这不是合法 JSON', { name: 'budgets.json' })
    await archive.finalize()
    const brokenZip = Buffer.concat(chunks)

    await expect(importBackup(brokenZip, 'broken.mbx', 'merge')).rejects.toThrow()

    expect(await prisma.transaction.count()).toBe(before)
    expect(await prisma.account.findFirst({ where: { name: '新账户' } })).toBeNull()
    expect(await prisma.importBatch.count()).toBe(0)
  })

  it('导出 .mbx → 清空 → 重新导入：笔数与金额合计往返一致', async () => {
    await seedExisting()
    const backup = await exportFullBackup()
    const beforeCount = await prisma.transaction.count()
    const beforeSum = await prisma.transaction.aggregate({ _sum: { amount: true } })

    await clearAllData()
    expect(await prisma.transaction.count()).toBe(0)

    const restored = await importBackup(backup, 'moneybrain-backup-2026-11-06.mbx', 'merge')
    expect(restored.imported.transactions).toBe(beforeCount)
    expect(await prisma.transaction.count()).toBe(beforeCount)
    expect(await prisma.transaction.aggregate({ _sum: { amount: true } })).toEqual(beforeSum)
    expect(await prisma.account.count()).toBe(1)
  })

  it('清空全部：业务表归零，回收站/审计与导入批次一并清空', async () => {
    await seedExisting()
    await importBackup(sampleCsv(), 'sample.csv', 'merge')
    await prisma.auditEvent.create({
      data: {
        id: 'ib-audit',
        entity: 'transaction',
        entityId: 'ib-existing-tx',
        action: 'deleted',
        beforeJson: '{}',
      },
    })

    await clearAllData()

    expect(await prisma.transaction.count()).toBe(0)
    expect(await prisma.account.count()).toBe(0)
    expect(await prisma.accountCategory.count()).toBe(0)
    expect(await prisma.transactionCategory.count()).toBe(0)
    expect(await prisma.auditEvent.count()).toBe(0)
    expect(await prisma.importBatch.count()).toBe(0)
  })
})
