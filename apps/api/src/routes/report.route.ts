import { Router } from 'express'
import {
  asyncHandler,
  parseAsOfQuery,
  parseBooleanQuery,
  parseProjectionWindowQuery,
  success,
  validateRequest,
  validateDateQuery,
  validateDateRange,
} from '../common/index.js'
import { generateBalanceSheet, generateIncomeExpense, generateIncomeExpenseProjection, generateCashFlow, generateInvestmentAnalysis } from '../services/report/index.js'
import { getCashFlowProjection } from '../services/projection.service.js'

const router = Router()

router.get('/balance-sheet', validateRequest(validateDateQuery), asyncHandler(async (req, res) => {
  const result = await generateBalanceSheet(String(req.query.date))
  return success(res, result)
}))

router.get('/income-expense', validateRequest(validateDateRange), asyncHandler(async (req, res) => {
  const includePredictions = req.query.includePredictions === 'true'
  const includeExcluded = req.query.includeExcluded === 'true'
  const result = await generateIncomeExpense(String(req.query.startDate), String(req.query.endDate), includePredictions, includeExcluded)
  return success(res, result)
}))

router.get('/income-expense-projection', asyncHandler(async (req, res) => {
  const asOf = parseAsOfQuery(req.query.asOf)
  const window = parseProjectionWindowQuery(req.query, asOf)
  const includeExcluded = parseBooleanQuery(req.query.includeExcluded, 'includeExcluded', false)
  const result = await generateIncomeExpenseProjection({ asOf, ...window, includeExcluded })
  return success(res, result)
}))

router.get('/cash-flow', validateRequest(validateDateRange), asyncHandler(async (req, res) => {
  const includePredictions = req.query.includePredictions === 'true'
  const result = await generateCashFlow(String(req.query.startDate), String(req.query.endDate), includePredictions)
  return success(res, result)
}))

router.get('/investment-analysis', validateRequest(validateDateRange), asyncHandler(async (req, res) => {
  const result = await generateInvestmentAnalysis(String(req.query.startDate), String(req.query.endDate))
  return success(res, result)
}))

router.get('/cash-flow-projection', asyncHandler(async (req, res) => {
  const asOf = parseAsOfQuery(req.query.asOf)
  const window = parseProjectionWindowQuery(req.query, asOf)
  const includePlanned = parseBooleanQuery(req.query.includePlanned, 'includePlanned', true)
  const includeCommitted = parseBooleanQuery(req.query.includeCommitted, 'includeCommitted', true)
  const result = await getCashFlowProjection({ asOf, ...window, includePlanned, includeCommitted })
  return success(res, result)
}))

export default router
