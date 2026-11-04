#!/usr/bin/env node
/**
 * Playwright e2e 的 API 包装：先在 %TEMP%/moneybrain-e2e 建临时库，
 * 再用 DATABASE_URL 指向它启动 `npm run dev:api`，避免 e2e 读写真实账本 dev.db。
 *
 * 清理由 e2e/global-teardown.ts 负责（Windows 上 Playwright 会直接杀进程树，
 * 这里不依赖退出钩子也能保证下一次启动重建临时库）。
 */
import { spawn } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareTempDatabase } from './temp-db.mjs'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const prismaDir = path.join(root, 'apps', 'api', 'prisma')
const dbDir = path.join(os.tmpdir(), 'moneybrain-e2e')
const dbPath = path.join(dbDir, 'e2e.db')
const dbUrl = `file:${dbPath.replace(/\\/g, '/')}`

// 本次运行从空库开始；上一次的残留目录（清理失败时）在这里一并清掉。
rmSync(dbDir, { force: true, recursive: true })
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
