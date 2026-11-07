// 本次测试运行的独占目录。
//
// 每次 `vitest run` 在系统临时目录建一个按进程唯一命名的目录，模板库与
// 各 worker 的库副本都放这里；跑完由 global-teardown 整目录删除。
// 并发运行（两个终端同时 `npm run test:api`）各用各的 PID 目录，互不触碰。
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const RUN_DIR_PREFIX = 'moneybrain-api-test-'
const OWNER_FILE = 'owner.pid'

/** 取得（必要时创建）本次运行目录；配置、globalSetup 与测试共用同一个值。 */
export function ensureTestRunDir(): string {
  const configured = process.env.MB_API_TEST_DIR
  if (configured) {
    mkdirSync(configured, { recursive: true })
    return configured
  }

  const runDir = path.join(os.tmpdir(), `${RUN_DIR_PREFIX}${process.pid}`)
  // PID 可能被系统复用：先清掉同名残留，再登记本次运行的持有者。
  rmSync(runDir, { force: true, recursive: true })
  mkdirSync(runDir, { recursive: true })
  writeFileSync(path.join(runDir, OWNER_FILE), String(process.pid), { flag: 'wx' })

  process.env.MB_API_TEST_DIR = runDir
  sweepStaleRunDirs(runDir)
  return runDir
}

/** 清理持有者已退出的旧目录；跳过本目录与其他仍存活的并发运行。 */
function sweepStaleRunDirs(currentDir: string): void {
  let entries
  try {
    entries = readdirSync(os.tmpdir(), { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(RUN_DIR_PREFIX)) continue
    const dir = path.join(os.tmpdir(), entry.name)
    if (path.resolve(dir) === path.resolve(currentDir)) continue

    // 目录刚建、owner.pid 还没落盘的窗口期：给 60s 宽限，避免误删并发方。
    try {
      if (Date.now() - statSync(dir).mtimeMs < 60_000) continue
    } catch {
      continue
    }

    let owner = Number.NaN
    try {
      owner = Number(readFileSync(path.join(dir, OWNER_FILE), 'utf8').trim())
    } catch {
      // 历史残留没有 owner.pid，视为已退出
    }
    if (isPidAlive(owner)) continue

    try {
      rmSync(dir, { force: true, recursive: true })
    } catch {
      // 句柄仍被占用；下一次运行再试
    }
  }
}

/** 进程是否仍存活；跨平台用 signal 0，Windows 上也可用。 */
function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}
