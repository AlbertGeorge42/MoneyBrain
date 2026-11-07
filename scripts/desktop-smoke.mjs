#!/usr/bin/env node
/**
 * 桌面端端到端烟测：自己拉起桌面启动器（临时 SQLite 库 + 临时 profile + 独立调试端口），
 * 通过 CDP 驱动真实的 Edge 应用窗口，验证「记一笔 → 总览 → 流水 → 报表」闭环并留截图。
 *
 * 隔离约定：烟测只写 %TEMP%/moneybrain-smoke-<pid>/smoke.db（临时 schema + 迁移重建），
 * 跑完删除；真实账本 dev.db 只读，前后对比交易笔数，确保不留痕。
 *
 * 用法：node scripts/desktop-smoke.mjs
 */
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { connect } from 'node:net'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { prepareTempDatabase, removeTempDatabase } from './temp-db.mjs'
import { assertPrismaTarget } from './lib/prisma-guard.mjs'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const prismaDir = path.join(root, 'apps', 'api', 'prisma')
const TMP_DIR = path.join(os.tmpdir(), `moneybrain-smoke-${process.pid}`)
const DB_PATH = path.join(TMP_DIR, 'smoke.db')
const DB_URL = `file:${DB_PATH.replace(/\\/g, '/')}`
const REAL_DB_URL = `file:${path.join(prismaDir, 'dev.db').replace(/\\/g, '/')}`
const DEBUG_PORT = Number(process.env.MB_DESKTOP_DEBUG_PORT || 9334)
const PROFILE = path.join(os.tmpdir(), `moneybrain-smoke-profile-${process.pid}`)
const OUT = path.join(os.tmpdir(), 'moneybrain-desktop-smoke')
const API_BASE = 'http://127.0.0.1:3001/api'
const NOTE = '桌面端闭环验证'

function log(message) {
  console.log(`[smoke] ${message}`)
}

function run(command, commandArgs, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, ...env },
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${commandArgs.join(' ')} 退出码 ${code}`))
    })
  })
}

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

async function countTransactions(databaseUrl) {
  assertPrismaTarget({ url: databaseUrl })
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  try {
    return await prisma.transaction.count()
  } finally {
    await prisma.$disconnect()
  }
}

async function apiPost(pathname, body) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`POST ${pathname} 失败：${response.status}`)
  const result = await response.json()
  return result.data
}

async function seedMinimalLedger() {
  const accountCategory = await apiPost('/account-categories', { name: '烟测账户分类', type: 'asset' })
  if (!accountCategory?.id) throw new Error('创建账户分类失败')
  const account = await apiPost('/accounts', {
    name: '烟测账户',
    type: 'asset',
    balance: 0,
    categoryId: accountCategory.id,
  })
  if (!account?.id) throw new Error('创建账户失败')
  await apiPost('/transaction-categories', { name: '烟测支出', type: 'expense', icon: 'CoffeeOutlined' })
}

async function waitForTarget(desktop, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (desktop.exitCode !== null) {
      throw new Error(`桌面启动器提前退出（退出码 ${desktop.exitCode}），请检查上方 [desktop] 日志。`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`, {
        signal: AbortSignal.timeout(1_500),
      })
      if (response.ok) {
        const targets = await response.json()
        const target = targets.find(
          (candidate) => candidate.type === 'page' && candidate.url.startsWith('http://127.0.0.1:4173'),
        )
        if (target) return target
      }
    } catch {
      // 窗口尚未起来，继续等
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(`桌面窗口在 ${timeoutMs / 1000}s 内未就绪（调试端口 ${DEBUG_PORT}）`)
}

/** Windows 上子进程退出后仍可能短暂持有 SQLite/profile 句柄，重试删除。 */
async function removeTempDb() {
  await removeTempDatabase(TMP_DIR)
  rmSync(PROFILE, { force: true, recursive: true })
}

