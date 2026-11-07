/**
 * 临时 SQLite 库：复制 schema 与版本化迁移，用调用方给的 DATABASE_URL
 * 跑 `prisma migrate deploy` 建库。供桌面烟测与 Playwright e2e 共用，
 * 避免任何自动化流程读写真实账本 dev.db。
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * @param {object} options
 * @param {string} options.sourceSchema 仓库内 schema.prisma
 * @param {string} options.sourceMigrations migrations 目录
 * @param {string} options.targetDir 临时目录（schema / migrations / 库文件都放这里）
 * @param {string} options.databaseUrl `file:` 开头的 SQLite URL
 * @param {string} options.prismaCli prisma CLI 的 build/index.js
 * @returns {string} 临时 schema 路径
 */
export function prepareTempDatabase({ sourceSchema, sourceMigrations, targetDir, databaseUrl, prismaCli }) {
  mkdirSync(targetDir, { recursive: true })

  const schema = readFileSync(sourceSchema, 'utf8')
  if (!/url\s*=\s*env\("DATABASE_URL"\)/.test(schema)) {
    throw new Error('schema.prisma 的 datasource 必须使用 env("DATABASE_URL")')
  }

  writeFileSync(path.join(targetDir, 'schema.prisma'), schema)
  cpSync(sourceMigrations, path.join(targetDir, 'migrations'), { recursive: true })

  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', path.join(targetDir, 'schema.prisma')], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  })

  return path.join(targetDir, 'schema.prisma')
}

/** Windows 上进程退出后仍可能短暂持有 SQLite 句柄，重试删除。 */
export async function removeTempDatabase(targetDir, { attempts = 10, delayMs = 500 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      rmSync(targetDir, { force: true, recursive: true })
      return
    } catch (error) {
      if (attempt === attempts - 1) throw error
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}
