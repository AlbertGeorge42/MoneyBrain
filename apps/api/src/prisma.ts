import { PrismaClient, type Prisma } from '@prisma/client'

/**
 * Prisma 客户端。
 *
 * 默认连接开发库（apps/api/prisma/dev.db）。
 * 设置 DATABASE_URL 可指向别的 SQLite 文件——恢复演练与自动化脚本用它把数据
 * 导入临时库，避免碰到真实账本。
 */
export const prisma = new PrismaClient(
  process.env.DATABASE_URL
    ? { datasources: { db: { url: process.env.DATABASE_URL } } }
    : undefined,
)

// Prisma 事务客户端类型（供各 service 在 $transaction 回调签名中使用）
export type TransactionClient = Prisma.TransactionClient
