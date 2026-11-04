#!/usr/bin/env node
/**
 * 桌面启动器（无 Rust 工具链时的可运行方案）：
 *   npm run desktop / npm run desktop:open → 起 API + 预览服务，开一个 Edge 应用窗口
 *   npm run desktop -- --build              → 强制先重新构建再启动
 *
 * 说明：Tauri 需要 rustc/cargo，本机没有；此脚本用 Edge「应用模式」提供独立窗口，
 * 仍是本机 API + 本地静态资源，但不等同于打包安装包（无签名、无自动更新）。
 *
 * 健壮性约定：
 *   - 构建产物缺失时自动执行 npm run build；dev.db 缺失且未指定 DATABASE_URL 时自动应用迁移。
 *   - 端口 3001 / 4173 被占用时明确报错，不静默连到别人的实例。
 *   - 调试端口 9333 默认开启：重复启动会聚焦已有窗口，并把过小窗口抬到最小尺寸。
 *   - 全新 profile 首启会弹 Edge 同步确认页；用 --disable-sync 抑制，并在启动后关闭残留弹窗。
 *   - 窗口启动尺寸 1280×820，最小尺寸 1024×640。
 *   - 退出时停止子进程、清理 profile 锁，并等待 3001 / 4173 / 调试端口释放。
 */
import { spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { connect } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const args = new Set(process.argv.slice(2))
const WEB_PORT = 4173
const API_PORT = 3001
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`
const API_HEALTH = `http://127.0.0.1:${API_PORT}/api/health`
const DEBUG_PORT = Number(process.env.MB_DESKTOP_DEBUG_PORT || 9333)
const WINDOW = { width: 1280, height: 820 }
const MIN_WINDOW = { width: 1024, height: 640 }

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
]

const PROFILE =
  process.env.MB_DESKTOP_PROFILE || path.join(process.env.TEMP || root, 'moneybrain-desktop-profile')

function log(message) {
  console.log(`[desktop] ${message}`)
}

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options,
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${commandArgs.join(' ')} 退出码 ${code}`))
    })
  })
}

async function waitFor(url, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) })
      if (response.ok) return
    } catch {
      // 服务尚未起来，继续等
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(`${label} 在 ${timeoutMs / 1000}s 内未就绪：${url}`)
}

/** 端口已被占用时提前报错，避免静默起不来或连到别人的实例。 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port })
    socket.setTimeout(1_000)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => resolve(false))
  })
}

function killTree(child) {
  if (!child || child.exitCode !== null) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    child.kill('SIGTERM')
  }
}

/** Edge/Chromium 异常退出会留下 profile 锁；清理后下次才能正常启动。 */
function clearProfileLocks() {
  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile']) {
    rmSync(path.join(PROFILE, name), { force: true, recursive: true })
  }
}

/** 通过 DevTools HTTP 端点找到本项目的页面目标。 */
async function findDesktopTarget() {
  try {
    const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`, {
      signal: AbortSignal.timeout(1_500),
    })
    if (!response.ok) return null
    const targets = await response.json()
    return targets.find((target) => target.type === 'page' && target.url.startsWith(WEB_URL)) || null
  } catch {
    return null
  }
}

async function waitForDesktopTarget(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const target = await findDesktopTarget()
    if (target) return target
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return null
}

/** 极简 CDP 调用（Node 22+ 自带 WebSocket），用于聚焦窗口与约束最小尺寸。 */
async function cdpSend(webSocketUrl, method, params = {}) {
  const ws = new WebSocket(webSocketUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error('CDP 连接失败')), { once: true })
  })
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`CDP ${method} 超时`)), 3_000)
      ws.addEventListener('message', (event) => {
        const message = JSON.parse(event.data)
        if (message.id !== 1) return
        clearTimeout(timer)
        if (message.error) reject(new Error(message.error.message))
        else resolve(message.result)
      })
      ws.send(JSON.stringify({ id: 1, method, params }))
    })
  } finally {
    ws.close()
  }
}

async function focusExisting(target) {
  try {
    await cdpSend(target.webSocketDebuggerUrl, 'Page.bringToFront')
    return true
  } catch {
    return false
  }
}

