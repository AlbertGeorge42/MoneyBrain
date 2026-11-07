import { execFileSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const schemaPath = resolve(here, '../prisma/schema.prisma')
const testDbPath = resolve(here, '../prisma/test.db')
const prismaCli = resolve(here, '../../../node_modules/prisma/build/index.js')

/**
 * 集成测试前用**版本化迁移**建出 test.db。
 *
 * 与开发库共用 prisma/migrations：测试库和应用库走同一套 schema 演进，
 * 不会出现「迁移能过、db push 也能过」却结构不一致的情况。
 *
 * schema 读取 env("DATABASE_URL")；这里显式指向 test.db 的绝对 URL，
 * 不复用开发库，也不依赖任何隐式默认值。
 */
export default async function setup(): Promise<void> {
  // 测试库是一次性的，先删掉再由迁移重建
  if (existsSync(testDbPath)) rmSync(testDbPath)

  const testDbUrl = `file:${testDbPath.replace(/\\/g, '/')}`
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schemaPath], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testDbUrl, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  })
}
