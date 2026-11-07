import { describe, expect, it } from 'vitest'
import {
  REAL_DEV_DB,
  RealDatabaseBlockedError,
  guardPrismaTarget,
  resolveDatabaseTarget,
} from '../../../../scripts/lib/prisma-guard.mjs'

describe('prisma-guard 真实库防护', () => {
  it('未传 --allow-real 且目标解析为真实 dev.db 时拒绝运行并打印目标路径', () => {
    let caught: unknown
    try {
      // 传空 url = 不设 DATABASE_URL，Prisma 走 schema 字面量 file:./dev.db → 真实库
      guardPrismaTarget({ argv: [], url: '' })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(RealDatabaseBlockedError)
    expect((caught as Error).message).toContain(REAL_DEV_DB)
    expect((caught as RealDatabaseBlockedError).target).toBe(REAL_DEV_DB)
  })

  it('DATABASE_URL 显式指向临时副本时放行', () => {
    const result = guardPrismaTarget({ argv: [], url: 'file:C:/Users/George/AppData/Local/Temp/verify/dev.db' })
    expect(result.isReal).toBe(false)
    expect(result.backupPath).toBeNull()
  })

  it('相对 file: URL 按 schema 目录解析，能识别出真实库', () => {
    expect(resolveDatabaseTarget('file:./dev.db')).toBe(REAL_DEV_DB)
  })
})
