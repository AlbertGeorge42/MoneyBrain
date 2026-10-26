/**
 * A1 迁移对账：把库里所有金额列按「分」导出来，算一个指纹。
 *
 * 迁移前（元）与迁移后（分）各跑一次，指纹必须完全一致——否则就是迁移改了钱。
 *
 * 用法：
 *   node --import tsx scripts/a1-reconcile.mts prisma/dev.db.pre-a1 yuan
 *   npm run db:deploy
 *   node --import tsx scripts/a1-reconcile.mts prisma/dev.db minor
 *
 * 参数：
 *   <dbPath>  数据库文件
 *   <unit>    yuan = 旧库（金额是元，可能有浮点尾巴，按 half-up 转分）
 *             minor = 新库（金额已经是整数分）
 */
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

const YUAN_TABLES = {
  accounts: ['initialBalance'],
  budgets: ['amount'],
  investment_allocation_snapshots: ['accountBalance'],
  investment_allocation_items: ['marketValue', 'periodNetFlow'],
  transactions: ['amount', 'fee', 'coupon'],
} as const

type Unit = 'yuan' | 'minor'

const toMinor = (value: unknown, unit: Unit): number => {
  if (value === null || value === undefined) return 0
  if (typeof value !== 'number' && typeof value !== 'bigint') {
    throw new Error(`金额不是数字: ${String(value)}`)
  }
  const asNumber = Number(value)
  if (!Number.isFinite(asNumber)) throw new Error(`金额不是有限数: ${String(value)}`)
  const minor = unit === 'yuan' ? Math.round(asNumber * 100) : asNumber
  if (!Number.isSafeInteger(minor)) throw new Error(`金额超出安全整数范围: ${String(value)}`)
  return minor
}

const dbPath = process.argv[2]
const unit = process.argv[3] as Unit | undefined
if (!dbPath || (unit !== 'yuan' && unit !== 'minor')) {
  throw new Error('用法: a1-reconcile.mts <dbPath> <yuan|minor>')
}

const db = new DatabaseSync(dbPath, { readOnly: true })
const lines: string[] = []
const totals: Record<string, number> = {}

try {
  for (const [table, columns] of Object.entries(YUAN_TABLES)) {
    const rows = db.prepare(`SELECT * FROM "${table}" ORDER BY "id"`).all() as Record<string, unknown>[]
    for (const row of rows) {
      for (const column of columns) {
        const minor = toMinor(row[column], unit)
        const key = `${table}.${column}`
        totals[key] = (totals[key] ?? 0) + minor
        // 逐行逐列入指纹：任何一行的金额变化都会改变哈希
        lines.push(`${table}|${String(row.id)}|${column}|${minor}`)
      }
    }
    console.log(`${table}: ${rows.length} 行`)
  }
} finally {
  db.close()
}

lines.sort()
const hash = createHash('sha256').update(lines.join('\n')).digest('hex')
console.log(`\n金额单元格: ${lines.length}`)
for (const [key, value] of Object.entries(totals)) {
  console.log(`${key} 合计: ${value} 分`)
}
console.log(`\n指纹: ${hash}`)
