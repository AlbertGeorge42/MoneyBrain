/**
 * MoneyBrain Electron 主进程（最小可运行版本）。
 *
 * 结构：主进程只做窗口 + 生命周期 + 端口选择 + 首次建库；业务 API 仍是
 * apps/api 编译产物，通过 ELECTRON_RUN_AS_NODE 子进程运行，崩溃不连带窗口。
 *
 * 数据与真实账本隔离：数据库固定落在 app.getPath('userData')/data/moneybrain.db，
 * 测试时可用 MB_USER_DATA 指向临时目录，绝不读取仓库里的 apps/api/prisma/dev.db。
 */
const { app, BrowserWindow, Menu, dialog } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const http = require('node:http')
const net = require('node:net')
const path = require('node:path')

if (process.env.MB_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.MB_USER_DATA))
}

// 打包后 __dirname 位于 app.asar 内；原生二进制与迁移文件在 app.asar.unpacked。
const UNPACKED_ROOT = __dirname.replace(/app\.asar(?![.])/, 'app.asar.unpacked')
const LOG_DIR = path.join(app.getPath('userData'), 'logs')
const LOG_FILE = path.join(LOG_DIR, 'desktop.log')

/** 追加一行桌面日志（同时输出到控制台，便于从命令行观察启动过程）。 */
function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`
  console.log(`[desktop] ${message}`)
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    fs.appendFileSync(LOG_FILE, `${line}\n`)
  } catch {
    // 日志失败不影响启动
  }
}

function logPath(relative) {
  return path.join(UNPACKED_ROOT, relative)
}

const API_ENTRY = path.join(__dirname, 'api', 'apps', 'api', 'src', 'index.js')
const WEB_DIST = path.join(__dirname, 'web')
const PRISMA_CLI = path.join(__dirname, 'node_modules', 'prisma', 'build', 'index.js')
const PRISMA_SCHEMA = logPath(path.join('prisma', 'schema.prisma'))
const QUERY_ENGINE = logPath(path.join('node_modules', '.prisma', 'client', 'query_engine-windows.dll.node'))
const SCHEMA_ENGINE = logPath(path.join('node_modules', '@prisma', 'engines', 'schema-engine-windows.exe'))

let apiProcess = null
let mainWindow = null
let quitting = false

/** 取一个当前空闲的 127.0.0.1 端口（由主进程预取，避免固定 3001 与开发服务冲突）。 */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
  })
}

/** 子进程统一入口：显式 ELECTRON_RUN_AS_NODE，使用 Electron 自带的 Node 运行时。 */
function spawnNode(modulePath, args, env, label) {
  const child = spawn(process.execPath, [modulePath, ...args], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.stdout.on('data', (chunk) => log(`${label} | ${String(chunk).trimEnd()}`))
  child.stderr.on('data', (chunk) => log(`${label} | ${String(chunk).trimEnd()}`))
  return child
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.once('exit', (code) => resolve(code ?? 1))
    child.once('error', () => resolve(1))
  })
}

/**
 * 应用迁移（幂等）：首次启动建库，已有库在未来版本里自动升级。
 * schema 与 migrations 必须真实文件（schema-engine 是外部原生进程，读不了 asar）。
 */
async function ensureDatabase() {
  const dataDir = path.join(app.getPath('userData'), 'data')
  await fsp.mkdir(dataDir, { recursive: true })
  const dbPath = path.join(dataDir, 'moneybrain.db')
  const databaseUrl = `file:${dbPath.replace(/\\/g, '/')}`

  if (!fs.existsSync(PRISMA_SCHEMA)) {
    throw new Error(`缺少 Prisma schema：${PRISMA_SCHEMA}`)
  }
  const existed = fs.existsSync(dbPath)
  log(`数据库：${dbPath}（${existed ? '已存在，执行幂等迁移' : '首次启动，新建并迁移'}）`)

  const migration = spawnNode(
    PRISMA_CLI,
    ['migrate', 'deploy', '--schema', PRISMA_SCHEMA],
    {
      NODE_ENV: 'production',
      DATABASE_URL: databaseUrl,
      PRISMA_SCHEMA_ENGINE_BINARY: SCHEMA_ENGINE,
      PRISMA_HIDE_UPDATE_MESSAGE: 'true',
      CHECKPOINT_DISABLE: '1',
    },
    'migrate',
  )
  const code = await waitForExit(migration)
  if (code !== 0) throw new Error(`数据库迁移失败（退出码 ${code}），详见 ${LOG_FILE}`)

  return databaseUrl
}

/** 启动 API 子进程并等待 /api/health 就绪；端口被抢占时换端口重试一次。 */
async function startApi(databaseUrl) {
  let lastError = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const port = await findFreePort()
    const child = spawnNode(API_ENTRY, [], {
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      DATABASE_URL: databaseUrl,
      WEB_DIST,
      PRISMA_QUERY_ENGINE_LIBRARY: QUERY_ENGINE,
      PRISMA_HIDE_UPDATE_MESSAGE: 'true',
      CHECKPOINT_DISABLE: '1',
    }, 'api')

    let exited = false
    child.once('exit', (code) => {
      exited = true
      if (!quitting && apiProcess === child) {
        log(`API 进程意外退出（退出码 ${code ?? '未知'}）`)
        dialog.showErrorBox('MoneyBrain API 已停止', `本地服务意外退出，请重新启动应用。\n日志：${LOG_FILE}`)
        app.quit()
      }
    })
    apiProcess = child

    const ready = await waitForHealth(port, child, () => exited)
    if (ready) {
      log(`API 就绪：http://127.0.0.1:${port}`)
      return port
    }
    lastError = new Error(`API 在限定时间内未就绪（端口 ${port}）`)
    stopApi()
    log(`${lastError.message}，重试…`)
  }
  throw lastError ?? new Error('API 启动失败')
}

/** 轮询健康端点；子进程提前退出或超时都视为失败。 */
function waitForHealth(port, child, hasExited, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const probe = () => {
      if (hasExited() || quitting) return resolve(false)
      if (Date.now() > deadline) return resolve(false)
      const request = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 2_000 }, (response) => {
        response.resume()
        if (response.statusCode === 200) return resolve(true)
        setTimeout(probe, 500)
      })
      request.on('error', () => setTimeout(probe, 500))
      request.on('timeout', () => request.destroy())
    }
    probe()
  })
}

function stopApi() {
  if (!apiProcess) return
  const child = apiProcess
  apiProcess = null
  if (child.exitCode === null) child.kill()
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'MoneyBrain',
    // 原生窗口底色兜底，避免 CSS 生效前闪白（与前端浅色底一致）。
    backgroundColor: '#F6F6F4',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.loadURL(`http://127.0.0.1:${port}/`)
}

async function bootstrap() {
  Menu.setApplicationMenu(null)
  log(`启动 MoneyBrain（${app.isPackaged ? '打包版' : '本地开发版'}）`)
  try {
    const databaseUrl = await ensureDatabase()
    const port = await startApi(databaseUrl)
    createWindow(port)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log(`启动失败：${message}`)
    dialog.showErrorBox('MoneyBrain 启动失败', `${message}\n\n日志：${LOG_FILE}`)
    app.quit()
  }
}

// 单实例：第二个实例不重复起 API，只聚焦已有窗口。
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(bootstrap)
}

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  quitting = true
  stopApi()
})

process.on('exit', stopApi)
