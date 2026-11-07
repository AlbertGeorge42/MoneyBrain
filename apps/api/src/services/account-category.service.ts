import { NotFoundError, ValidationError } from '../common/index.js'
import { getNextSort } from '../common/db.js'
import * as accountRepo from '../db/repositories/account.repository.js'
import * as accountCategoryRepo from '../db/repositories/account-category.repository.js'
import * as auditEventRepo from '../db/repositories/audit-event.repository.js'

export async function getAccountCategories(params?: { type?: string }) {
  const where: Record<string, unknown> = {}
  if (params?.type) where.type = params.type

  return accountCategoryRepo.findMany({
    where,
    orderBy: [{ type: 'asc' }, { sort: 'asc' }, { createdAt: 'asc' }],
  })
}

export async function createAccountCategory(data: {
  id?: string
  name: string
  type: string
  icon?: string | null
  color?: string | null
  parentId?: string | null
  isCashEquivalent?: boolean
  isInvestment?: boolean
  sort?: number
}) {
  let parentCashEquivalent = false
  let parentInvestment = false
  if (data.parentId) {
    const parent = await accountCategoryRepo.findById(data.parentId)
    if (!parent) {
      throw new NotFoundError('父分类')
    }
    if (parent.type !== data.type) {
      throw new ValidationError('父分类类型不匹配')
    }
    parentCashEquivalent = parent.isCashEquivalent
    parentInvestment = parent.isInvestment
  }

  const finalSort = data.sort ?? await getNextSort('accountCategory', { type: data.type })

  return accountCategoryRepo.create({
    data: {
      id: data.id,
      name: data.name,
      type: data.type,
      icon: data.icon,
      color: data.color,
      parentId: data.parentId || null,
      // 二级继承父级的现金等价 / 投资标记，避免新账户落位后口径静默变化。
      isCashEquivalent: data.isCashEquivalent ?? parentCashEquivalent,
      isInvestment: data.isInvestment ?? parentInvestment,
      sort: finalSort,
    },
  })
}

export async function updateAccountCategory(
  categoryId: string,
  data: {
    name?: string
    type?: string
    icon?: string | null
    color?: string | null
    parentId?: string | null
    isCashEquivalent?: boolean
    isInvestment?: boolean
    sort?: number
  }
) {
  if (data.parentId !== undefined && data.parentId !== null) {
    if (data.parentId === categoryId) {
      throw new ValidationError('父分类不能是自己')
    }

    const parent = await accountCategoryRepo.findById(data.parentId)
    if (!parent) {
      throw new NotFoundError('父分类')
    }

    const currentCategory = await accountCategoryRepo.findById(categoryId)
    if (!currentCategory) {
      throw new NotFoundError('分类')
    }

    const targetType = data.type ?? currentCategory.type
    if (parent.type !== targetType) {
      throw new ValidationError('父分类类型不匹配')
    }
  }

  return accountCategoryRepo.update({
    where: { id: categoryId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.parentId !== undefined && { parentId: data.parentId }),
      ...(data.isCashEquivalent !== undefined && { isCashEquivalent: data.isCashEquivalent }),
      ...(data.isInvestment !== undefined && { isInvestment: data.isInvestment }),
      ...(data.sort !== undefined && { sort: data.sort }),
    },
  })
}

export async function updateAccountCategorySorts(items: Array<{ id: string; sort: number }>): Promise<void> {
  await accountCategoryRepo.updateSorts(items)
}

export async function deleteAccountCategory(categoryId: string) {
  const accountsCount = await accountRepo.count({ categoryId })
  if (accountsCount > 0) {
    throw new ValidationError('该分类下存在账户，无法删除')
  }
  const childrenCount = await accountCategoryRepo.count({ parentId: categoryId })
  if (childrenCount > 0) {
    throw new ValidationError('该分类下存在子分类，无法删除')
  }
  const category = await accountCategoryRepo.findById(categoryId)
  if (!category) {
    throw new NotFoundError('分类')
  }
  await accountCategoryRepo.deleteById(categoryId)
  await auditEventRepo.createAuditEvent(
    { entity: 'account_category', entityId: categoryId, action: 'deleted', before: category },
  )
  return { message: '删除成功' }
}