async function main() {
  const webDist = path.join(root, 'apps', 'web', 'dist', 'index.html')
  const apiDist = path.join(root, 'apps', 'api', 'dist', 'apps', 'api', 'src', 'index.js')
  if (!existsSync(webDist) || !existsSync(apiDist)) {
    log('构建产物缺失，先执行 npm run build…')
    await run('npm', ['run', 'build'])
  }

  for (const port of [3001, 4173, DEBUG_PORT]) {
    if (await isPortInUse(port)) {
      throw new Error(
        `端口 ${port} 已被占用：烟测需要独占 3001 / 4173 / ${DEBUG_PORT}。请关闭现有实例后重试。`,
      )
    }
  }

  const realCountBefore = existsSync(path.join(prismaDir, 'dev.db'))
    ? await countTransactions(REAL_DB_URL)
    : null

  log(`初始化临时库 ${DB_PATH}`)
  prepareTempDatabase({
    sourceSchema: path.join(prismaDir, 'schema.prisma'),
    sourceMigrations: path.join(prismaDir, 'migrations'),
    targetDir: TMP_DIR,
    databaseUrl: DB_URL,
    prismaCli: path.join(root, 'node_modules', 'prisma', 'build', 'index.js'),
  })

  let desktop = null
  try {
    log(`拉起桌面启动器（临时库 + 调试端口 ${DEBUG_PORT}）`)
    desktop = spawn(process.execPath, [path.join(root, 'scripts', 'desktop.mjs')], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        DATABASE_URL: DB_URL,
        MB_DESKTOP_DEBUG_PORT: String(DEBUG_PORT),
        MB_DESKTOP_PROFILE: PROFILE,
      },
    })
    desktop.stdout.on('data', (chunk) => process.stdout.write(`[desktop] ${chunk}`))
    desktop.stderr.on('data', (chunk) => process.stderr.write(`[desktop] ${chunk}`))

    await waitForTarget(desktop)
    await seedMinimalLedger()

    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`)
    const context = browser.contexts()[0]
    if (!context) throw new Error('未连上桌面窗口：没有浏览器上下文')
    const page = context.pages().find((candidate) => candidate.url().startsWith('http://127.0.0.1:4173'))
    if (!page) throw new Error('未找到 4173 的应用窗口')

    // 全新 profile 首启：等启动器关掉同步确认页后，确认只剩应用窗口。
    let foreign = []
    for (let attempt = 0; attempt < 12; attempt += 1) {
      foreign = browser.contexts()
        .flatMap((ctx) => ctx.pages())
        .filter((candidate) => !candidate.url().startsWith('http://127.0.0.1:4173'))
      if (foreign.length === 0) break
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    if (foreign.length > 0) {
      throw new Error(`首启残留非应用页面：${foreign.map((candidate) => candidate.url()).join(', ')}`)
    }
    log('全新 profile 首启只有应用窗口')

    const windowInfo = await page.evaluate(() => ({
      title: document.title,
      width: window.outerWidth,
      height: window.outerHeight,
    }))
    log(`窗口标题「${windowInfo.title}」，外框 ${windowInfo.width}×${windowInfo.height}`)

    await page.goto('http://127.0.0.1:4173/dashboard')
    await page.getByRole('heading', { name: '总览', exact: true }).waitFor()
    await page.getByRole('heading', { name: '账本还是空的' }).waitFor()
    log('总览已加载（临时库为空账本）')
    await page.screenshot({ path: path.join(OUT, '1-overview.png') })

    await page.getByRole('button', { name: '记第一笔' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    await dialog.getByRole('textbox', { name: '金额' }).fill('28')
    await dialog.getByRole('button', { name: '手续费 / 优惠券 / 日期 / 备注' }).click()
    await dialog.getByRole('textbox', { name: '备注' }).fill(NOTE)
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    log('已完成一笔支出录入（写入临时库）')

    const recent = page.getByRole('region', { name: '最近流水', exact: true })
    await recent.getByRole('row').filter({ hasText: NOTE }).waitFor()
    await recent.getByRole('row').filter({ hasText: '−¥28.00' }).first().waitFor()
    await page.screenshot({ path: path.join(OUT, '2-overview-after-entry.png') })

    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '流水' }).click()
    await page.waitForURL(/\/transactions$/)
    await page.getByRole('row').filter({ hasText: NOTE }).waitFor()
    await page.screenshot({ path: path.join(OUT, '3-transactions.png') })

    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '报表' }).click()
    await page.waitForURL(/\/reports$/)
    await page.getByRole('heading', { name: '报表', exact: true }).waitFor()
    const expenseMetric = page.locator('.rep-metric-cell').filter({ hasText: '本期支出' })
    await expenseMetric.waitFor()
    log(`报表本期支出：${(await expenseMetric.innerText()).replace(/\s+/g, ' ')}`)
    await page.screenshot({ path: path.join(OUT, '4-reports.png') })

    // 关于：品牌入口 → 版本号可见
    await page.getByRole('button', { name: '关于 MoneyBrain' }).first().click()
    const about = page.getByRole('dialog')
    await about.waitFor()
    const aboutText = (await about.innerText()).replace(/\s+/g, ' ')
    if (!/版本 \d+\.\d+\.\d+/.test(aboutText)) throw new Error(`关于里没有版本号：${aboutText}`)
    log(`关于：${aboutText}`)
    await page.screenshot({ path: path.join(OUT, '5-about.png') })
    await page.keyboard.press('Escape')

    const tempCount = await countTransactions(DB_URL)
    if (tempCount !== 1) throw new Error(`临时库应有 1 笔交易，实际 ${tempCount} 笔`)
    if (realCountBefore !== null) {
      const realCountAfter = await countTransactions(REAL_DB_URL)
      if (realCountAfter !== realCountBefore) {
        throw new Error(`真实账本交易笔数变化：${realCountBefore} → ${realCountAfter}`)
      }
      log(`真实账本未变（仍为 ${realCountAfter} 笔交易）`)
    }

    log(`闭环通过，截图目录：${OUT}`)
    await browser.close()
    await Promise.race([
      new Promise((resolve) => desktop.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 20_000)),
    ])
  } finally {
    if (desktop && desktop.exitCode === null) {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(desktop.pid), '/T', '/F'], { stdio: 'ignore' })
      } else {
        desktop.kill('SIGTERM')
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000))
    }
    await removeTempDb()
    log('已删除临时库与临时 profile')
  }
}

main().catch((error) => {
  console.error(`[smoke] 失败：${error.message}`)
  process.exitCode = 1
})
