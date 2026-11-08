import { Router } from 'express'
import {
  asyncHandler,
  parseAsOfQuery,
  parseBooleanQuery,
  parseProjectionWindowQuery,
  success,
  validateRequest,
  validateTypeQuery,
} from '../common/index.js'
import { getTrends, getCategoryBreakdown, getAssetTrend, getDashboardSummary } from '../services/analytics.service.js'
import { getAssetProjection } from '../services/projection.service.js'

const router = Router()

router.get('/dashboard', asyncHandler(async (_req, res) => {
  const summary = await getDashboardSummary()
  return success(res, summary)
}))

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

router.get('/asset-projection', asyncHandler(async (req, res) => {
  const window = parseProjectionWindowQuery(req.query)
  const asOf = parseAsOfQuery(req.query.asOf)
  const includePlanned = parseBooleanQuery(req.query.includePlanned, 'includePlanned', true)
  const includeCommitted = parseBooleanQuery(req.query.includeCommitted, 'includeCommitted', true)
  const result = await getAssetProjection({ asOf, ...window, includePlanned, includeCommitted })
  return success(res, result)
}))

export default router
