import { PrismaClient, type Prisma } from '@prisma/client'
import { requireDatabaseUrl } from './db/database-url.js'

/**
 * Prisma 客户端。
 *
 * 连接目标必须由调用方通过 DATABASE_URL 显式提供（绝对路径的 file: URL）；
 * 缺失时在模块加载阶段直接抛错，绝不静默落到 apps/api/prisma/dev.db。
 */
export const prisma = new PrismaClient({
  datasources: { db: { url: requireDatabaseUrl() } },
})

// 连接初始化处的持久化设置（D6）：
// - journal_mode=WAL：库级持久属性（写进 db 文件，幂等），允许读与写并行；
//   重复执行返回当前值，新库/旧库首次启动即切到 WAL，之后所有连接（含其它进程）自动继承。
// - busy_timeout=5000：每连接属性，写锁竞争时排队等待而非立即报 SQLITE_BUSY；
//   Prisma 的 SQLite 驱动对新连接有同样默认值，这里显式固定，避免驱动默认变化造成行为漂移。
// 注意必须用 $queryRawUnsafe：PRAGMA journal_mode=WAL 会返回结果行，execute 语句会报
// "Execute returned results, which is not allowed in SQLite"。
// 两者都允许失败（例如库被另一进程独占的瞬间）：退回 delete 模式 + 驱动默认超时，即改动前行为。
function applyConnectionPragmas(): void {
  void prisma
    .$queryRawUnsafe('PRAGMA journal_mode = WAL')
    .then(() => prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000'))
    .catch((err) => {
      console.error('[prisma] 连接 PRAGMA 设置失败，沿用默认模式:', err instanceof Error ? err.message : err)
    })
}

applyConnectionPragmas()

// Prisma 事务客户端类型（供各 service 在 $transaction 回调签名中使用）
export type TransactionClient = Prisma.TransactionClient
