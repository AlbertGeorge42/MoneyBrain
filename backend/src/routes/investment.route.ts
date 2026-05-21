import { Router } from 'express'
import { asyncHandler, success } from '../common/index.js'
import { validateIdParam } from '../common/validators.js'
import {
  getAssetClassesByAccount,
  createAssetClass,
  updateAssetClass,
  deleteAssetClass,
  reorderAssetClasses,
} from '../services/investment/asset-class.service.js'
import {
  createSnapshot,
  getSnapshots,
  getLatestSnapshot,
  deleteSnapshot,
  updateSnapshot,
} from '../services/investment/allocation.service.js'

const router = Router()

// === 资产类型路由 ===

// GET /api/accounts/:accountId/investment-asset-classes
router.get(
  '/accounts/:accountId/investment-asset-classes',
  asyncHandler(async (req, res) => {
    const assetClasses = await getAssetClassesByAccount(req.params.accountId)
    return success(res, assetClasses)
  })
)

// POST /api/accounts/:accountId/investment-asset-classes
router.post(
  '/accounts/:accountId/investment-asset-classes',
  asyncHandler(async (req, res) => {
    const assetClass = await createAssetClass(req.params.accountId, req.body)
    return success(res, assetClass)
  })
)

// PUT /api/investment-asset-classes/:id
router.put(
  '/investment-asset-classes/:id',
  asyncHandler(async (req, res) => {
    validateIdParam(req)
    const assetClass = await updateAssetClass(req.params.id, req.body)
    return success(res, assetClass)
  })
)

// DELETE /api/investment-asset-classes/:id
router.delete(
  '/investment-asset-classes/:id',
  asyncHandler(async (req, res) => {
    validateIdParam(req)
    const result = await deleteAssetClass(req.params.id)
    return success(res, result)
  })
)

// PUT /api/accounts/:accountId/investment-asset-classes/reorder
router.put(
  '/accounts/:accountId/investment-asset-classes/reorder',
  asyncHandler(async (req, res) => {
    const { orderedIds } = req.body
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'orderedIds 必须是数组' },
      })
    }
    const result = await reorderAssetClasses(req.params.accountId, orderedIds)
    return success(res, result)
  })
)

// === 快照路由 ===

// GET /api/investment-allocations?accountId=&startDate=&endDate=
router.get(
  '/investment-allocations',
  asyncHandler(async (req, res) => {
    const { accountId, startDate, endDate } = req.query
    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: '缺少 accountId 参数' },
      })
    }
    const snapshots = await getSnapshots(
      String(accountId),
      startDate ? String(startDate) : undefined,
      endDate ? String(endDate) : undefined
    )
    return success(res, snapshots)
  })
)

// POST /api/investment-allocations
router.post(
  '/investment-allocations',
  asyncHandler(async (req, res) => {
    const { accountId, date, items, note } = req.body
    if (!accountId || !date || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: '缺少必要参数 accountId、date、items' },
      })
    }
    const snapshot = await createSnapshot({ accountId, date, items, note })
    return success(res, snapshot)
  })
)

// DELETE /api/investment-allocations/:id
router.delete(
  '/investment-allocations/:id',
  asyncHandler(async (req, res) => {
    validateIdParam(req)
    await deleteSnapshot(req.params.id)
    return success(res, { message: '删除成功' })
  })
)

// PUT /api/investment-allocations/:id
router.put(
  '/investment-allocations/:id',
  asyncHandler(async (req, res) => {
    validateIdParam(req)
    const { date, items, note } = req.body
    if (!date || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: '缺少必要参数 date、items' },
      })
    }
    const snapshot = await updateSnapshot(req.params.id, { date, items, note })
    return success(res, snapshot)
  })
)

// GET /api/investment-allocations/latest?accountId=&beforeDate=
router.get(
  '/investment-allocations/latest',
  asyncHandler(async (req, res) => {
    const { accountId, beforeDate } = req.query
    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: '缺少 accountId 参数' },
      })
    }
    const snapshot = await getLatestSnapshot(
      String(accountId),
      beforeDate ? String(beforeDate) : undefined
    )
    return success(res, snapshot)
  })
)

export default router
