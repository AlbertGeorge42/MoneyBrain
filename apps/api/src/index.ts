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
import investmentRoutes from './routes/investment.route.js'
import { errorHandler, rootLogger } from './common/index.js'
import { httpLogger } from './common/logger/http.js'
import { LOG_CONFIG } from './common/logger/config.js'

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

// 本地单用户应用：只允许已知前端来源；非浏览器请求（无 Origin）仍然放行。
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
}))
app.use(express.json())
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
app.use('/api/investments', investmentRoutes)

app.use(errorHandler)

// 仅在非测试环境下启动 HTTP 服务
if (process.env.NODE_ENV !== 'test') {
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
  })
}

process.on('beforeExit', async () => {
  await prisma.$disconnect()
})
