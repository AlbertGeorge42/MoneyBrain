import { prisma } from '../index.js'

export async function getNextAccountCategorySort(type: string): Promise<number> {
  const maxSortResult = await prisma.accountCategory.aggregate({
    where: { type },
    _max: { sort: true },
  })

  return (maxSortResult._max.sort ?? -1) + 1
}

export async function getAccountCategories() {
  return prisma.accountCategory.findMany({
    orderBy: [{ type: 'asc' }, { sort: 'asc' }, { createdAt: 'asc' }],
  })
}

export async function createAccountCategory(data: {
  name: string
  type: string
  icon?: string | null
  isCashEquivalent?: boolean
  isInvestment?: boolean
  sort?: number
}) {
  const finalSort = data.sort ?? await getNextAccountCategorySort(data.type)

  return prisma.accountCategory.create({
    data: {
      name: data.name,
      type: data.type,
      icon: data.icon,
      isCashEquivalent: data.isCashEquivalent ?? false,
      isInvestment: data.isInvestment ?? false,
      sort: finalSort,
    },
  })
}

export async function updateAccountCategory(
  categoryId: string,
  data: {
    name: string
    type: string
    icon?: string | null
    isCashEquivalent?: boolean
    isInvestment?: boolean
    sort?: number
  }
) {
  return prisma.accountCategory.update({
    where: { id: categoryId },
    data: {
      name: data.name,
      type: data.type,
      icon: data.icon,
      isCashEquivalent: data.isCashEquivalent,
      isInvestment: data.isInvestment,
      sort: data.sort,
    },
  })
}

export async function updateAccountCategorySorts(items: Array<{ id: string; sort: number }>): Promise<void> {
  await prisma.$transaction(
    items.map(item =>
      prisma.accountCategory.update({
        where: { id: item.id },
        data: { sort: item.sort },
      })
    )
  )
}

export async function deleteAccountCategory(categoryId: string) {
  const accountsCount = await prisma.account.count({
    where: { categoryId },
  })
  if (accountsCount > 0) {
    throw new Error('该分类下存在账户，无法删除')
  }
  await prisma.accountCategory.delete({ where: { id: categoryId } })
  return { message: '删除成功' }
}
