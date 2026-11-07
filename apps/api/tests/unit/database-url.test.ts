import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import {
  DATABASE_URL_MISSING_MESSAGE,
  requireDatabaseUrl,
} from '../../src/db/database-url.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const schema = readFileSync(path.resolve(here, '../../prisma/schema.prisma'), 'utf8')

describe('DATABASE_URL 必须显式提供', () => {
  it('schema 不再硬编码 file:./dev.db，改用 env("DATABASE_URL")', () => {
    expect(schema).not.toMatch(/url\s*=\s*"file:\.\/dev\.db"/)
    expect(schema).toMatch(/url\s*=\s*env\("DATABASE_URL"\)/)
  })

  it('缺少 DATABASE_URL 时 requireDatabaseUrl 抛错并提示显式指定', () => {
    expect(() => requireDatabaseUrl({})).toThrow(DATABASE_URL_MISSING_MESSAGE)
    expect(() => requireDatabaseUrl({ DATABASE_URL: '   ' })).toThrow('请显式指定 DATABASE_URL')
  })

  it('缺少 DATABASE_URL 时 PrismaClient 连接失败，而不是连 dev.db', async () => {
    const original = process.env.DATABASE_URL
    delete process.env.DATABASE_URL
    const client = new PrismaClient()
    try {
      // Prisma 5 在构造时不校验 env，首次连接才抛；断言连接阶段失败即可证明没有回落通道。
      await expect(client.$connect()).rejects.toThrow(/DATABASE_URL/)
    } finally {
      await client.$disconnect().catch(() => {})
      process.env.DATABASE_URL = original
    }
  })
})
