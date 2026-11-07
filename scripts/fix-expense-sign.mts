/**
 * 历史数据修复（B2）：把支出交易的负金额翻正。
 *
 * 背景：旧客户端/旧导入路径曾把支出写成 `-2800`，而领域层与导入都按「正金额大小」计算。
 * 写入边界已在 transaction.service.ts 归一化（新数据不会再产生负数），本脚本只处理历史行。
 *
 * 安全约定：
 * - **默认 dry-run**，只报告数量/金额/样例，不写库；
 * - 只有显式 `--apply` 才会修改；
 * - apply 前先用 `exportFullBackup()` 生成一份加密容器备份，备份失败则中止；
 * - 修改时推进 rev/vv（同步合并依赖版本向量），不做别的字段变更；
 * - 只处理未删除的支出（导出/预算/账本口径都排除已删除行）。
 *
 * 用法：
 *   npm run db:fix-expense-sign                 # dry-run
 *   npm run db:fix-expense-sign -- --apply      # 备份后执行
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { assertPrismaTarget } from './lib/prisma-guard.mjs'
import { updateSyncVersion } from '../apps/api/src/db/sync-version.js'
import { exportFullBackup } from '../apps/api/src/services/export/index.js'

const apply = process.argv.includes('--apply')

function timestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('')
}

async function databaseDirectory(db: PrismaClient): Promise<string> {
  const rows = await db.$queryRawUnsafe<{ file: string }[]>('PRAGMA database_list')
  const main = rows.find((row) => row.file)
  if (!main?.file) throw new Error('无法确定数据库文件位置，拒绝执行')
  return dirname(main.file)
}

async function main(): Promise<void> {
  const configuredUrl = process.env.DATABASE_URL
  assertPrismaTarget({ url: configuredUrl })
  if (!configuredUrl) throw new Error('请显式指定 DATABASE_URL')
  const db = new PrismaClient({ datasources: { db: { url: configuredUrl } } })

  try {
    const rows = await db.transaction.findMany({
      where: { type: 'expense', amount: { lt: 0n }, deletedAt: null },
      select: { id: true, amount: true, date: true, note: true, rev: true, vv: true },
      orderBy: { date: 'asc' },
    })

    const total = rows.reduce((sum, row) => sum + row.amount, 0n)
    console.log(`🔍 发现 ${rows.length} 笔负数支出，合计 ${total} 分（应翻正为 ${-total} 分）`)
    for (const row of rows.slice(0, 5)) {
      console.log(`   - ${row.id} ${row.date.toISOString().slice(0, 10)} ${row.amount} ${row.note ?? ''}`)
    }
    if (rows.length > 5) console.log(`   … 另有 ${rows.length - 5} 笔`)

    if (!apply) {
      console.log('🟡 dry-run：未写入任何数据。确认后运行：npm run db:fix-expense-sign -- --apply')
      return
    }
    if (rows.length === 0) {
      console.log('✅ 没有需要修复的数据，未生成备份')
      return
    }

    const directory = await databaseDirectory(db)
    const backupPath = join(directory, `moneybrain-backup-${timestamp()}-pre-expense-sign.mbx`)
    console.log(`📦 正在备份到 ${backupPath} …`)
    const backup = await exportFullBackup()
    mkdirSync(directory, { recursive: true })
    writeFileSync(backupPath, backup)
    console.log(`📦 备份完成（${backup.length} 字节）`)

    let fixed = 0
    for (const row of rows) {
      const version = await updateSyncVersion({ rev: row.rev, vv: row.vv })
      await db.transaction.update({
        where: { id: row.id },
        data: { amount: -row.amount, rev: version.rev, vv: version.vv, updatedAt: new Date() },
      })
      fixed += 1
    }
    console.log(`✅ 已修正 ${fixed} 笔支出金额；备份保留在 ${backupPath}`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
