import { prisma } from '../index.js'

export async function getNextAccountCategorySort(type: string): Promise<number> {
  const maxSortResult = await prisma.accountCategory.aggregate({
    where: { type },
    _max: { sort: true },
  })

  return (maxSortResult._max.sort ?? -1) + 1
}

export async function getNextTransactionCategorySort(
  type: string,
  parentId: string | null,
): Promise<number> {
  const maxSortResult = await prisma.transactionCategory.aggregate({
    where: { type, parentId: parentId || null },
    _max: { sort: true },
  })

  return (maxSortResult._max.sort ?? -1) + 1
}

export async function getNextAccountSort(categoryId: string | null): Promise<number> {
  const maxSortResult = await prisma.account.aggregate({
    where: { categoryId: categoryId || null },
    _max: { sort: true },
  })

  return (maxSortResult._max.sort ?? -1) + 1
}