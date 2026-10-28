import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testDbPath = path.resolve(__dirname, '../../prisma/test.db')

// 必须在导入 src/prisma.ts 之前指向测试库——
// 否则这些写库用例会清空开发库 dev.db 里的真实账目。
process.env.DATABASE_URL = `file:${testDbPath}`

const { prisma } = await import('../../src/prisma.js')
const {
  previewImport,
  importBackup,
  resolveOverwriteScope,
} = await import('../../src/services/import/smart-import.service.js')

/**
 * 预览与正式导入的一致性测试。
 *
 * 预览跑的是同一个 runImport，只是事务最后回滚——
 * 所以这里的断言就是「预览数字必须等于实际结果」这条不变量的守卫。
 */

const TRANSACTION_CSV_HEADER = [
  'ID', '时间', '分类', '二级分类', '类型', '金额', '币种',
  '账户1', '账户2', '备注', '已报销', '手续费', '优惠券',
  '记账者', '账单标记', '标签', '账单图片', '关联账单', '口径版本',
]

function makeCsv(rows: string[][]): Buffer {
  const lines = [TRANSACTION_CSV_HEADER.join(','), ...rows.map((r) => r.join(','))]
  return Buffer.from(lines.join('\n'), 'utf-8')
}

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

describe('导入预览', () => {
  beforeEach(async () => {
    await cleanAll()
  })

  afterEach(async () => {
    await cleanAll()
  })

  it('预览的数字与正式导入的结果一致', async () => {
    const csv = makeCsv([
      ['csv1', '2026/1/15 10:00:00', '餐饮', '', '支出', '50', 'CNY', '现金', '', '午饭', '', '0', '0', '', '', '', '', '', ''],
      ['csv2', '2026/1/16 10:00:00', '餐饮', '', '支出', '30', 'CNY', '现金', '', '咖啡', '', '0', '0', '', '', '', '', '', ''],
    ])

    const preview = await previewImport(csv, 'transactions.csv', 'overwrite')

    // 预览跑完就回滚了：库里不该留下任何东西
    expect(await prisma.transaction.count()).toBe(0)

    const actual = await importBackup(csv, 'transactions.csv', 'overwrite')

    expect(preview.imported).toEqual(actual.imported)
    expect(preview.updated).toEqual(actual.updated)
    expect(preview.skipped).toEqual(actual.skipped)
    expect(preview.errors).toEqual(actual.errors)
  })

  it('预览不会改动已有数据', async () => {
    const account = await prisma.account.create({
      data: { name: '现金', type: 'asset', initialBalance: 0n, sort: 1 },
    })
    await prisma.transaction.create({
      data: {
        type: 'expense',
        amount: 1000n,
        date: new Date('2026-01-01'),
        accountId: account.id,
        note: '原有交易',
      },
    })

    const csv = makeCsv([
      ['csv1', '2026/2/15 10:00:00', '餐饮', '', '支出', '50', 'CNY', '现金', '', '新交易', '', '0', '0', '', '', '', '', '', ''],
    ])

    await previewImport(csv, 'transactions.csv', 'overwrite')

    // 覆盖预览会把原有交易清掉再导入，但回滚后必须原样还在
    expect(await prisma.transaction.count()).toBe(1)
    const remaining = await prisma.transaction.findFirst()
    expect(remaining?.note).toBe('原有交易')
    expect(remaining?.amount).toBe(1000n)
  })

  it('合并模式的预览同样不改动数据', async () => {
    const account = await prisma.account.create({
      data: { name: '现金', type: 'asset', initialBalance: 0n, sort: 1 },
    })
    const csv = makeCsv([
      ['csv1', '2026/2/15 10:00:00', '餐饮', '', '支出', '50', 'CNY', '现金', '', '新交易', '', '0', '0', '', '', '', '', '', ''],
    ])

    const preview = await previewImport(csv, 'transactions.csv', 'merge')

    expect(preview.imported.transactions).toBe(1)
    expect(await prisma.transaction.count()).toBe(0)
  })

  it('CSV 导入的覆盖范围只含交易，不含预算与快照', async () => {
    const csv = makeCsv([])
    const scope = await resolveOverwriteScope(csv, 'transactions.csv')
    expect(scope).toEqual(['transactions'])
  })

  it('JSON 备份文件的覆盖范围按文件类型判定', async () => {
    const configJson = Buffer.from(JSON.stringify({ type: 'config', data: {} }), 'utf-8')
    const budgetsJson = Buffer.from(JSON.stringify({ type: 'budgets', data: { budgets: [] } }), 'utf-8')

    expect(await resolveOverwriteScope(configJson, 'config.json')).toEqual(['config'])
    expect(await resolveOverwriteScope(budgetsJson, 'budgets.json')).toEqual(['budgets'])
  })

  it('选定的范围与文件类型不匹配时覆盖范围为空', async () => {
    const csv = makeCsv([])
    const scope = await resolveOverwriteScope(csv, 'transactions.csv', ['budgets'])
    expect(scope).toEqual([])
  })
})
