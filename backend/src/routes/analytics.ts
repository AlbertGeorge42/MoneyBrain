import { Router, type Request } from 'express'
import { success } from '../utils/response.js'
import { getTrends, getCategoryBreakdown, getAssetTrend } from '../services/analytics.service.js'
import { ValidationError } from '../errors/index.js'
import { asyncHandler } from '../utils/async-handler.js'
import { validateRequest } from '../middleware/validate-request.js'

const router = Router()

const hasValue = (value: unknown) => value !== undefined && value !== null && value !== ''

const validateTypeQuery = (req: Request) => {
  if (!hasValue(req.query.type)) {
    throw new ValidationError('请指定类型(income/expense)')
  }
}

router.get('/trends', validateRequest(validateTypeQuery), asyncHandler(async (req, res) => {
  const trends = await getTrends(String(req.query.type))
  return success(res, trends)
}))

router.get('/category-breakdown', validateRequest(validateTypeQuery), asyncHandler(async (req, res) => {
  const result = await getCategoryBreakdown(
    String(req.query.type),
    req.query.startDate as string | undefined,
    req.query.endDate as string | undefined,
    req.query.parentCategoryId as string | undefined,
  )
  return success(res, result)
}))

router.get('/asset-trend', asyncHandler(async (_req, res) => {
  const trends = await getAssetTrend()
  return success(res, trends)
}))

export default router
