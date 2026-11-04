#!/usr/bin/env node
/**
 * Playwright e2e 的 API 包装：在 %TEMP%/moneybrain-e2e-<PID> 建本次运行独占的临时库，
 * 再用 DATABASE_URL 指向它启动 `npm run dev:api`，避免 e2e 读写真实账本 dev.db。
 *
 * 并发隔离：目录按本次进程 PID 命名，启动时只清理「持有者已退出」的旧目录，
 * 不会删掉另一个正在运行的 e2e 的库；teardown 也只删自己那一份（见 e2e/global-teardown.ts）。
 *
 * 清理由 e2e/global-teardown.ts 负责（Windows 上 Playwright 会直接杀进程树，
 * 这里不依赖退出钩子也能保证下一次启动重建临时库）。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareTempDatabase } from './temp-db.mjs'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const prismaDir = path.join(root, 'apps', 'api', 'prisma')
const dbDir = process.env.MB_E2E_DIR || path.join(os.tmpdir(), `moneybrain-e2e-${process.pid}`)
const dbPath = path.join(dbDir, 'e2e.db')
const dbUrl = `file:${dbPath.replace(/\\/g, '/')}`
const OWNER_PID = path.join(dbDir, 'owner.pid')

/** 进程是否仍存活；跨平台用 signal 0，Windows 上也可用。 */
function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

/** 清理持有者已退出的旧目录；跳过本目录与其他仍存活的并发运行。 */
function sweepStaleDirs() {
  let entries
  try {
    entries = readdirSync(os.tmpdir(), { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('moneybrain-e2e')) continue
    const dir = path.join(os.tmpdir(), entry.name)
    if (path.resolve(dir) === path.resolve(dbDir)) continue

    // 目录刚建、owner.pid 还没落盘的窗口期：给 60s 宽限，避免误删并发方。
    try {
      if (Date.now() - statSync(dir).mtimeMs < 60_000) continue
    } catch {
      continue
    }

    let owner = Number.NaN
    try {
      owner = Number(readFileSync(path.join(dir, 'owner.pid'), 'utf8').trim())
    } catch {
      // 旧目录没有 owner.pid（历史版本），视为已退出
    }
    if (isPidAlive(owner)) continue

    try {
      rmSync(dir, { force: true, recursive: true })
      console.log(`[e2e] 已清理残留临时库：${dir}`)
    } catch {
      // 句柄仍被占用；下一次启动再试
    }
  }
}

// 本目录若因 PID 复用残留，先重建；再登记持有者并清理他人遗留目录。
rmSync(dbDir, { force: true, recursive: true })
mkdirSync(dbDir, { recursive: true })
writeFileSync(OWNER_PID, String(process.pid), { flag: 'wx' })
sweepStaleDirs()

prepareTempDatabase({
  sourceSchema: path.join(prismaDir, 'schema.prisma'),
  sourceMigrations: path.join(prismaDir, 'migrations'),
  targetDir: dbDir,
  databaseUrl: dbUrl,
  prismaCli: path.join(root, 'node_modules', 'prisma', 'build', 'index.js'),
})
console.log(`[e2e] 临时库已就绪：${dbPath}`)

const child = spawn('npm', ['run', 'dev:api'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, DATABASE_URL: dbUrl },
})

// 记录 API 进程树根 PID，供 global-teardown 在 Playwright 停服务前先释放 SQLite 句柄。
writeFileSync(path.join(dbDir, 'api.pid'), String(child.pid ?? ''))

child.on('exit', (code) => process.exit(code ?? 0))
