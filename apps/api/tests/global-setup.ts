import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const schemaPath = resolve(here, '../prisma/schema.prisma')
const testSchemaPath = resolve(here, '../prisma/test-schema.prisma')
const prismaCli = resolve(here, '../../../node_modules/prisma/build/index.js')

/**
 * 集成测试前把 test.db 推到当前 schema。
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

  writeFileSync(testSchemaPath, testSchema, 'utf8')
  try {
    execFileSync(
      process.execPath,
      [prismaCli, 'db', 'push', '--schema', testSchemaPath, '--skip-generate', '--accept-data-loss'],
      {
        stdio: 'inherit',
        env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
      },
    )
  } finally {
    if (existsSync(testSchemaPath)) unlinkSync(testSchemaPath)
  }
}
