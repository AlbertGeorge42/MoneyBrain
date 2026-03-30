import { Router } from 'express'
import { success, error } from '../utils/response.js'
import { generateBalanceSheet, generateIncomeExpense, generateCashFlow } from '../services/report/index.js'

const router = Router()

// 资产负债表路由
router.get('/balance-sheet', async (req, res, next) => {
  try {
    const { month } = req.query
    if (!month) {
      return error(res, '请提供月份参数', 'BAD_REQUEST', 400)
    }

    const result = await generateBalanceSheet(month as string)
    return success(res, result)
  } catch (err) {
    return next(err)
  }
})

// 收支表路由
router.get('/income-expense', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query
    if (!startDate || !endDate) {
      return error(res, '请提供开始日期和结束日期', 'BAD_REQUEST', 400)
    }

    const result = await generateIncomeExpense(startDate as string, endDate as string)
    return success(res, result)
  } catch (err) {
    return next(err)
  }
})

// 现金流量表路由
router.get('/cash-flow', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query
    if (!startDate || !endDate) {
      return error(res, '请提供开始日期和结束日期', 'BAD_REQUEST', 400)
    }

    const result = await generateCashFlow(startDate as string, endDate as string)
    return success(res, result)
  } catch (err) {
    return next(err)
  }
})

export default router
