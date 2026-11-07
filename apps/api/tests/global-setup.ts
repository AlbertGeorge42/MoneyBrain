import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareTempDatabase, removeTempDatabase } from '../../../scripts/temp-db.mjs'
import { ensureTestRunDir } from './test-run-dir.js'

const here = dirname(fileURLToPath(import.meta.url))
const prismaDir = resolve(here, '../prisma')
const prismaCli = resolve(here, '../../../node_modules/prisma/build/index.js')

/** 模板库：每次运行用版本化迁移建一次，各测试文件从它复制出独占副本。 */
const TEMPLATE_DB = 'template.db'

/**
 * 集成测试前在本次运行独占的临时目录建出模板库。
 *
 * 与开发库共用 prisma/migrations：测试库和应用库走同一套 schema 演进，
 * 不会出现「迁移能过、db push 也能过」却结构不一致的情况。
 *
 * schema 读取 env("DATABASE_URL")；这里显式指向临时模板库的绝对 URL，
 * 不复用开发库，也不依赖任何隐式默认值。
 */
export async function setup(): Promise<void> {
  const runDir = ensureTestRunDir()
  const templatePath = resolve(runDir, TEMPLATE_DB)
  const templateUrl = `file:${templatePath.replace(/\\/g, '/')}`

  prepareTempDatabase({
    sourceSchema: resolve(prismaDir, 'schema.prisma'),
    sourceMigrations: resolve(prismaDir, 'migrations'),
    targetDir: runDir,
    databaseUrl: templateUrl,
    prismaCli,
  })
}

/** 测试结束（含 worker 退出）后删掉整个运行目录，不留临时库。 */
export async function teardown(): Promise<void> {
  const runDir = process.env.MB_API_TEST_DIR
  if (!runDir) return
  await removeTempDatabase(runDir)
  delete process.env.MB_API_TEST_DIR
}
