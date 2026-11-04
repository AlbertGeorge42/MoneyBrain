import { describe, it, expect, afterAll } from 'vitest'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testDbPath = path.resolve(__dirname, '../../prisma/test.db')

// 必须在导入 src/prisma.ts 之前指向测试库
process.env.DATABASE_URL = `file:${testDbPath}`

const { prisma } = await import('../../src/prisma.js')

// D7 验收：列表与报表查询的扫描量随期间增长、不随总历史增长（EXPLAIN QUERY PLAN 走索引）。
// 余额计算是明确例外（O(历史)，决策 #6 禁止缓存列），不在本测试断言范围。
//
// 索引选择（实测基线，dev.db 3218 笔）：
// - 带 type 条件的查询走 `transactions_type_date_idx` 复合索引（随期间）✓
// - 纯 date 范围查询（交易列表、统计 groupBy）曾走 deletedAt 单列索引全扫 + TEMP B-TREE 排序（随总历史）✗
//   → 加 `[deletedAt, date]` 复合索引（替换冗余的 deletedAt 单列索引）：等值列 + 范围列保序，
//     扫描范围收敛到「期间内行数」。注意排序仍可能残留 TEMP B-TREE FOR RIGHT PART OF ORDER BY
//     （列表生产查询带 createdAt 次序键）与 TEMP B-TREE FOR GROUP BY（分组列不在索引序），
//     但它们只作用在期间内的行上——扫描量已不再随总历史增长。
// DateTime 列在 SQLite 存毫秒时间戳，等价 SQL 的参数必须传 Date 才与列类型匹配（传字符串会让优化器误判）。

const explain = async (sql: string, ...params: unknown[]) =>
  (await prisma.$queryRawUnsafe<{ detail: string }[]>(`EXPLAIN QUERY PLAN ${sql}`, ...params)).map(
    (r) => r.detail,
  )

const monthStart = new Date('2026-07-01T00:00:00.000')
const monthEnd = new Date('2026-07-31T23:59:59.999')

afterAll(async () => {
  await prisma.$disconnect()
})

describe('D7：列表/统计查询的扫描量随期间（EXPLAIN 走索引）', () => {
  it('交易列表（date 范围 + 软删除过滤，按 date 倒序分页）走 deletedAt+date 复合索引，不用临时 B-tree 排序', async () => {
    const sql = `SELECT id FROM "transactions" WHERE date >= ? AND date <= ? AND deletedAt IS NULL ORDER BY date DESC LIMIT 20`
    const details = await explain(sql, monthStart, monthEnd)
    const joined = details.join(' | ')
    expect(joined).toContain('transactions_deletedAt_date_idx')
    expect(joined).not.toContain('TEMP B-TREE')
  })

  it('统计 groupBy（预算口径聚合形状）走索引而非全表扫描', async () => {
    const sql = `SELECT accountId, categoryId, type, SUM(amount) FROM "transactions" WHERE date >= ? AND date < ? AND deletedAt IS NULL GROUP BY accountId, categoryId, type`
    const details = await explain(sql, monthStart, monthEnd)
    const joined = details.join(' | ')
    expect(joined).toContain('transactions_deletedAt_date_idx')
  })
})
