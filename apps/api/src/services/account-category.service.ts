import { resolveAccountCategoryFlags } from '../../../../packages/domain/src/index.js'
import { NotFoundError, ValidationError, parseOptionalIconKey } from '../common/index.js'
import { getNextSort } from '../common/db.js'
import * as accountRepo from '../db/repositories/account.repository.js'
import * as accountCategoryRepo from '../db/repositories/account-category.repository.js'
import * as auditEventRepo from '../db/repositories/audit-event.repository.js'

export async function getAccountCategories(params?: { type?: string }) {
  const where: Record<string, unknown> = {}
  if (params?.type) where.type = params.type

  const [categories, allCategories] = await Promise.all([
    accountCategoryRepo.findMany({
      where,
      orderBy: [{ type: 'asc' }, { sort: 'asc' }, { createdAt: 'asc' }],
    }),
    accountCategoryRepo.findMany({
      select: { id: true, parentId: true, isCashEquivalent: true, isInvestment: true },
    }),
  ])
  const { effectiveFlags } = resolveAccountCategoryFlags(allCategories)
  return categories.map((category) => {
    const flags = effectiveFlags.get(category.id) ?? {
      isCashEquivalent: category.isCashEquivalent ?? false,
      isInvestment: category.isInvestment ?? false,
    }
    return {
      ...category,
      effectiveIsCashEquivalent: flags.isCashEquivalent,
      effectiveIsInvestment: flags.isInvestment,
    }
  })
}

export async function createAccountCategory(data: {
  id?: string
  name: string
  type: string
  parentId?: string | null
  /** 仅根节点可设置；子分类无条件忽略（运行时自动继承根节点值）。 */
  isCashEquivalent?: boolean
  /** 仅根节点可设置；子分类无条件忽略（运行时自动继承根节点值）。 */
  isInvestment?: boolean
  iconKey?: string | null
  sort?: number
}) {
  const finalSort = data.sort ?? await getNextSort('accountCategory', { type: data.type })

  // 写入端约束：计算属性只属于根分类；子分类恒为 NULL，忽略请求值。
  const isRoot = !data.parentId
  return accountCategoryRepo.create({
    data: {
      id: data.id,
      name: data.name,
      type: data.type,
      parentId: data.parentId || null,
      isCashEquivalent: isRoot ? (data.isCashEquivalent ?? false) : null,
      isInvestment: isRoot ? (data.isInvestment ?? false) : null,
      iconKey: parseOptionalIconKey(data.iconKey),
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
    /** 仅根节点可修改；子分类忽略。 */
    isCashEquivalent?: boolean
    /** 仅根节点可修改；子分类忽略。 */
    isInvestment?: boolean
    iconKey?: string | null
    sort?: number
  }
) {
  const current = await accountCategoryRepo.findById(categoryId)
  // 更新后的根/子身份：parentId 显式给出时以请求为准，否则沿用现值。
  const willBeRoot = (data.parentId !== undefined ? data.parentId : current?.parentId ?? null) === null

  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.type !== undefined) updateData.type = data.type
  if (data.parentId !== undefined) updateData.parentId = data.parentId
  if (data.iconKey !== undefined) updateData.iconKey = parseOptionalIconKey(data.iconKey)
  if (data.sort !== undefined) updateData.sort = data.sort
  if (willBeRoot) {
    if (data.isCashEquivalent !== undefined) updateData.isCashEquivalent = data.isCashEquivalent
    if (data.isInvestment !== undefined) updateData.isInvestment = data.isInvestment
  } else {
    // 变为子分类（含原本就是子分类）：计算属性恒为 NULL。
    updateData.isCashEquivalent = null
    updateData.isInvestment = null
  }

  return accountCategoryRepo.update({
    where: { id: categoryId },
    data: updateData,
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
