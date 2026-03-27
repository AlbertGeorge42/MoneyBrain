import { prisma } from '../index.js'
import { buildTree } from '../utils/tree.js'

export interface TransactionCategoryWithChildren {
  id: string
  name: string
  type: string
  icon: string | null
  parentId: string | null
  cashFlowType: string | null
  children: TransactionCategoryWithChildren[]
}

export async function getTransactionCategoryTree(type?: 'income' | 'expense'): Promise<TransactionCategoryWithChildren[]> {
  const where = type ? { type } : {}
  const categories = await prisma.transactionCategory.findMany({
    where,
    orderBy: [{ parentId: 'asc' }, { createdAt: 'asc' }],
  })
  
  return buildTree(categories) as TransactionCategoryWithChildren[]
}

export async function validateTransactionCategory(
  categoryId: string,
  type?: 'income' | 'expense'
): Promise<boolean> {
  const category = await prisma.transactionCategory.findUnique({
    where: { id: categoryId },
  })
  
  if (!category) return false
  if (type && category.type !== type) return false
  
  return true
}

export async function hasChildTransactionCategories(categoryId: string): Promise<boolean> {
  const count = await prisma.transactionCategory.count({
    where: { parentId: categoryId },
  })
  return count > 0
}

export async function hasRelatedTransactions(categoryId: string): Promise<boolean> {
  const count = await prisma.transaction.count({
    where: { categoryId },
  })
  return count > 0
}

export async function getTransactionCategoryPath(categoryId: string): Promise<string> {
  const parts: string[] = []
  let currentId: string | null = categoryId
  
  while (currentId) {
    type CategorySelect = { name: string; parentId: string | null }
    const cat: CategorySelect | null = await prisma.transactionCategory.findUnique({
      where: { id: currentId },
      select: { name: true, parentId: true },
    })
    
    if (!cat) break
    parts.unshift(cat.name)
    currentId = cat.parentId
  }
  
  return parts.join('/')
}
