import { prisma } from '../index.js'
import { NotFoundError, ValidationError } from '../common/index.js'

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
  parentId?: string | null
  isCashEquivalent?: boolean
  isInvestment?: boolean
  sort?: number
}) {
  if (data.parentId) {
    const parent = await prisma.accountCategory.findUnique({
      where: { id: data.parentId },
    })
    if (!parent) {
      throw new NotFoundError('父分类')
    }
    if (parent.type !== data.type) {
      throw new ValidationError('父分类类型不匹配')
    }
  }

  const finalSort = data.sort ?? await getNextAccountCategorySort(data.type)

  return prisma.accountCategory.create({
    data: {
      name: data.name,
      type: data.type,
      icon: data.icon,
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
    icon?: string | null
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

    const parent = await prisma.accountCategory.findUnique({
      where: { id: data.parentId },
    })
    if (!parent) {
      throw new NotFoundError('父分类')
    }

    const currentCategory = await prisma.accountCategory.findUnique({
      where: { id: categoryId },
    })
    if (!currentCategory) {
      throw new NotFoundError('分类')
    }

    const targetType = data.type ?? currentCategory.type
    if (parent.type !== targetType) {
      throw new ValidationError('父分类类型不匹配')
    }
  }

  return prisma.accountCategory.update({
    where: { id: categoryId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.parentId !== undefined && { parentId: data.parentId }),
      ...(data.isCashEquivalent !== undefined && { isCashEquivalent: data.isCashEquivalent }),
      ...(data.isInvestment !== undefined && { isInvestment: data.isInvestment }),
      ...(data.sort !== undefined && { sort: data.sort }),
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
