#!/usr/bin/env node
/**
 * 只读账本完整性检查：不启动 Prisma、不写库，直接用 node:sqlite 只读打开。
 *
 * 用途：误操作（误写造数、误改期初）之后核对真实账本是否完整——
 * 输出文件 SHA256、关键计数与期初字段状态，全程不产生任何写入。
 *
 * 用法：
 *   node scripts/db-integrity.mjs apps/api/prisma/dev.db
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const dbPath = process.argv[2]
if (!dbPath) {
  console.error('用法: node scripts/db-integrity.mjs <dbPath>')
  process.exit(1)
}

const resolved = path.resolve(dbPath)
if (!fs.existsSync(resolved)) {
  console.error(`数据库不存在：${resolved}`)
  process.exit(1)
}

const sha256 = crypto.createHash('sha256').update(fs.readFileSync(resolved)).digest('hex').toUpperCase()
// readOnly 阻止任何写入；不设 WAL，避免只读打开时产生 -wal/-shm 副作用。
const db = new DatabaseSync(resolved, { readOnly: true })
const count = (sql) => db.prepare(sql).get().n
const scalar = (sql) => db.prepare(sql).get().n

console.log(`db=${resolved}`)
console.log(`sha256=${sha256}`)
console.log(`accounts=${count('SELECT COUNT(*) AS n FROM accounts')}`)
console.log(`transactions=${count('SELECT COUNT(*) AS n FROM transactions')}`)
console.log(`transactions_deleted=${count('SELECT COUNT(*) AS n FROM transactions WHERE deletedAt IS NOT NULL')}`)
console.log(`adjustments=${count("SELECT COUNT(*) AS n FROM transactions WHERE type = 'adjustment'")}`)
console.log(`budgets=${count('SELECT COUNT(*) AS n FROM budgets')}`)
console.log(`initialBalanceDate_null=${count('SELECT COUNT(*) AS n FROM accounts WHERE initialBalanceDate IS NULL')}`)
console.log(`initialBalance_sum=${scalar('SELECT COALESCE(SUM(initialBalance), 0) AS n FROM accounts')}`)

db.close()
