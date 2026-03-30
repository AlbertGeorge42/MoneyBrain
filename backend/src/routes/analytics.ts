import { Router } from 'express'
import { success, error } from '../utils/response.js'
import { getTrends, getCategoryBreakdown, getAssetTrend } from '../services/analytics.service.js'

const router = Router()

router.get('/trends', async (req, res, next) => {
  try {
    const { type } = req.query
    if (!type) {
      return error(res, '请指定类型(income/expense)', 'BAD_REQUEST', 400)
    }
    const trends = await getTrends(type as string)
    return success(res, trends)
  } catch (err) {
    return next(err)
  }
})

router.get('/category-breakdown', async (req, res, next) => {
  try {
    const { type, startDate, endDate, parentCategoryId } = req.query
    if (!type) {
      return error(res, '请指定类型(income/expense)', 'BAD_REQUEST', 400)
    }
    const result = await getCategoryBreakdown(
      type as string,
      startDate as string | undefined,
      endDate as string | undefined,
      parentCategoryId as string | undefined,
    )
    return success(res, result)
  } catch (err) {
    return next(err)
  }
})

router.get('/asset-trend', async (_req, res, next) => {
  try {
    const trends = await getAssetTrend()
    return success(res, trends)
  } catch (err) {
    return next(err)
  }
})

export default router
