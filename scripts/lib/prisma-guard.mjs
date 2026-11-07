/**
 * 数据库目标防护（脚本与工具层）。
 *
 * 背景：`schema.prisma` 的 datasource 读取 `env("DATABASE_URL")`，脚本不再能靠
 * schema 里的字面量静默落到真实账本 `apps/api/prisma/dev.db`。
 *
 * 规则：脚本在实例化 PrismaClient 之前调用 `assertPrismaTarget()`。
 * - 未设置 DATABASE_URL：直接抛 `MissingDatabaseUrlError`，要求显式指定（不回落）；
 * - 目标不是真实库：放行，并打印目标路径；
 * - 目标是真实库且未传 `--allow-real`：抛错拒绝运行，错误信息包含目标路径；
 * - 目标是真实库且显式传了 `--allow-real`：先整份备份并打印备份路径与 SHA256，再放行。
 *
 * 默认开发库路径由 npm 入口脚本显式写成绝对 URL（见 scripts/with-database-url.mjs）。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
export const REAL_DEV_DB = path.resolve(REPO_ROOT, 'apps/api/prisma/dev.db')
/** 默认开发库的显式绝对 URL（供 npm 入口脚本注入 DATABASE_URL）。 */
export const DEV_DB_URL = `file:${REAL_DEV_DB.replace(/\\/g, '/')}`
const SCHEMA_DIR = path.resolve(REPO_ROOT, 'apps/api/prisma')

/** 未设置 DATABASE_URL 时抛出；不再回落到 dev.db。 */
export class MissingDatabaseUrlError extends Error {
  constructor() {
    super(
      '[prisma-guard] 请显式指定 DATABASE_URL（例如 ' +
        `${DEV_DB_URL}）；已不再隐式回落 dev.db。`,
    )
    this.name = 'MissingDatabaseUrlError'
  }
}

/** 目标库是真实账本、且未显式放行时抛出。 */
export class RealDatabaseBlockedError extends Error {
  constructor(target) {
    super(
      `[prisma-guard] 拒绝运行：目标库是真实账本 ${target}。` +
        '如确需操作真实库，请显式传 --allow-real（会先整份备份并打印备份路径）。',
    )
    this.name = 'RealDatabaseBlockedError'
    this.target = target
  }
}

/** Windows 文件系统大小写不敏感，比较前统一归一化。 */
function normalize(value) {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/**
 * 解析 `DATABASE_URL` 指向的库文件绝对路径。
 * - 未设置：抛 `MissingDatabaseUrlError`（不再默认到真实库）；
 * - `file:` URL：按 schema 目录解析相对路径；
 * - 非 SQLite URL：返回 null（与真实库无关）。
 * @param {string | undefined} url
 * @returns {string | null}
 */
export function resolveDatabaseTarget(url = process.env.DATABASE_URL) {
  if (!url) throw new MissingDatabaseUrlError()
  if (!url.startsWith('file:')) return null
  let raw = url.slice('file:'.length)
  if (raw.startsWith('//')) raw = raw.slice(2)
  raw = decodeURIComponent(raw)
  return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(SCHEMA_DIR, raw)
}

/** 备份真实库到系统临时目录，返回备份路径。 */
export function backupRealDatabase(realDb) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
  const backupPath = path.join(os.tmpdir(), `mb-devdb-backup-${stamp}.db`)
  fs.copyFileSync(realDb, backupPath)
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(backupPath)).digest('hex').toUpperCase()
  console.log(`[prisma-guard] 真实库备份: ${backupPath} (SHA256=${sha256})`)
  return backupPath
}

/**
 * 校验目标并打印路径。真实库仅在 `--allow-real` 时放行，放行前先备份。
 * @param {object} [options]
 * @param {string[]} [options.argv] 默认 process.argv.slice(2)
 * @param {string | undefined} [options.url] 默认 process.env.DATABASE_URL
 * @param {string} [options.realDb] 仅测试注入
 * @returns {{ target: string | null, isReal: boolean, backupPath: string | null }}
 */
export function guardPrismaTarget(options = {}) {
  const argv = options.argv ?? process.argv.slice(2)
  const url = options.url ?? process.env.DATABASE_URL
  const realDb = options.realDb ?? REAL_DEV_DB
  const target = resolveDatabaseTarget(url)
  const isReal = target !== null && normalize(target) === normalize(realDb)

  if (!isReal) {
    console.log(`[prisma-guard] 目标库: ${target ?? '(非 SQLite)'}`)
    return { target, isReal: false, backupPath: null }
  }
  if (!argv.includes('--allow-real')) {
    throw new RealDatabaseBlockedError(realDb)
  }
  const backupPath = backupRealDatabase(realDb)
  console.log(`[prisma-guard] 目标库: ${target}（已放行 --allow-real）`)
  return { target, isReal: true, backupPath }
}

/**
 * 供脚本使用的便捷入口：校验失败直接抛错终止脚本。
 * @param {object} [options] 同 guardPrismaTarget
 */
export function assertPrismaTarget(options = {}) {
  return guardPrismaTarget(options)
}
