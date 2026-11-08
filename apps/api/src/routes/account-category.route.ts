import { Router, type Request } from 'express'
import { asyncHandler, success, validateRequest, ValidationError, validateIdParam, validateBatchSort, parseOptionalUuid, parseOptionalIconKey } from '../common/index.js'
import {
  getAccountCategories,
  createAccountCategory,
  updateAccountCategory,
  updateAccountCategorySorts,
  deleteAccountCategory,
} from '../services/account-category.service.js'

const router = Router()

const validateCategoryPayload = (req: Request) => {
  const { name, type } = req.body as Record<string, unknown>
  if (!name || !type) {
    throw new ValidationError('名称和类型不能为空')
  }
  parseOptionalUuid((req.body as Record<string, unknown>).id, 'id')
  parseOptionalIconKey((req.body as Record<string, unknown>).iconKey)
}

const validateCategoryUpdatePayload = (req: Request) => {
  validateIdParam(req)
  parseOptionalIconKey((req.body as Record<string, unknown>).iconKey)
}

router.get('/', asyncHandler(async (req, res) => {
  const type = typeof req.query.type === 'string' ? req.query.type : undefined
  const categories = await getAccountCategories({ type })
  return success(res, categories)
}))

router.post('/', validateRequest(validateCategoryPayload), asyncHandler(async (req, res) => {
  const { id, name, type, parentId, isCashEquivalent, isInvestment, iconKey, sort } = req.body
  const category = await createAccountCategory({
    id,
    name,
    type,
    parentId,
    isCashEquivalent,
    isInvestment,
    iconKey,
    sort,
  })
  return success(res, category, 201)
}))

router.put('/sort/batch', validateRequest(validateBatchSort), asyncHandler(async (req, res) => {
  await updateAccountCategorySorts(req.body.items)
  return success(res, { message: '排序更新成功' })
}))

router.put('/:id', validateRequest(validateCategoryUpdatePayload), asyncHandler(async (req, res) => {
  const { name, type, parentId, isCashEquivalent, isInvestment, iconKey, sort } = req.body
  const category = await updateAccountCategory(req.params.id, {
    name,
    type,
    parentId,
    isCashEquivalent,
    isInvestment,
    iconKey,
    sort,
  })
  return success(res, category)
}))

router.delete('/:id', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  const result = await deleteAccountCategory(req.params.id)
  return success(res, result)
}))

export default router
