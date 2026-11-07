#!/usr/bin/env node
/**
 * npm 入口的 DATABASE_URL 注入器。
 *
 * 作用：schema 改成 `env("DATABASE_URL")` 后，所有需要库的 npm 脚本必须显式给出
 * 绝对路径。这里在「未设置」时注入默认开发库（apps/api/prisma/dev.db 的绝对 file: URL），
 * 已设置时原样透传（便于指向备份副本/临时库）。入口脚本自身不再有隐式回落。
 *
 * 用法：
 *   node scripts/with-database-url.mjs <命令> [参数...]
 */
import { spawn } from 'node:child_process'
import { DEV_DB_URL } from './lib/prisma-guard.mjs'

const [command, ...args] = process.argv.slice(2)
if (!command) {
  console.error('用法: node scripts/with-database-url.mjs <命令> [参数...]')
  process.exit(1)
}

const explicitUrl = process.env.DATABASE_URL?.trim()
const databaseUrl = explicitUrl || DEV_DB_URL
if (!explicitUrl) {
  console.log(`[db-url] 未设置 DATABASE_URL，显式使用默认开发库：${DEV_DB_URL}`)
}

// Windows 下经 shell 执行时，npm 脚本这类带空格的参数需要重新加引号。
const quote = (value) => (value.includes(' ') ? `"${value}"` : value)
const commandLine = [command, ...args].map(quote).join(' ')

const child = spawn(commandLine, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DATABASE_URL: databaseUrl },
})

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0))
})
