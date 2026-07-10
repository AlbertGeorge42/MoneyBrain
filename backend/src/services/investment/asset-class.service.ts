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

  // 先校验该账户下所有资产类型 targetRatio 总和不超过 100（包含新增的值）
  if (data.targetRatio !== undefined && data.targetRatio !== null) {
    const assetClasses = await prisma.investmentAssetClass.findMany({
      where: { accountId },
      select: { targetRatio: true },
    })

    const sum = assetClasses
      .filter(ac => ac.targetRatio !== null)
      .reduce((acc, ac) => acc + ac.targetRatio!, 0) + data.targetRatio

    // 允许小数误差 0.01
    if (sum > 100.01) {
      throw new ValidationError(`目标比例总和（${sum.toFixed(2)}%）超过 100%`)
    }
  }

  // 获取当前最大 sort 值，用于追加到末尾
  const maxSort = await prisma.investmentAssetClass.findFirst({
    where: { accountId },
    orderBy: { sort: 'desc' },
    select: { sort: true },
  })

  // 校验通过后，执行数据库创建操作
  const created = await prisma.investmentAssetClass.create({
    data: {
      accountId,
      name: data.name.trim(),
      icon: data.icon ?? null,
      targetRatio: data.targetRatio ?? null,
      sort: (maxSort?.sort ?? -1) + 1,
    },
  })

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

  // 先校验该账户下所有资产类型 targetRatio 总和不超过 100（使用更新后的值）
  const newTargetRatio = data.targetRatio !== undefined ? data.targetRatio : existing.targetRatio
  if (newTargetRatio !== null) {
    const assetClasses = await prisma.investmentAssetClass.findMany({
      where: { accountId: existing.accountId },
      select: { id: true, targetRatio: true },
    })

    const sum = assetClasses
      .filter(ac => ac.targetRatio !== null)
      .map(ac => ac.id === id ? newTargetRatio : ac.targetRatio!)
      .reduce((acc, ratio) => acc + ratio, 0)

    // 允许小数误差 0.01
    if (sum > 100.01) {
      throw new ValidationError(`目标比例总和（${sum.toFixed(2)}%）超过 100%`)
    }
  }

  // 校验通过后，执行数据库更新操作
  const updated = await prisma.investmentAssetClass.update({
    where: { id },
    data: {
      name: data.name?.trim() ?? existing.name,
      icon: data.icon !== undefined ? data.icon : existing.icon,
      targetRatio: data.targetRatio !== undefined ? data.targetRatio : existing.targetRatio,
    },
  })

  return updated
}

// 删除资产类型（检查是否被快照引用）
export async function deleteAssetClass(id: string, forceDelete = false) {
  const existing = await prisma.investmentAssetClass.findUnique({
    where: { id },
    include: {
      allocationItems: {
        include: {
          snapshot: {
            include: {
              items: true,
            },
          },
        },
      },
    },
  })

  if (!existing) throw new NotFoundError('资产类型不存在')

  // 检查是否被快照引用
  const snapshotsCount = existing.allocationItems.length

  // 如果有快照引用且未强制删除，返回快照数量信息（需要二次确认）
  if (!forceDelete && snapshotsCount > 0) {
    return {
      message: '需要二次确认',
      snapshotsCount,
      needConfirm: true,
    }
  }

  // 强制删除：删除相关快照记录和资产类型
  if (forceDelete && snapshotsCount > 0) {
    await prisma.$transaction(async (tx) => {
      // 找出所有受影响的快照ID
      const affectedSnapshotIds = existing.allocationItems.map(item => item.snapshotId)

      // 删除所有引用该资产类型的明细项
      await tx.investmentAllocationItem.deleteMany({
        where: { assetClassId: id },
      })

      // 检查每个受影响的快照是否还有其他明细项
      for (const snapshotId of affectedSnapshotIds) {
        const remainingItems = await tx.investmentAllocationItem.count({
          where: { snapshotId },
        })

        // 如果快照没有剩余明细项，删除整个快照
        if (remainingItems === 0) {
          await tx.investmentAllocationSnapshot.delete({
            where: { id: snapshotId },
          })
        }
      }

      // 删除资产类型
      await tx.investmentAssetClass.delete({ where: { id } })
    })
  } else {
    await prisma.investmentAssetClass.delete({ where: { id } })
  }

  return {
    message: '删除成功',
    deletedSnapshots: snapshotsCount,
  }
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
