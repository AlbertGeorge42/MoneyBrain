import { prisma } from '../index.js'
import { NotFoundError, ValidationError } from '../common/index.js'

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

type TransactionCategoryCreatePayload = {
  name: string
  type: string
  icon?: string | null
  parentId?: string | null
  cashFlowType?: string | null
  sort?: number | null
}

type TransactionCategoryUpdatePayload = {
  name?: string
  type?: string
  icon?: string | null
  parentId?: string | null
  cashFlowType?: string | null
  sort?: number | null
}

type TransactionCategorySortItem = {
  id: string
  sort: number
  parentId: string | null
}

type DeleteTransactionCategoryOptions = {
  transferToCategoryId?: string
  deleteTransactions?: boolean
}

export async function getTransactionCategories() {
  return prisma.transactionCategory.findMany({
    orderBy: [{ type: 'asc' }, { sort: 'asc' }, { createdAt: 'asc' }],
  })
}

export async function getTransactionCategoryStats(categoryId: string) {
  const [transactionCount, childrenCount] = await Promise.all([
    prisma.transaction.count({ where: { categoryId } }),
    prisma.transactionCategory.count({ where: { parentId: categoryId } }),
  ])

  return { transactionCount, childrenCount }
}

export async function createTransactionCategory(data: TransactionCategoryCreatePayload) {
  if (data.parentId) {
    const parent = await prisma.transactionCategory.findUnique({
      where: { id: data.parentId },
    })
    if (!parent) {
      throw new NotFoundError('父分类')
    }
    if (parent.type !== data.type) {
      throw new ValidationError('父分类类型不匹配')
    }
  }

  const finalSort = data.sort ?? await getNextTransactionCategorySort(data.type, data.parentId || null)

  return prisma.transactionCategory.create({
    data: {
      name: data.name,
      type: data.type,
      icon: data.icon,
      parentId: data.parentId || null,
      cashFlowType: data.cashFlowType,
      sort: finalSort,
    },
  })
}

export async function updateTransactionCategorySorts(items: TransactionCategorySortItem[]): Promise<void> {
  await prisma.$transaction(
    items.map((item) =>
      prisma.transactionCategory.update({
        where: { id: item.id },
        data: { sort: item.sort, parentId: item.parentId },
      })
    )
  )
}

export async function updateTransactionCategory(categoryId: string, data: TransactionCategoryUpdatePayload) {
  if (data.parentId !== undefined && data.parentId !== null) {
    if (data.parentId === categoryId) {
      throw new ValidationError('父分类不能是自己')
    }

    const parent = await prisma.transactionCategory.findUnique({
      where: { id: data.parentId },
    })
    if (!parent) {
      throw new NotFoundError('父分类')
    }

    const currentCategory = await prisma.transactionCategory.findUnique({
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

  const updateData: {
    name?: string
    type?: string
    icon?: string | null
    parentId?: string | null
    cashFlowType?: string | null
    sort?: number
  } = {}

  if (data.name !== undefined) {
    updateData.name = data.name
  }
  if (data.type !== undefined) {
    updateData.type = data.type
  }
  if (data.icon !== undefined) {
    updateData.icon = data.icon
  }
  if (data.parentId !== undefined) {
    updateData.parentId = data.parentId
  }
  if (data.cashFlowType !== undefined) {
    updateData.cashFlowType = data.cashFlowType
  }
  if (data.sort !== undefined && data.sort !== null) {
    updateData.sort = data.sort
  }

  return prisma.transactionCategory.update({
    where: { id: categoryId },
    data: updateData,
  })
}

export async function moveTransactionCategory(categoryId: string, newParentId: string | null) {
  const category = await prisma.transactionCategory.findUnique({
    where: { id: categoryId },
    include: { children: true },
  })
  if (!category) {
    throw new NotFoundError('分类')
  }

  if (newParentId) {
    const isChild = await checkIsChildCategory(categoryId, newParentId)
    if (isChild) {
      throw new ValidationError('不能移动到自己的子分类下')
    }

    const newParent = await prisma.transactionCategory.findUnique({
      where: { id: newParentId },
    })
    if (!newParent) {
      throw new ValidationError('目标父分类不存在')
    }
    if (newParent.type !== category.type) {
      throw new ValidationError('目标父分类类型不匹配')
    }
  }

  const siblings = await prisma.transactionCategory.findMany({
    where: { parentId: newParentId || null, type: category.type },
    orderBy: { sort: 'desc' },
    take: 1,
  })
  const newSort = siblings.length > 0 ? siblings[0].sort + 1 : 0

  const movedCategory = await prisma.transactionCategory.update({
    where: { id: categoryId },
    data: { parentId: newParentId || null, sort: newSort },
  })

  return {
    message: '移动成功',
    movedCategory,
  }
}

export async function deleteTransactionCategory(
  categoryId: string,
  options: DeleteTransactionCategoryOptions,
) {
  const { transferToCategoryId, deleteTransactions = false } = options

  const category = await prisma.transactionCategory.findUnique({
    where: { id: categoryId },
    include: { children: true },
  })
  if (!category) {
    throw new NotFoundError('分类')
  }

  if (category.children.length > 0) {
    throw new ValidationError('该分类下存在子分类，无法删除')
  }

  const transactionsCount = await prisma.transaction.count({
    where: { categoryId },
  })

  if (transactionsCount === 0) {
    await prisma.transactionCategory.delete({ where: { id: categoryId } })
    return { message: '删除成功', deletedCategory: category.name }
  }

  if (deleteTransactions) {
    const deletedTransactions = await prisma.$transaction(async (tx) => {
      const deleted = await tx.transaction.deleteMany({
        where: { categoryId },
      })
      await tx.transactionCategory.delete({ where: { id: categoryId } })
      return deleted.count
    })

    return {
      message: '删除成功',
      deletedCategory: category.name,
      deletedTransactions,
    }
  }

  if (transferToCategoryId) {
    if (transferToCategoryId === categoryId) {
      throw new ValidationError('不能转移到自己')
    }

    const targetCategory = await prisma.transactionCategory.findUnique({
      where: { id: transferToCategoryId },
    })
    if (!targetCategory) {
      throw new ValidationError('目标分类不存在')
    }
    if (targetCategory.type !== category.type) {
      throw new ValidationError('目标分类类型不匹配')
    }

    const transferredTransactions = await prisma.$transaction(async (tx) => {
      const updated = await tx.transaction.updateMany({
        where: { categoryId },
        data: { categoryId: transferToCategoryId },
      })
      await tx.transactionCategory.delete({ where: { id: categoryId } })
      return updated.count
    })

    return {
      message: '删除成功',
      deletedCategory: category.name,
      transferredTransactions,
    }
  }

  throw new ValidationError('该分类下存在交易记录，请选择转移或删除交易')
}

async function checkIsChildCategory(parentId: string, targetId: string): Promise<boolean> {
  const target = await prisma.transactionCategory.findUnique({
    where: { id: targetId },
    select: { parentId: true },
  })
  if (!target || !target.parentId) {
    return false
  }
  if (target.parentId === parentId) {
    return true
  }
  return checkIsChildCategory(parentId, target.parentId)
}
