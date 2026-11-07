import { withTransaction } from '../../db/transaction.js'
import { NotFoundError, ValidationError, rootLogger } from '../../common/index.js'
import * as accountRepo from '../../db/repositories/account.repository.js'
import * as assetClassRepo from '../../db/repositories/investment-asset-class.repository.js'
import * as snapshotRepo from '../../db/repositories/investment-allocation-snapshot.repository.js'
import * as allocationItemRepo from '../../db/repositories/investment-allocation-item.repository.js'

const logger = rootLogger.child({ module: 'asset-class' })

// 校验 targetRatio 范围（百分比，不是金额）
function validateTargetRatio(targetRatio: number | null | undefined): void {
  if (targetRatio == null) return
  if (targetRatio < 0 || targetRatio > 100) {
    throw new ValidationError('目标比例必须在 0-100 之间')
  }
}

// 获取某账户下的所有资产类型
export async function getAssetClassesByAccount(accountId: string) {
  const account = await accountRepo.findById(accountId)
  if (!account) throw new NotFoundError('账户不存在')

  return assetClassRepo.findMany({
    where: { accountId },
    orderBy: { sort: 'asc' },
  })
}

// 为某账户创建资产类型
export async function createAssetClass(
  accountId: string,
  data: { name: string; targetRatio?: number }
) {
  const account = await accountRepo.findById(accountId)
  if (!account) throw new NotFoundError('账户不存在')

  if (!data.name?.trim()) throw new ValidationError('资产类型名称不能为空')

  // 检查名称是否重复
  const existingName = await assetClassRepo.findFirst({
    where: { accountId, name: data.name.trim() },
  })
  if (existingName) throw new ValidationError('资产类型名称已存在')

  // 校验 targetRatio
  validateTargetRatio(data.targetRatio)

  // 先校验该账户下所有资产类型 targetRatio 总和不超过 100（包含新增的值）
  if (data.targetRatio !== undefined && data.targetRatio !== null) {
    const assetClasses = await assetClassRepo.findMany({
      where: { accountId },
      select: { targetRatio: true },
    })

    const sum = assetClasses
      .filter(ac => ac.targetRatio !== null)
      .reduce((acc, ac) => acc + Number(ac.targetRatio), 0) + Number(data.targetRatio)

    // 允许小数误差 0.01
    if (sum > 100.01) {
      throw new ValidationError(`目标比例总和（${sum.toFixed(2)}%）超过 100%`)
    }
  }

  // 获取当前最大 sort 值，用于追加到末尾
  const maxSort = await assetClassRepo.findFirst({
    where: { accountId },
    orderBy: { sort: 'desc' },
    select: { sort: true },
  })

  // 校验通过后，执行数据库创建操作
  const created = await assetClassRepo.create({
    data: {
      accountId,
      name: data.name.trim(),
      targetRatio: data.targetRatio ?? null,
      sort: (maxSort?.sort ?? -1) + 1,
    },
  })

  logger.info({ action: 'create', accountId, assetClassId: created.id }, 'asset class created')
  return created
}

// 更新资产类型
export async function updateAssetClass(
  id: string,
  data: { name?: string; targetRatio?: number }
) {
  const existing = await assetClassRepo.findById(id)
  if (!existing) throw new NotFoundError('资产类型不存在')

  // 检查名称是否重复（如果修改了名称）
  if (data.name?.trim() && data.name.trim() !== existing.name) {
    const existingName = await assetClassRepo.findFirst({
      where: { accountId: existing.accountId, name: data.name.trim() },
    })
    if (existingName) throw new ValidationError('资产类型名称已存在')
  }

  // 校验 targetRatio
  validateTargetRatio(data.targetRatio)

  // 先校验该账户下所有资产类型 targetRatio 总和不超过 100（使用更新后的值）
  const newTargetRatio = data.targetRatio !== undefined ? data.targetRatio : (existing.targetRatio == null ? null : Number(existing.targetRatio))
  if (newTargetRatio !== null) {
    const assetClasses = await assetClassRepo.findMany({
      where: { accountId: existing.accountId },
      select: { id: true, targetRatio: true },
    })

    const sum = assetClasses
      .filter(ac => ac.targetRatio !== null)
      .reduce((acc, ac) => acc + (ac.id === id ? newTargetRatio : Number(ac.targetRatio)), 0)

    // 允许小数误差 0.01
    if (sum > 100.01) {
      throw new ValidationError(`目标比例总和（${sum.toFixed(2)}%）超过 100%`)
    }
  }

  // 校验通过后，执行数据库更新操作
  const updated = await assetClassRepo.update({
    where: { id },
    data: {
      name: data.name?.trim() ?? existing.name,
      targetRatio: data.targetRatio !== undefined
        ? (data.targetRatio == null ? null : data.targetRatio)
        : existing.targetRatio,
    },
  })

  logger.info({ action: 'update', assetClassId: id }, 'asset class updated')
  return updated
}

// 删除资产类型（检查是否被快照引用）
export async function deleteAssetClass(id: string, forceDelete = false) {
  const existing = await assetClassRepo.findByIdWithAllocationItems(id)

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
    await withTransaction(async (tx) => {
      // 找出所有受影响的快照ID
      const affectedSnapshotIds = existing.allocationItems.map(item => item.snapshotId)

      // 删除所有引用该资产类型的明细项
      await allocationItemRepo.deleteManyWhere({ assetClassId: id }, tx)

      // 检查每个受影响的快照是否还有其他明细项
      for (const snapshotId of affectedSnapshotIds) {
        const remainingItems = await allocationItemRepo.count({ snapshotId }, tx)

        // 如果快照没有剩余明细项，删除整个快照
        if (remainingItems === 0) {
          await snapshotRepo.deleteById(snapshotId, tx)
        }
      }

      // 删除资产类型
      await assetClassRepo.deleteById(id, tx)
    })
  } else {
    await assetClassRepo.deleteById(id)
  }

  return {
    message: '删除成功',
    deletedSnapshots: snapshotsCount,
  }
}

// 批量排序资产类型
export async function reorderAssetClasses(accountId: string, orderedIds: string[]) {
  await assetClassRepo.reorder(accountId, orderedIds)
  return { message: '排序已更新' }
}
