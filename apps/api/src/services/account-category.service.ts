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
  parentId?: string | null
  isCashEquivalent?: boolean
  isInvestment?: boolean
  sort?: number
}) {
  const finalSort = data.sort ?? await getNextSort('accountCategory', { type: data.type })

  return accountCategoryRepo.create({
    data: {
      id: data.id,
      name: data.name,
      type: data.type,
      parentId: data.parentId || null,
      isCashEquivalent: data.isCashEquivalent ?? false,
      isInvestment: data.isInvestment ?? false,
      sort: finalSort,
    },
  })
}

export async function updateAccountCategory(
  categoryId: string,
  data: {
    name?: string
    type?: string
    parentId?: string | null
    isCashEquivalent?: boolean
    isInvestment?: boolean
    sort?: number
  }
) {
  return accountCategoryRepo.update({
    where: { id: categoryId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.type !== undefined && { type: data.type }),
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
