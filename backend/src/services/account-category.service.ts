import { prisma } from '../index.js'
import { buildTree } from '../utils/tree.js'

export interface AccountCategoryWithChildren {
  id: string
  name: string
  type: string
  icon: string | null
  parentId: string | null
  isCashEquivalent: boolean
  children: AccountCategoryWithChildren[]
}

/**
 * 获取账户分类树结构
 * 
 * @param type 分类类型（asset/liability）
 * @returns 树形结构的账户分类列表
 */
export async function getAccountCategoryTree(
  type?: 'asset' | 'liability'
): Promise<AccountCategoryWithChildren[]> {
  const where = type ? { type } : {}
  const categories = await prisma.accountCategory.findMany({
    where,
    orderBy: [{ parentId: 'asc' }, { createdAt: 'asc' }],
  })
  
  return buildTree(categories) as AccountCategoryWithChildren[]
}

/**
 * 验证账户分类是否存在
 * 
 * @param categoryId 分类ID
 * @param type 期望的分类类型
 * @returns 分类是否存在
 */
export async function validateAccountCategory(
  categoryId: string,
  type?: 'asset' | 'liability'
): Promise<boolean> {
  const category = await prisma.accountCategory.findUnique({
    where: { id: categoryId },
  })
  
  if (!category) return false
  if (type && category.type !== type) return false
  
  return true
}

/**
 * 检查账户分类是否有子分类
 * 
 * @param categoryId 分类ID
 * @returns 是否有子分类
 */
export async function hasChildAccountCategories(categoryId: string): Promise<boolean> {
  const count = await prisma.accountCategory.count({
    where: { parentId: categoryId },
  })
  return count > 0
}

/**
 * 检查账户分类是否有关联的账户
 * 
 * @param categoryId 分类ID
 * @returns 是否有关联账户
 */
export async function hasRelatedAccounts(categoryId: string): Promise<boolean> {
  const count = await prisma.account.count({
    where: { categoryId },
  })
  return count > 0
}

/**
 * 获取所有现金等价物分类的ID列表
 * 
 * @returns 现金等价物分类ID列表
 */
export async function getCashEquivalentCategoryIds(): Promise<string[]> {
  const categories = await prisma.accountCategory.findMany({
    where: { isCashEquivalent: true },
    select: { id: true },
  })
  return categories.map(c => c.id)
}
