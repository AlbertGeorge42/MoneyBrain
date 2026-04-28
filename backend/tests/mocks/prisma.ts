import { vi } from 'vitest'
import { PrismaClient } from '@prisma/client'

/**
 * 创建 Prisma Client 的 Mock 对象
 * 用于单元测试中替代真实数据库操作
 */
export function createMockPrisma() {
  return {
    account: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    accountCategory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    transactionCategory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    budget: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    budgetAlert: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((callbackOrArray) => {
      // 支持数组形式和回调形式
      if (Array.isArray(callbackOrArray)) {
        return Promise.all(callbackOrArray)
      }
      return callbackOrArray(createMockPrisma())
    }),
    $disconnect: vi.fn(),
  } as unknown as PrismaClient
}

/**
 * 重置所有 Mock 函数
 */
export function resetMockPrisma(mockPrisma: ReturnType<typeof createMockPrisma>) {
  vi.clearAllMocks()
}
