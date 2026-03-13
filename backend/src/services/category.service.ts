import { prisma } from '../index.js'
import { buildTree } from '../utils/tree.js'

export interface CategoryWithChildren {
  id: string
  name: string
  type: string
  icon: string | null
  parentId: string | null
  cashFlowType: string | null
  children: CategoryWithChildren[]
}

/**
 * 获取分类树结构
 * 
 * @param type 分类类型（income/expense）
 * @returns 树形结构的分类列表
 */
export async function getCategoryTree(type?: 'income' | 'expense'): Promise<CategoryWithChildren[]> {
  const where = type ? { type } : {}
  const categories = await prisma.category.findMany({
    where,
    orderBy: [{ parentId: 'asc' }, { createdAt: 'asc' }],
  })
  
  return buildTree(categories) as CategoryWithChildren[]
}

/**
 * 验证分类是否存在
 * 
 * @param categoryId 分类ID
 * @param type 期望的分类类型
 * @returns 分类是否存在
 */
export async function validateCategory(
  categoryId: string,
  type?: 'income' | 'expense'
): Promise<boolean> {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
  })
  
  if (!category) return false
  if (type && category.type !== type) return false
  
  return true
}

/**
 * 检查分类是否有子分类
 * 
 * @param categoryId 分类ID
 * @returns 是否有子分类
 */
export async function hasChildCategories(categoryId: string): Promise<boolean> {
  const count = await prisma.category.count({
    where: { parentId: categoryId },
  })
  return count > 0
}

/**
 * 检查分类是否有关联的交易
 * 
 * @param categoryId 分类ID
 * @returns 是否有关联交易
 */
export async function hasRelatedTransactions(categoryId: string): Promise<boolean> {
  const count = await prisma.transaction.count({
    where: { categoryId },
  })
  return count > 0
}

/**
 * 获取分类的完整路径名称
 * 
 * @param categoryId 分类ID
 * @returns 分类路径（如 "餐饮/午餐"）
 */
export async function getCategoryPath(categoryId: string): Promise<string> {
  const parts: string[] = []
  let currentId: string | null = categoryId
  
  while (currentId) {
    type CategorySelect = { name: string; parentId: string | null }
    const cat: CategorySelect | null = await prisma.category.findUnique({
      where: { id: currentId },
      select: { name: true, parentId: true },
    })
    
    if (!cat) break
    parts.unshift(cat.name)
    currentId = cat.parentId
  }
  
  return parts.join('/')
}
