/**
 * 恢复演练的第二步：在临时库里导入刚导出的备份。
 *
 * 单独成一个进程，是因为导入服务用的是全局 Prisma 客户端——
 * 通过 DATABASE_URL 指向临时库，就能让同一套导入逻辑跑在临时库上，
 * 完全不碰真实账本。
 *
 * 用法（由 restore-drill.mts 调用）：
 *   node --import tsx scripts/restore-drill-import.mts <数据库URL> <备份文件>
 */
import { readFileSync } from 'node:fs'
import { importBackup } from '../apps/api/src/services/import/smart-import.service.js'
import { prisma } from '../apps/api/src/prisma.js'

async function main() {
  const [, , dbUrl, zipPath] = process.argv
  if (!dbUrl || !zipPath) {
    throw new Error('用法: restore-drill-import.mts <数据库URL> <备份文件>')
  }

  const buffer = readFileSync(zipPath)
  const result = await importBackup(buffer, 'restore-drill.zip', 'overwrite')

  console.log(
    `  导入完成：交易 ${result.imported.transactions} 笔 · 账户 ${result.imported.accounts} 个 · ` +
      `预算 ${result.imported.budgets} 个 · 快照 ${result.imported.investmentSnapshots} 个 · 错误 ${result.errors.length} 条`,
  )
  for (const error of result.errors) {
    console.error(`   - ${error}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
