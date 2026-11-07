import { vi } from 'vitest'
import { copyFileSync } from 'node:fs'
import path from 'node:path'

// 全局测试配置

/**
 * 每个测试文件都从本次运行的模板库复制出一份独占副本。
 *
 * 原因：src/prisma.ts 在 DATABASE_URL 未设置时直接抛错，不再隐式回落 dev.db；
 * 而共用单个 test.db 会让并行运行（两个终端、或并行 worker）互相清表。
 * 副本放在 MB_API_TEST_DIR（系统临时目录下按进程唯一命名的目录），
 * global-teardown 在跑完后整目录删除。
 */
const runDir = process.env.MB_API_TEST_DIR
if (!runDir) {
  throw new Error(
    '缺少 MB_API_TEST_DIR：API 测试必须通过 vitest.config.ts 的 globalSetup 建隔离库',
  )
}

const templateDb = path.join(runDir, 'template.db')
const workerDb = path.join(
  runDir,
  `worker-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
)
copyFileSync(templateDb, workerDb)

process.env.DATABASE_URL = `file:${workerDb.replace(/\\/g, '/')}`

/**
 * 同步身份文件跟着本次运行目录走：并行运行不再共用 prisma/sync-identity.json。
 * 单元测试里 prisma 常被 mock，身份文件只是本地常量，不需要真实连接。
 */
process.env.MONEYBRAIN_SYNC_IDENTITY_PATH ??= path.join(runDir, 'sync-identity.json')

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