async function enforceMinimumWindow(target) {
  try {
    const { windowId, bounds } = await cdpSend(target.webSocketDebuggerUrl, 'Browser.getWindowForTarget', {
      targetId: target.id,
    })
    if (bounds.width >= MIN_WINDOW.width && bounds.height >= MIN_WINDOW.height) return

    await cdpSend(target.webSocketDebuggerUrl, 'Browser.setWindowBounds', {
      windowId,
      bounds: {
        width: Math.max(bounds.width, MIN_WINDOW.width),
        height: Math.max(bounds.height, MIN_WINDOW.height),
      },
    })
    log(`窗口尺寸 ${bounds.width}×${bounds.height} 小于下限，已抬到 ${MIN_WINDOW.width}×${MIN_WINDOW.height}。`)
  } catch {
    // 部分 Edge 版本不支持从页面会话设置窗口，启动尺寸仍由 --window-size 保证。
  }
}

/** Edge 全新 profile 首启的同步确认页 / 欢迎页。 */
function isStartupPopup(url) {
  return /^(edge|chrome):\/\//.test(url) && /sync|first-run|firstrun|welcome|signin/i.test(url)
}

/** 用 CDP 关闭残留的同步确认页；--disable-sync 是主要手段，这里是兜底。 */
async function dismissStartupPopups() {
  try {
    const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`, {
      signal: AbortSignal.timeout(1_500),
    })
    if (!response.ok) return
    const targets = await response.json()
    const popups = targets.filter((target) => target.type === 'page' && isStartupPopup(target.url))
    for (const popup of popups) {
      try {
        await cdpSend(popup.webSocketDebuggerUrl, 'Page.close')
        log(`已关闭首启弹窗：${popup.url}`)
      } catch {
        // 弹窗可能已被 --disable-sync 抑制或自行关闭
      }
    }
  } catch {
    // 调试端口尚未就绪
    return
  }
}

/** 探测所有页面，确保只剩应用窗口；返回非应用页面数量。 */
async function countForeignPages() {
  try {
    const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`, {
      signal: AbortSignal.timeout(1_500),
    })
    if (!response.ok) return 0
    const targets = await response.json()
    return targets.filter(
      (target) => target.type === 'page' && !target.url.startsWith(WEB_URL),
    ).length
  } catch {
    return 0
  }
}

/** 关窗后等待端口释放，避免下一次启动被残留服务挡住。 */
async function waitForPortsReleased(ports, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const busy = []
    for (const port of ports) {
      if (await isPortInUse(port)) busy.push(port)
    }
    if (busy.length === 0) return true
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}

/** DATABASE_URL=file:... 时返回对应文件；非 SQLite 返回 null。 */
function resolveDbPath() {
  const url = process.env.DATABASE_URL
  if (!url) return path.join(root, 'apps', 'api', 'prisma', 'dev.db')
  if (!url.startsWith('file:')) return null
  const raw = url.slice('file:'.length)
  return path.isAbsolute(raw) ? raw : path.resolve(root, 'apps', 'api', 'prisma', raw)
}

async function ensureRuntimeAssets() {
  const webDist = path.join(root, 'apps', 'web', 'dist', 'index.html')
  const apiDist = path.join(root, 'apps', 'api', 'dist', 'apps', 'api', 'src', 'index.js')
  if (!existsSync(webDist) || !existsSync(apiDist)) {
    log('构建产物缺失，自动执行 npm run build（首次启动可能较慢）…')
    await run('npm', ['run', 'build'])
  }
  if (!existsSync(webDist) || !existsSync(apiDist)) {
    throw new Error(
      `构建失败：${!existsSync(webDist) ? webDist : apiDist} 仍不存在。\n  请手动执行 npm run build 查看具体错误。`,
    )
  }

  const migrations = path.join(root, 'apps', 'api', 'prisma', 'migrations')
  if (!existsSync(migrations)) {
    throw new Error('缺少 apps/api/prisma/migrations，无法确认数据库结构；请检查仓库是否完整。')
  }

  const dbPath = resolveDbPath()
  if (dbPath && !existsSync(dbPath)) {
    if (process.env.DATABASE_URL) {
      throw new Error(
        `DATABASE_URL 指向的数据库不存在：${dbPath}\n  请先由调用方建库并应用迁移（桌面烟测会自动完成）。`,
      )
    }
    log(`未找到数据库 ${dbPath}，自动应用迁移…`)
    await run('npm', ['run', 'db:deploy'])
    if (!existsSync(dbPath)) {
      throw new Error(`数据库初始化失败：${dbPath} 仍不存在。\n  请手动执行 npm run db:status 查看迁移状态。`)
    }
  }
}

