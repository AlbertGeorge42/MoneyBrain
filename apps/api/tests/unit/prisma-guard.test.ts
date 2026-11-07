import { describe, expect, it } from 'vitest'
import {
  DEV_DB_URL,
  RealDatabaseBlockedError,
  MissingDatabaseUrlError,
  guardPrismaTarget,
  resolveDatabaseTarget,
  REAL_DEV_DB,
} from '../../../../scripts/lib/prisma-guard.mjs'

describe('prisma-guard 目标防护', () => {
  it('未设置 DATABASE_URL 时直接拒绝，不再回落真实 dev.db', () => {
    let caught: unknown
    try {
      guardPrismaTarget({ argv: [], url: '' })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(MissingDatabaseUrlError)
    expect((caught as Error).message).toContain('请显式指定 DATABASE_URL')
    expect((caught as Error).message).toContain(DEV_DB_URL)
  })

  it('显式指向真实 dev.db 且未传 --allow-real 时仍拒绝运行', () => {
    let caught: unknown
    try {
      guardPrismaTarget({ argv: [], url: DEV_DB_URL })
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
