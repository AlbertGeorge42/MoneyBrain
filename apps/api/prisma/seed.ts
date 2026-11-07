import { PrismaClient } from '@prisma/client'
import { requireDatabaseUrl } from '../src/db/database-url.js'

// 缺 DATABASE_URL 直接抛错；不允许隐式落到 dev.db。
const prisma = new PrismaClient({ datasources: { db: { url: requireDatabaseUrl() } } })

async function main() {
  console.log('开始填充种子数据...')
  console.log('种子数据填充完成! 不再预设分类')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
