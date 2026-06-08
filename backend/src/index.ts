import express from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'
import { debuglog } from 'util'
import accountCategoryRoutes from './routes/account-category.route.js'
import accountRoutes from './routes/account.route.js'
import transactionCategoryRoutes from './routes/transaction-category.route.js'
import transactionRoutes from './routes/transaction.route.js'
import budgetRoutes from './routes/budget.route.js'
import reportRoutes from './routes/report.route.js'
import analyticsRoutes from './routes/analytics.route.js'
import dataRoutes from './routes/data.route.js'
import investmentRoutes from './routes/investment.route.js'
import { errorHandler } from './common/index.js'

const debug = debuglog('moneybrain')
const PORT = process.env.PORT || 3001

export const prisma = new PrismaClient()

const app = express()

app.use(cors())
app.use(express.json())

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

app.listen(PORT, () => {
  debug('Server is running on http://localhost:%d', PORT)
  console.log(`Server is running on http://localhost:${PORT}`)
})

process.on('beforeExit', async () => {
  await prisma.$disconnect()
})
