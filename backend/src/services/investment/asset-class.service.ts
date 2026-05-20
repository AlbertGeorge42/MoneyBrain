import { prisma } from '../../index.js'
import { NotFoundError, ValidationError } from '../../common/index.js'

// 获取某账户下的所有资产类型
export async function getAssetClassesByAccount(accountId: string) {
  const account = await prisma.account.findUnique({ where: { id: accountId } })
  if (!account) throw new NotFoundError('账户不存在')

  return prisma.investmentAssetClass.findMany({
    where: { accountId },
    orderBy: { sort: 'asc' },
  })
}

// 为某账户创建资产类型
export async function createAssetClass(
  accountId: string,
  data: { name: string; icon?: string; targetRatio?: number }
) {
  const account = await prisma.account.findUnique({ where: { id: accountId } })
  if (!account) throw new NotFoundError('账户不存在')

  if (!data.name?.trim()) throw new ValidationError('资产类型名称不能为空')

  // 检查名称是否重复
  const existingName = await prisma.investmentAssetClass.findFirst({
    where: { accountId, name: data.name.trim() },
  })
  if (existingName) throw new ValidationError('资产类型名称已存在')

  // 校验 targetRatio
  if (data.targetRatio !== undefined && data.targetRatio !== null) {
    if (data.targetRatio < 0 || data.targetRatio > 100) {
      throw new ValidationError('目标比例必须在 0-100 之间')
    }
  }

  // 获取当前最大 sort 值，用于追加到末尾
  const maxSort = await prisma.investmentAssetClass.findFirst({
    where: { accountId },
    orderBy: { sort: 'desc' },
    select: { sort: true },
  })

  const created = await prisma.investmentAssetClass.create({
    data: {
      accountId,
      name: data.name.trim(),
      icon: data.icon ?? null,
      targetRatio: data.targetRatio ?? null,
      sort: (maxSort?.sort ?? -1) + 1,
    },
  })

  // 校验该账户下所有资产类型 targetRatio 总和不超过 100
  await validateTargetRatioSum(accountId)

  return created
}

// 更新资产类型
export async function updateAssetClass(
  id: string,
  data: { name?: string; icon?: string; targetRatio?: number }
) {
  const existing = await prisma.investmentAssetClass.findUnique({ where: { id } })
  if (!existing) throw new NotFoundError('资产类型不存在')

  // 检查名称是否重复（如果修改了名称）
  if (data.name?.trim() && data.name.trim() !== existing.name) {
    const existingName = await prisma.investmentAssetClass.findFirst({
      where: { accountId: existing.accountId, name: data.name.trim() },
    })
    if (existingName) throw new ValidationError('资产类型名称已存在')
  }

  // 校验 targetRatio
  if (data.targetRatio !== undefined && data.targetRatio !== null) {
    if (data.targetRatio < 0 || data.targetRatio > 100) {
      throw new ValidationError('目标比例必须在 0-100 之间')
    }
  }

  const updated = await prisma.investmentAssetClass.update({
    where: { id },
    data: {
      name: data.name?.trim() ?? existing.name,
      icon: data.icon !== undefined ? data.icon : existing.icon,
      targetRatio: data.targetRatio !== undefined ? data.targetRatio : existing.targetRatio,
    },
  })

  // 校验该账户下所有资产类型 targetRatio 总和不超过 100
  await validateTargetRatioSum(existing.accountId)

  return updated
}

// 删除资产类型（检查是否被快照引用）
export async function deleteAssetClass(id: string) {
  const existing = await prisma.investmentAssetClass.findUnique({
    where: { id },
    include: { allocationItems: { take: 1 } },
  })

  if (!existing) throw new NotFoundError('资产类型不存在')

  // 检查是否被快照引用
  if (existing.allocationItems.length > 0) {
    throw new ValidationError(
      `该资产类型已被 ${existing.allocationItems.length} 条快照引用，无法删除。请先删除相关快照记录。`
    )
  }

  await prisma.investmentAssetClass.delete({ where: { id } })
  return { message: '删除成功' }
}

// 批量排序资产类型
export async function reorderAssetClasses(accountId: string, orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.investmentAssetClass.updateMany({
        where: { id, accountId },
        data: { sort: index },
      })
    )
  )
  return { message: '排序已更新' }
}

// 校验该账户下所有资产类型 targetRatio 总和不超过 100
async function validateTargetRatioSum(accountId: string) {
  const assetClasses = await prisma.investmentAssetClass.findMany({
    where: { accountId },
    select: { targetRatio: true },
  })

  const sum = assetClasses
    .filter((ac) => ac.targetRatio !== null)
    .reduce((acc, ac) => acc + (ac.targetRatio as number), 0)

  // 允许小数误差 0.01
  if (sum > 100.01) {
    throw new ValidationError(`目标比例总和（${sum.toFixed(2)}%）超过 100%`)
  }
}
