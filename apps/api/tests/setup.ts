import { vi } from 'vitest'
import path from 'path'
import { fileURLToPath } from 'url'

// 全局测试配置

/**
 * 测试默认指向 test.db，不碰开发库 dev.db。
 *
 * 原因：src/prisma.ts 在 DATABASE_URL 未设置时连的是 dev.db——
 * 那是用户真实账目所在的库。任何会写库的测试都可能把它清空。
 *
 * 需要连别的库的测试可以自己覆盖 process.env.DATABASE_URL
 * （集成测试就是这么做的），但必须**在导入 src/prisma.ts 之前**设置。
 */
const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * 同步身份文件固定到 prisma 目录：单元测试里 prisma 常被 mock，
 * 走不到 SQLite 的 PRAGMA 查询；身份文件只是本地常量，不需要真实连接。
 */
process.env.MONEYBRAIN_SYNC_IDENTITY_PATH ??= path.resolve(here, '../prisma/sync-identity.json')

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${path.resolve(here, '../prisma/test.db')}`
}

// Mock console.error 在测试中避免噪音，但保留错误信息供调试
const originalError = console.error
console.error = (...args: unknown[]) => {
  // 过滤掉已知的 React/Testing 警告
  const message = args[0]?.toString() || ''
  if (
    message.includes('Warning:') ||
    message.includes('Error:') && message.includes('test')
  ) {
    return
  }
  originalError(...args)
}

// 全局超时设置
vi.setConfig({ testTimeout: 10000 })
