import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const schemaPath = resolve(here, '../prisma/schema.prisma')
const testSchemaPath = resolve(here, '../prisma/test-schema.prisma')
const testDbPath = resolve(here, '../prisma/test.db')
const prismaCli = resolve(here, '../../../node_modules/prisma/build/index.js')

/**
 * 集成测试前用**版本化迁移**建出 test.db。
 *
 * 与开发库共用 prisma/migrations：测试库和应用库走同一套 schema 演进，
 * 不会出现「迁移能过、db push 也能过」却结构不一致的情况。
 *
 * Prisma schema 的 datasource 固定指向 dev.db；这里生成一份临时 schema，
 * 只把 URL 换成 test.db，避免测试依赖手工维护的数据库文件。
 */
export default async function setup(): Promise<void> {
  const schema = readFileSync(schemaPath, 'utf8')
  const testSchema = schema.replace(
    /url\s*=\s*"file:\.\/dev\.db"/,
    'url      = "file:./test.db"',
  )

  if (testSchema === schema) {
    throw new Error('无法从 schema.prisma 生成 test.db 的临时 schema')
  }

  // 测试库是一次性的，先删掉再由迁移重建
  if (existsSync(testDbPath)) rmSync(testDbPath)

  writeFileSync(testSchemaPath, testSchema, 'utf8')
  try {
    execFileSync(
      process.execPath,
      [prismaCli, 'migrate', 'deploy', '--schema', testSchemaPath],
      {
        stdio: 'inherit',
        env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
      },
    )
  } finally {
    if (existsSync(testSchemaPath)) rmSync(testSchemaPath)
  }
}
