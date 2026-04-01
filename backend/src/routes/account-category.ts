import { Router, type Request } from 'express'
import { prisma } from '../index.js'
import { success } from '../utils/response.js'
import { getNextAccountCategorySort } from '../services/sort.service.js'
import { ValidationError } from '../errors/index.js'
import { asyncHandler } from '../utils/async-handler.js'
import { validateRequest } from '../middleware/validate-request.js'

const router = Router()

const hasValue = (value: unknown) => value !== undefined && value !== null && value !== ''

const validateIdParam = (req: Request) => {
  if (!hasValue(req.params.id)) {
    throw new ValidationError('id不能为空')
  }
}

const validateCategoryPayload = (req: Request) => {
  const { name, type } = req.body as Record<string, unknown>
  if (!hasValue(name) || !hasValue(type)) {
    throw new ValidationError('名称和类型不能为空')
  }
}

const validateBatchSort = (req: Request) => {
  if (!Array.isArray(req.body?.items)) {
    throw new ValidationError('参数格式错误')
  }
}

router.get('/', asyncHandler(async (_req, res) => {
  const categories = await prisma.accountCategory.findMany({
    orderBy: [{ type: 'asc' }, { sort: 'asc' }, { createdAt: 'asc' }],
  })
  return success(res, categories)
}))

router.post('/', validateRequest(validateCategoryPayload), asyncHandler(async (req, res) => {
  const { name, type, icon, isCashEquivalent, isInvestment, sort } = req.body

  let finalSort = sort
  if (finalSort === undefined || finalSort === null) {
    finalSort = await getNextAccountCategorySort(type)
  }

  const category = await prisma.accountCategory.create({
    data: {
      name,
      type,
      icon,
      isCashEquivalent: isCashEquivalent ?? false,
      isInvestment: isInvestment ?? false,
      sort: finalSort,
    },
  })
  return success(res, category, 201)
}))

router.put('/sort/batch', validateRequest(validateBatchSort), asyncHandler(async (req, res) => {
  await prisma.$transaction(
    req.body.items.map((item: { id: string; sort: number }) =>
      prisma.accountCategory.update({
        where: { id: item.id },
        data: { sort: item.sort },
      })
    )
  )

  return success(res, { message: '排序更新成功' })
}))

router.put('/:id', validateRequest((req) => {
  validateIdParam(req)
  validateCategoryPayload(req)
}), asyncHandler(async (req, res) => {
  const { name, type, icon, isCashEquivalent, isInvestment, sort } = req.body
  const category = await prisma.accountCategory.update({
    where: { id: req.params.id },
    data: { name, type, icon, isCashEquivalent, isInvestment, sort },
  })
  return success(res, category)
}))

router.delete('/:id', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  const accountsCount = await prisma.account.count({
    where: { categoryId: req.params.id },
  })
  if (accountsCount > 0) {
    throw new ValidationError('该分类下存在账户，无法删除')
  }
  await prisma.accountCategory.delete({ where: { id: req.params.id } })
  return success(res, { message: '删除成功' })
}))

export default router
