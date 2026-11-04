import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// playwright.config.ts 按本次运行 PID 写入唯一目录；只删自己这一份，不碰并发的另一轮 e2e。
const e2eDbDir = process.env.MB_E2E_DIR || path.join(os.tmpdir(), 'moneybrain-e2e')

export default async function globalTeardown(): Promise<void> {
  // Playwright 在本钩子之后才停止 webServer；先按 e2e-api 记录的 PID 停掉 API 进程树，
  // 否则 Windows 上 SQLite 句柄未释放，临时库删不掉。
  try {
    const pid = Number(readFileSync(path.join(e2eDbDir, 'api.pid'), 'utf8'))
    if (pid > 0) {
      if (process.platform === 'win32') {
        execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
      } else {
        process.kill(pid, 'SIGTERM')
      }
    }
  } catch {
    // 进程可能已退出，忽略
  }

  const { removeTempDatabase } = await import('../scripts/temp-db.mjs')
  try {
    await removeTempDatabase(e2eDbDir, { attempts: 40, delayMs: 500 })
    console.log(`[e2e] 已删除临时库：${path.join(e2eDbDir, 'e2e.db')}`)
  } catch {
    console.warn('[e2e] 临时库仍被占用；下一次 e2e 启动会重建。')
  }
}
