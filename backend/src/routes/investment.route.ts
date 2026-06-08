import { Router } from 'express'
import { asyncHandler, success, validateRequest, ValidationError } from '../common/index.js'
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

// GET /api/investments/:accountId/asset-classes
router.get(
  '/:accountId/asset-classes',
  asyncHandler(async (req, res) => {
    const assetClasses = await getAssetClassesByAccount(req.params.accountId)
    return success(res, assetClasses)
  })
)

// POST /api/investments/:accountId/asset-classes
router.post(
  '/:accountId/asset-classes',
  validateRequest((req) => {
    if (!req.body.name) throw new ValidationError('缺少资产类型名称')
  }),
  asyncHandler(async (req, res) => {
    const assetClass = await createAssetClass(req.params.accountId, req.body)
    return success(res, assetClass)
  })
)

// PUT /api/investments/asset-classes/:id
router.put(
  '/asset-classes/:id',
  validateRequest(validateIdParam),
  asyncHandler(async (req, res) => {
    const assetClass = await updateAssetClass(req.params.id, req.body)
    return success(res, assetClass)
  })
)

// DELETE /api/investments/asset-classes/:id
router.delete(
  '/asset-classes/:id',
  validateRequest(validateIdParam),
  asyncHandler(async (req, res) => {
    const result = await deleteAssetClass(req.params.id)
    return success(res, result)
  })
)

// PUT /api/investments/:accountId/asset-classes/reorder
router.put(
  '/:accountId/asset-classes/reorder',
  validateRequest((req) => {
    if (!Array.isArray(req.body.orderedIds)) throw new ValidationError('orderedIds 必须是数组')
  }),
  asyncHandler(async (req, res) => {
    const result = await reorderAssetClasses(req.params.accountId, req.body.orderedIds)
    return success(res, result)
  })
)

// === 快照路由 ===

// GET /api/investments/allocations?accountId=&startDate=&endDate=
router.get(
  '/allocations',
  validateRequest((req) => {
    if (!req.query.accountId) throw new ValidationError('缺少 accountId 参数')
  }),
  asyncHandler(async (req, res) => {
    const { accountId, startDate, endDate } = req.query
    const snapshots = await getSnapshots(
      String(accountId),
      startDate ? String(startDate) : undefined,
      endDate ? String(endDate) : undefined
    )
    return success(res, snapshots)
  })
)

// POST /api/investments/allocations
router.post(
  '/allocations',
  validateRequest((req) => {
    const { accountId, date, items } = req.body
    if (!accountId || !date || !Array.isArray(items)) {
      throw new ValidationError('缺少必要参数 accountId、date、items')
    }
  }),
  asyncHandler(async (req, res) => {
    const { accountId, date, items, note } = req.body
    const snapshot = await createSnapshot({ accountId, date, items, note })
    return success(res, snapshot)
  })
)

// DELETE /api/investments/allocations/:id
router.delete(
  '/allocations/:id',
  validateRequest(validateIdParam),
  asyncHandler(async (req, res) => {
    await deleteSnapshot(req.params.id)
    return success(res, { message: '删除成功' })
  })
)

// PUT /api/investments/allocations/:id
router.put(
  '/allocations/:id',
  validateRequest(validateIdParam),
  asyncHandler(async (req, res) => {
    const { date, items, note } = req.body
    if (!date || !Array.isArray(items)) {
      throw new ValidationError('缺少必要参数 date、items')
    }
    const snapshot = await updateSnapshot(req.params.id, { date, items, note })
    return success(res, snapshot)
  })
)

// GET /api/investments/allocations/latest?accountId=&beforeDate=
router.get(
  '/allocations/latest',
  validateRequest((req) => {
    if (!req.query.accountId) throw new ValidationError('缺少 accountId 参数')
  }),
  asyncHandler(async (req, res) => {
    const { accountId, beforeDate } = req.query
    const snapshot = await getLatestSnapshot(
      String(accountId),
      beforeDate ? String(beforeDate) : undefined
    )
    return success(res, snapshot)
  })
)

export default router