async function main() {
  if (args.has('--build')) {
    log('构建前端与后端产物…')
    await run('npm', ['run', 'build'])
  }
  await ensureRuntimeAssets()

  const edgePath = EDGE_CANDIDATES.find((candidate) => candidate && existsSync(candidate))
  if (!edgePath) {
    throw new Error(
      '未找到 Microsoft Edge。\n  前置要求：Node.js 20+ 与 Microsoft Edge（Windows 自带）；\n  安装 Edge 后重试，或改用 npm run dev 在浏览器中打开。',
    )
  }

  // 单实例：调试端口上已有本项目的窗口 → 抬到最小尺寸并聚焦后直接退出。
  const existing = await findDesktopTarget()
  if (existing) {
    if (await isPortInUse(WEB_PORT)) {
      await enforceMinimumWindow(existing)
      const focused = await focusExisting(existing)
      log(`已有桌面实例在运行，${focused ? '已聚焦现有窗口' : '未能聚焦（请手动切换窗口）'}；本次不重复启动。`)
      return
    }
    throw new Error(
      `调试端口 ${DEBUG_PORT} 上有遗留的 MoneyBrain 窗口，但本地服务未运行。\n  请关闭该窗口后重试（或设置 MB_DESKTOP_DEBUG_PORT 使用其他端口）。`,
    )
  }

  if (await isPortInUse(DEBUG_PORT)) {
    throw new Error(
      `调试端口 ${DEBUG_PORT} 已被其他程序占用（不是本项目窗口）。\n  请关闭占用程序，或设置 MB_DESKTOP_DEBUG_PORT 换一个端口。`,
    )
  }

  for (const port of [API_PORT, WEB_PORT]) {
    if (await isPortInUse(port)) {
      throw new Error(
        `端口 ${port} 已被占用：可能已有 MoneyBrain 实例或 npm run dev 在运行。\n  请结束后重试（可用 Get-NetTCPConnection -LocalPort ${port} 查看占用进程）。`,
      )
    }
  }

  clearProfileLocks()

  log('启动 API 与预览服务（npm run start）…')
  const server = spawn('npm', ['run', 'start'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
  server.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`))
  server.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`))

  let app = null
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    killTree(app)
    killTree(server)
    clearProfileLocks()
  }
  const cleanupAndExit = async (code) => {
    cleanup()
    const released = await waitForPortsReleased([API_PORT, WEB_PORT, DEBUG_PORT])
    clearProfileLocks()
    if (!released) log('警告：仍有端口未释放，请检查残留进程。')
    process.exit(code)
  }
  process.on('SIGINT', () => { void cleanupAndExit(130) })
  process.on('SIGTERM', () => { void cleanupAndExit(143) })
  process.on('exit', cleanup)

  try {
    await waitFor(API_HEALTH, 'API')
    await waitFor(WEB_URL, '前端预览服务')
  } catch (error) {
    cleanup()
    throw error
  }

  log(`打开桌面窗口 ${WINDOW.width}×${WINDOW.height}：${WEB_URL}`)
  app = spawn(
    edgePath,
    [
      `--app=${WEB_URL}`,
      `--window-size=${WINDOW.width},${WINDOW.height}`,
      `--user-data-dir=${PROFILE}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
      '--disable-features=msEdgeFirstRunExperience,Translate,msEdgeSidebarV2',
    ],
    { stdio: 'ignore' },
  )

  let exitedEarly = false
  app.on('exit', () => {
    exitedEarly = true
  })

  const target = await waitForDesktopTarget()
  if (target) {
    await enforceMinimumWindow(target)
    // --disable-sync 已抑制同步确认页；这里再兜底关闭任何残留首启弹窗。
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await dismissStartupPopups()
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    const foreign = await countForeignPages()
    log(foreign === 0
      ? '首启只有应用窗口（无同步确认页 / 欢迎页残留）'
      : `注意：调试端口上还有 ${foreign} 个非应用页面，请手动关闭。`)
  }

  await new Promise((resolve) => setTimeout(resolve, 3_000))
  if (exitedEarly) {
    // 交给已有 Edge 进程打开窗口时，启动进程会立刻退出，此时不能跟着停服务。
    log('窗口已交由现有 Edge 进程打开；关闭窗口后按 Ctrl+C 结束本地服务。')
    await new Promise((resolve) => {
      process.on('SIGINT', resolve)
    })
    cleanup()
    return
  }
  await new Promise((resolve) => app.on('exit', resolve))
  log('窗口已关闭，停止服务并清理 profile 锁。')
  cleanup()
  const released = await waitForPortsReleased([API_PORT, WEB_PORT, DEBUG_PORT])
  clearProfileLocks()
  log(released
    ? `端口 ${API_PORT} / ${WEB_PORT} / ${DEBUG_PORT} 已释放。`
    : '警告：仍有端口未释放，请检查残留进程。')
}

main().catch((error) => {
  console.error(`[desktop] 启动失败：${error.message}`)
  process.exitCode = 1
})
