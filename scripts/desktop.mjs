#!/usr/bin/env node
/**
 * 桌面启动器（无 Rust 工具链时的可运行方案）：
 *   npm run desktop        → 复用已有构建，起 API + 预览服务，开一个 Edge 应用窗口
 *   npm run desktop -- --build → 先构建再启动
 *
 * 说明：Tauri 需要 rustc/cargo，本机没有；此脚本用 Edge「应用模式」提供独立窗口，
 * 仍是本机 API + 本地静态资源，但不等同于打包安装包。窗口尺寸只能在启动时指定，
 * 最小尺寸无法通过 Edge 命令行约束。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { connect } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const args = new Set(process.argv.slice(2))
const WEB_URL = 'http://127.0.0.1:4173'
const API_HEALTH = 'http://127.0.0.1:3001/api/health'
const WINDOW = '1280,820'

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]

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
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // 服务尚未起来，继续等
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(`${label} 在 ${timeoutMs / 1000}s 内未就绪：${url}`)
}

/** 端口已被占用时（上一次实例未关干净、或 npm run dev 在跑）提前报错，避免静默起不来。 */
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

async function main() {
  const distIndex = path.join(root, 'apps', 'web', 'dist', 'index.html')
  if (args.has('--build') || !existsSync(distIndex)) {
    log('构建前端与后端产物…')
    await run('npm', ['run', 'build'])
  }

  const edgePath = EDGE_CANDIDATES.find((candidate) => existsSync(candidate))
  if (!edgePath) {
    throw new Error('未找到 Microsoft Edge；请安装 Edge，或改用 npm run dev 在浏览器中打开。')
  }

  for (const port of [3001, 4173]) {
    if (await isPortInUse(port)) {
      throw new Error(
        `端口 ${port} 已被占用：可能已有 MoneyBrain 桌面实例在运行（或 npm run dev 未关）。请先关闭后再启动。`,
      )
    }
  }

  log('启动 API 与预览服务（npm run start）…')
  const server = spawn('npm', ['run', 'start'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
  server.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`))
  server.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`))

  const cleanup = () => killTree(server)
  process.on('SIGINT', () => {
    cleanup()
    process.exit(130)
  })
  process.on('exit', cleanup)

  try {
    await waitFor(API_HEALTH, 'API')
    await waitFor(WEB_URL, '前端预览服务')
  } catch (error) {
    cleanup()
    throw error
  }

  log(`打开桌面窗口 ${WINDOW}：${WEB_URL}`)
  // 独立配置目录，避免污染用户日常 Edge；禁用首次运行引导，否则会多弹一个推广窗口。
  const profile = path.join(process.env.TEMP || root, 'moneybrain-desktop-profile')
  const app = spawn(
    edgePath,
    [
      `--app=${WEB_URL}`,
      `--window-size=${WINDOW}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=msEdgeFirstRunExperience,Translate,msEdgeSidebarV2',
      ...(process.env.MB_DESKTOP_DEBUG_PORT
        ? [`--remote-debugging-port=${process.env.MB_DESKTOP_DEBUG_PORT}`]
        : []),
    ],
    { stdio: 'ignore' },
  )

  let exitedEarly = false
  app.on('exit', () => {
    exitedEarly = true
  })
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
  log('窗口已关闭，停止服务。')
  cleanup()
}

main().catch((error) => {
  console.error(`[desktop] 启动失败：${error.message}`)
  process.exitCode = 1
})
