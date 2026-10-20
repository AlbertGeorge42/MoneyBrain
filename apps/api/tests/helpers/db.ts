import { PrismaClient } from '@prisma/client'

// 测试数据库客户端（使用独立测试数据库）
const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:./test.db',
    },
  },
})

/**
 * 清理测试数据库中的所有数据
 * 按依赖关系顺序清理，避免外键约束错误
 */
export async function cleanDatabase(): Promise<void> {
  await testPrisma.$transaction([
    testPrisma.investmentAllocationItem.deleteMany(),
    testPrisma.investmentAllocationSnapshot.deleteMany(),
    testPrisma.investmentAssetClass.deleteMany(),
    testPrisma.budget.deleteMany(),
    testPrisma.transaction.deleteMany(),
    testPrisma.account.deleteMany(),
    testPrisma.transactionCategory.deleteMany(),
    testPrisma.accountCategory.deleteMany(),
  ])
}

/**
 * 初始化测试数据库（执行迁移）
 */
export async function initTestDatabase(): Promise<void> {
  // 使用 Prisma migrate deploy 或 db push 初始化测试数据库
  // 这里假设测试数据库已经通过 prisma migrate dev 创建
}

/**
 * 断开测试数据库连接
 */
export async function disconnectTestDatabase(): Promise<void> {
  await testPrisma.$disconnect()
}

export { testPrisma }
