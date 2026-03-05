import express from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'
import accountCategoryRoutes from './routes/account-category.js'
import accountRoutes from './routes/account.js'
import categoryRoutes from './routes/category.js'
import transactionRoutes from './routes/transaction.js'
import budgetRoutes from './routes/budget.js'
import reportRoutes from './routes/report.js'
import analyticsRoutes from './routes/analytics.js'
import balanceSnapshotRoutes from './routes/balance-snapshot.js'
import dataRoutes from './routes/data.js'
import { errorHandler } from './middleware/error.js'

export const prisma = new PrismaClient()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/account-categories', accountCategoryRoutes)
app.use('/api/accounts', accountRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/transactions', transactionRoutes)
app.use('/api/budgets', budgetRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/balance-snapshots', balanceSnapshotRoutes)
app.use('/api/data', dataRoutes)

app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`)
})

process.on('beforeExit', async () => {
  await prisma.$disconnect()
})
