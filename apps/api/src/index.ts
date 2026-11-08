import path from 'node:path'
import express from 'express'
import cors from 'cors'
import { prisma } from './prisma.js'
import accountCategoryRoutes from './routes/account-category.route.js'
import accountRoutes from './routes/account.route.js'
import transactionCategoryRoutes from './routes/transaction-category.route.js'
import transactionRoutes from './routes/transaction.route.js'
import budgetRoutes from './routes/budget.route.js'
import reportRoutes from './routes/report.route.js'
import analyticsRoutes from './routes/analytics.route.js'
import dataRoutes from './routes/data.route.js'
import auditEventRoutes from './routes/audit-event.route.js'
import { errorHandler, notFoundHandler, requestId, rootLogger } from './common/index.js'
import { httpLogger } from './common/logger/http.js'
import { LOG_CONFIG } from './common/logger/config.js'
import { setupAutoBackupScheduler } from './services/auto-backup.service.js'

const logger = rootLogger.child({ module: 'app' })
const PORT = parseInt(process.env.PORT || '3001', 10)
const HOST = process.env.HOST || '127.0.0.1'
const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3002',
  'http://127.0.0.1:3002',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]
const CORS_ORIGINS = (process.env.CORS_ORIGINS?.split(',') ?? [])
  .map((origin) => origin.trim())
  .filter(Boolean)
const allowedOrigins = CORS_ORIGINS.length > 0 ? CORS_ORIGINS : DEFAULT_CORS_ORIGINS

const app = express()
export { app }
export default app

// 本地单用户应用：只允许已知前端来源；非浏览器请求（无 Origin）仍然放行。
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
}))
app.use(express.json())
// 请求 ID 必须早于日志中间件，保证前后端与日志使用同一个 ID
app.use(requestId)
app.use(httpLogger)

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

app.use('/api/account-categories', accountCategoryRoutes)
app.use('/api/accounts', accountRoutes)
app.use('/api/transaction-categories', transactionCategoryRoutes)
app.use('/api/transactions', transactionRoutes)
app.use('/api/budgets', budgetRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/data', dataRoutes)
app.use('/api/audit-events', auditEventRoutes)

// 未匹配的 API 路径也返回统一错误信封
app.use('/api', notFoundHandler)

// 桌面端（Electron）由同一个进程托管前端构建产物：页面与 /api 同源，
// 前端无需注入 API 地址，也避免 file:// 下 history 路由与绝对资源路径的问题。
const WEB_DIST = process.env.WEB_DIST?.trim()
if (WEB_DIST) {
  app.use(express.static(WEB_DIST))
  // SPA 回退只兜非 /api 路径；未知 API 已在上面返回统一 JSON 信封。
  app.get('*', (_req, res, next) => {
    res.sendFile(path.join(WEB_DIST, 'index.html'), (error) => {
      if (error) next(error)
    })
  })
}

app.use(errorHandler)

// 仅在非测试环境下启动 HTTP 服务
if (process.env.NODE_ENV !== 'test') {
  // 自动定时备份（B3）：配置已开启时挂起调度；失败会记录到配置的 lastRunError
  void setupAutoBackupScheduler()
  app.listen(PORT, HOST, () => {
    logger.info({
      action: 'boot',
      environment: process.env.NODE_ENV || 'development',
      host: HOST,
      port: PORT,
      corsOrigins: allowedOrigins,
      logLevel: LOG_CONFIG.level,
      node: process.version,
      pid: process.pid,
    }, 'application started')
    void announceDatabase()
  })
}

/**
 * 启动时打印当前库路径与流水总笔数。
 *
 * DATABASE_URL 由启动脚本显式提供（缺失时 src/prisma.ts 已在加载阶段抛错），
 * 这里把「路径 + 笔数」直接打出来，方便核对当前连的是哪本账。
 */
async function announceDatabase(): Promise<void> {
  const database = process.env.DATABASE_URL
  try {
    const transactions = await prisma.transaction.count()
    const fields = { action: 'db.summary', database, transactions }
    const message = `数据库: ${database} | 流水: ${transactions} 笔`
    // 少于 10 笔时用 warn 级别，避免把它当成正常启动噪声跳过。
    if (transactions < 10) logger.warn(fields, message)
    else logger.info(fields, message)
  } catch (error) {
    logger.warn(
      { action: 'db.summary', database, error: error instanceof Error ? error.message : error },
      `数据库: ${database} | 无法读取流水笔数`,
    )
  }
}

process.on('beforeExit', async () => {
  await prisma.$disconnect()
})
