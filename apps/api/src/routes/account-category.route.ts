import { Router, type Request } from 'express'
import { asyncHandler, success, validateRequest, ValidationError, validateIdParam, validateBatchSort } from '../common/index.js'
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
}

router.get('/', asyncHandler(async (req, res) => {
  const type = typeof req.query.type === 'string' ? req.query.type : undefined
  const categories = await getAccountCategories({ type })
  return success(res, categories)
}))

router.post('/', validateRequest(validateCategoryPayload), asyncHandler(async (req, res) => {
  const { name, type, icon, color, parentId, isCashEquivalent, isInvestment, sort } = req.body
  const category = await createAccountCategory({
    name,
    type,
    icon,
    color,
    parentId,
    isCashEquivalent,
    isInvestment,
    sort,
  })
  return success(res, category, 201)
}))

router.put('/sort/batch', validateRequest(validateBatchSort), asyncHandler(async (req, res) => {
  await updateAccountCategorySorts(req.body.items)
  return success(res, { message: '排序更新成功' })
}))

router.put('/:id', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  const { name, type, icon, color, parentId, isCashEquivalent, isInvestment, sort } = req.body
  const category = await updateAccountCategory(req.params.id, {
    name,
    type,
    icon,
    color,
    parentId,
    isCashEquivalent,
    isInvestment,
    sort,
  })
  return success(res, category)
}))

router.delete('/:id', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  const result = await deleteAccountCategory(req.params.id)
  return success(res, result)
}))

export default router
