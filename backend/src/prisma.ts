import { PrismaClient, type Prisma } from '@prisma/client'

export const prisma = new PrismaClient()

// Prisma 事务客户端类型（供各 service 在 $transaction 回调签名中使用）
export type TransactionClient = Prisma.TransactionClient
