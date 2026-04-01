import { Router, type Request } from 'express'
import { success } from '../utils/response.js'
import { generateBalanceSheet, generateIncomeExpense, generateCashFlow } from '../services/report/index.js'
import { ValidationError } from '../errors/index.js'
import { asyncHandler } from '../utils/async-handler.js'
import { validateRequest } from '../middleware/validate-request.js'

const router = Router()

const hasValue = (value: unknown) => value !== undefined && value !== null && value !== ''

const validateMonthQuery = (req: Request) => {
  if (!hasValue(req.query.month)) {
    throw new ValidationError('请提供月份参数')
  }
}

const validateDateRangeQuery = (req: Request) => {
  if (!hasValue(req.query.startDate) || !hasValue(req.query.endDate)) {
    throw new ValidationError('请提供开始日期和结束日期')
  }
}

// 资产负债表路由
router.get('/balance-sheet', validateRequest(validateMonthQuery), asyncHandler(async (req, res) => {
  const result = await generateBalanceSheet(String(req.query.month))
  return success(res, result)
}))

// 收支表路由
router.get('/income-expense', validateRequest(validateDateRangeQuery), asyncHandler(async (req, res) => {
  const result = await generateIncomeExpense(String(req.query.startDate), String(req.query.endDate))
  return success(res, result)
}))

// 现金流量表路由
router.get('/cash-flow', validateRequest(validateDateRangeQuery), asyncHandler(async (req, res) => {
  const result = await generateCashFlow(String(req.query.startDate), String(req.query.endDate))
  return success(res, result)
}))

export default router
