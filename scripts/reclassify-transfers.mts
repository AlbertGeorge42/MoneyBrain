/**
 * 一次性数据修复：按当前账户性质重判所有已有转账的五类内部分类。
 *
 * 背景：转账分类曾按交易分类 / 旧规则落库，内化五类后需要把历史行按
 * 「负债 > 投资 > 普通转账」重新归类；判定口径与手工记账、导入共用
 * domain classifyTransferCategory，避免出现第二套规则。
 *
 * 安全约定（与 scripts/fix-expense-sign.mts 一致）：
 * - 默认 dry-run，只报告将变更的笔数，不写库；
 * - 只有显式 --apply 才修改；apply 前生成加密容器备份，失败即中止；
 * - 只改 categoryId，金额 / 账户 / 日期 / 审计历史一律不动。
 *
 * 用法：
 *   npm run db:reclassify-transfers                 # dry-run
 *   npm run db:reclassify-transfers -- --apply      # 备份后执行
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { assertPrismaTarget } from './lib/prisma-guard.mjs'
import { exportFullBackup } from '../apps/api/src/services/export/index.js'
import { reclassifyTransferCategories } from '../apps/api/src/services/transfer-category.service.js'

const apply = process.argv.includes('--apply')

function timestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate()), '-',
    pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds()),
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
    // 先看差异：dry-run 绝不写库，apply 也先预览以便备份后再动手。
    const preview = await reclassifyTransferCategories(false)
    console.log(`🔍 扫描 ${preview.scanned} 笔转账，分类不匹配 ${preview.updated} 笔`)
    for (const change of preview.changes.slice(0, 5)) {
      console.log(`   - ${change.id}: ${change.from ?? '空'} → ${change.to}`)
    }
    if (preview.changes.length > 5) console.log(`   … 另有 ${preview.changes.length - 5} 笔`)

    if (!apply) {
      console.log('🟡 dry-run：未写入任何数据。确认后运行：npm run db:reclassify-transfers -- --apply')
      return
    }
    if (preview.updated === 0) {
      console.log('✅ 没有需要修复的数据，未生成备份')
      return
    }

    const directory = await databaseDirectory(db)
    const backupPath = join(directory, `moneybrain-backup-${timestamp()}-pre-transfer-reclassify.mbx`)
    console.log(`📦 正在备份到 ${backupPath} …`)
    const backup = await exportFullBackup()
    mkdirSync(directory, { recursive: true })
    writeFileSync(backupPath, backup)
    console.log(`📦 备份完成（${backup.length} 字节）`)

    const result = await reclassifyTransferCategories(true)
    console.log(`✅ 已重判 ${result.updated} 笔转账分类；备份保留在 ${backupPath}`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
