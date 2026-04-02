import { Router, type Request } from 'express'
import { asyncHandler, success, validateRequest, ValidationError } from '../common/index.js'
import {
  createTransactionCategory,
  deleteTransactionCategory,
  getTransactionCategories,
  getTransactionCategoryStats,
  moveTransactionCategory,
  updateTransactionCategory,
  updateTransactionCategorySorts,
} from '../services/category.service.js'

const router = Router()

const hasValue = (value: unknown) => value !== undefined && value !== null && value !== ''

const validateIdParam = (req: Request) => {
  if (!hasValue(req.params.id)) {
    throw new ValidationError('id不能为空')
  }
}

const validateCategoryPayload = (req: Request) => {
  const { name, type, parentId } = req.body as Record<string, unknown>
  if (!hasValue(name) || !hasValue(type)) {
    throw new ValidationError('名称和类型不能为空')
  }
  if (hasValue(parentId) && parentId === req.params.id) {
    throw new ValidationError('父分类不能是自己')
  }
}

const validateCategoryUpdatePayload = (req: Request) => {
  validateIdParam(req)

  const { name, type, parentId, cashFlowType, icon, sort } = req.body as Record<string, unknown>
  const hasUpdatableField = [name, type, parentId, cashFlowType, icon, sort].some(value => value !== undefined)

  if (!hasUpdatableField) {
    throw new ValidationError('至少提供一个需要更新的字段')
  }
  if (name !== undefined && !hasValue(name)) {
    throw new ValidationError('名称不能为空')
  }
  if (type !== undefined && !hasValue(type)) {
    throw new ValidationError('类型不能为空')
  }
  if (hasValue(parentId) && parentId === req.params.id) {
    throw new ValidationError('父分类不能是自己')
  }
}

const validateBatchSort = (req: Request) => {
  if (!Array.isArray(req.body?.items)) {
    throw new ValidationError('参数格式错误')
  }
}

const validateMovePayload = (req: Request) => {
  validateIdParam(req)
  if (req.body?.newParentId === req.params.id) {
    throw new ValidationError('不能移动到自己')
  }
}

router.get('/', asyncHandler(async (_req, res) => {
  const categories = await getTransactionCategories()
  return success(res, categories)
}))

router.get('/:id/stats', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  const stats = await getTransactionCategoryStats(req.params.id)
  return success(res, stats)
}))

router.post('/', validateRequest(validateCategoryPayload), asyncHandler(async (req, res) => {
  const category = await createTransactionCategory(req.body)
  return success(res, category, 201)
}))

router.put('/sort/batch', validateRequest(validateBatchSort), asyncHandler(async (req, res) => {
  await updateTransactionCategorySorts(req.body.items)
  return success(res, { message: '排序更新成功' })
}))

router.put('/:id', validateRequest(validateCategoryUpdatePayload), asyncHandler(async (req, res) => {
  const category = await updateTransactionCategory(req.params.id, req.body)
  return success(res, category)
}))

router.put('/:id/move', validateRequest(validateMovePayload), asyncHandler(async (req, res) => {
  const result = await moveTransactionCategory(req.params.id, req.body.newParentId || null)
  return success(res, result)
}))

router.delete('/:id', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  const transferToCategoryId = typeof req.query.transferToCategoryId === 'string'
    ? req.query.transferToCategoryId
    : undefined
  const deleteTransactions = req.query.deleteTransactions === 'true'
  const result = await deleteTransactionCategory(req.params.id, {
    transferToCategoryId,
    deleteTransactions,
  })
  return success(res, result)
}))

export default router
