import { withTransaction } from '../db/transaction.js'
import { NotFoundError, ValidationError } from '../common/index.js'
import { getNextSort } from '../common/db.js'
import * as auditEventRepo from '../db/repositories/audit-event.repository.js'
import * as transactionCategoryRepo from '../db/repositories/transaction-category.repository.js'
import * as transactionRepo from '../db/repositories/transaction.repository.js'

type TransactionCategoryCreatePayload = {
  name: string
  type: string
  icon?: string | null
  color?: string | null
  parentId?: string | null
  cashFlowType?: string | null
  sort?: number | null
}

type TransactionCategoryUpdatePayload = {
  name?: string
  type?: string
  icon?: string | null
  color?: string | null
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

export async function getTransactionCategories(params?: { type?: string }) {
  const where: Record<string, unknown> = {}
  if (params?.type) where.type = params.type

  return transactionCategoryRepo.findMany({
    where,
    orderBy: [{ type: 'asc' }, { sort: 'asc' }, { createdAt: 'asc' }],
  })
}

export async function getTransactionCategoryStats(categoryId: string) {
  const [transactionCount, childrenCount] = await Promise.all([
    // 展示口径只统计未删除交易
    transactionRepo.countActive({ categoryId }),
    transactionCategoryRepo.count({ parentId: categoryId }),
  ])

  return { transactionCount, childrenCount }
}

export async function createTransactionCategory(data: TransactionCategoryCreatePayload) {
  if (data.parentId) {
    const parent = await transactionCategoryRepo.findById(data.parentId)
    if (!parent) {
      throw new NotFoundError('父分类')
    }
    if (parent.type !== data.type) {
      throw new ValidationError('父分类类型不匹配')
    }
  }

  const finalSort = data.sort ?? await getNextSort('transactionCategory', { type: data.type, parentId: data.parentId || null })

  return transactionCategoryRepo.create({
    data: {
      name: data.name,
      type: data.type,
      icon: data.icon,
      color: data.color,
      parentId: data.parentId || null,
      cashFlowType: data.cashFlowType,
      sort: finalSort,
    },
  })
}

export async function updateTransactionCategorySorts(items: TransactionCategorySortItem[]): Promise<void> {
  await transactionCategoryRepo.updateSorts(items)
}

export async function updateTransactionCategory(categoryId: string, data: TransactionCategoryUpdatePayload) {
  if (data.parentId !== undefined && data.parentId !== null) {
    if (data.parentId === categoryId) {
      throw new ValidationError('父分类不能是自己')
    }

    const parent = await transactionCategoryRepo.findById(data.parentId)
    if (!parent) {
      throw new NotFoundError('父分类')
    }

    const currentCategory = await transactionCategoryRepo.findById(categoryId)
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
    color?: string | null
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
  if (data.color !== undefined) {
    updateData.color = data.color
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

  return transactionCategoryRepo.update({
    where: { id: categoryId },
    data: updateData,
  })
}

export async function moveTransactionCategory(categoryId: string, newParentId: string | null) {
  const category = await transactionCategoryRepo.findByIdWithChildren(categoryId)
  if (!category) {
    throw new NotFoundError('分类')
  }

  if (newParentId) {
    const isChild = await checkIsChildCategory(categoryId, newParentId)
    if (isChild) {
      throw new ValidationError('不能移动到自己的子分类下')
    }

    const newParent = await transactionCategoryRepo.findById(newParentId)
    if (!newParent) {
      throw new ValidationError('目标父分类不存在')
    }
    if (newParent.type !== category.type) {
      throw new ValidationError('目标父分类类型不匹配')
    }
  }

  const siblings = await transactionCategoryRepo.findMany({
    where: { parentId: newParentId || null, type: category.type },
    orderBy: { sort: 'desc' },
    take: 1,
  })
  const newSort = siblings.length > 0 ? siblings[0].sort + 1 : 0

  const movedCategory = await transactionCategoryRepo.update({
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

  const category = await transactionCategoryRepo.findByIdWithChildren(categoryId)
  if (!category) {
    throw new NotFoundError('分类')
  }

  if (category.children.length > 0) {
    throw new ValidationError('该分类下存在子分类，无法删除')
  }

  // 删除校验不过滤软删除：回收站里的交易仍引用本分类，恢复时要能对上
  const transactionsCount = await transactionRepo.countIncludingDeleted({ categoryId })

  if (transactionsCount === 0) {
    await transactionCategoryRepo.deleteById(categoryId)
    await auditEventRepo.createAuditEvent(
      { entity: 'transaction_category', entityId: categoryId, action: 'deleted', before: category },
    )
    return { message: '删除成功', deletedCategory: category.name }
  }

  if (deleteTransactions) {
    const deletedTransactions = await withTransaction(async (tx) => {
      const deleted = await transactionRepo.deleteManyWhere({ categoryId }, tx)
      await transactionCategoryRepo.deleteById(categoryId, tx)
      await auditEventRepo.createAuditEvent(
        { entity: 'transaction_category', entityId: categoryId, action: 'deleted', before: category },
        tx,
      )
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

    const targetCategory = await transactionCategoryRepo.findById(transferToCategoryId)
    if (!targetCategory) {
      throw new ValidationError('目标分类不存在')
    }
    if (targetCategory.type !== category.type) {
      throw new ValidationError('目标分类类型不匹配')
    }

    const transferredTransactions = await withTransaction(async (tx) => {
      // 含回收站里的交易一并转移，避免分类删除后悬挂 categoryId
      const updated = await transactionRepo.transferCategoryTo(categoryId, transferToCategoryId, tx)
      await transactionCategoryRepo.deleteById(categoryId, tx)
      await auditEventRepo.createAuditEvent(
        { entity: 'transaction_category', entityId: categoryId, action: 'deleted', before: category },
        tx,
      )
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
  const target = await transactionCategoryRepo.findById(targetId)
  if (!target || !target.parentId) {
    return false
  }
  if (target.parentId === parentId) {
    return true
  }
  return checkIsChildCategory(parentId, target.parentId)
}
