import type { TransactionClient } from '../../prisma.js'
import { withTransaction } from '../../db/transaction.js'
import { calculateBalancesBatch } from '../balance.service.js'
import { NotFoundError, ValidationError, rootLogger, formatDateLocal } from '../../common/index.js'
import * as accountRepo from '../../db/repositories/account.repository.js'
import * as assetClassRepo from '../../db/repositories/investment-asset-class.repository.js'
import * as snapshotRepo from '../../db/repositories/investment-allocation-snapshot.repository.js'
import { SNAPSHOT_ITEMS_RELATIONS } from '../../db/repositories/investment-allocation-snapshot.repository.js'
import * as allocationItemRepo from '../../db/repositories/investment-allocation-item.repository.js'
import { resolvePreviousSnapshotIds } from '../../../../../packages/domain/src/index.js'

const logger = rootLogger.child({ module: 'snapshot' })

/**
 * 按日期重排某账户的 previousSnapshotId 链。
 *
 * 新增、编辑或删除中间快照后，后继快照必须指向前一条；统一重算比
 * 在每条写入路径手写“修下一个节点”更不容易漏。
 */
async function relinkSnapshots(tx: TransactionClient, accountId: string): Promise<void> {
  const snapshots = await snapshotRepo.findMany(
    {
      where: { accountId },
      select: { id: true, previousSnapshotId: true, date: true, createdAt: true },
    },
    tx,
  )

  // 排序规则只有一份（packages/domain）：同步应用后的重算与本地写入走同一条链。
  const links = resolvePreviousSnapshotIds(
    snapshots.map((snapshot) => ({
      id: snapshot.id,
      accountId,
      date: formatDateLocal(snapshot.date),
      createdAt: snapshot.createdAt.toISOString(),
    })),
  )

  for (const snapshot of snapshots) {
    const previousId = links.get(snapshot.id) ?? null
    if (snapshot.previousSnapshotId !== previousId) {
      await snapshotRepo.update(
        {
          where: { id: snapshot.id },
          data: { previousSnapshotId: previousId },
        },
        tx,
      )
    }
  }
}

// 创建/更新快照（含校验）
export async function createSnapshot(data: {
  id?: string
  accountId: string
  date: string
  items: Array<{
    assetClassId: string
    marketValue: number
    periodNetFlow?: number
  }>
  note?: string
}) {
  // 1. 校验账户存在
  const account = await accountRepo.findById(data.accountId)
  if (!account) throw new NotFoundError('账户不存在')

  // 2. 校验账户有资产类型
  const assetClasses = await assetClassRepo.findMany({
    where: { accountId: data.accountId },
  })
  if (assetClasses.length === 0) {
    throw new ValidationError('请先配置资产类型')
  }

  // 3. 校验 items 只能引用该账户下的资产类型
  const assetClassIds = new Set(assetClasses.map((ac) => ac.id))
  for (const item of data.items) {
    if (!assetClassIds.has(item.assetClassId)) {
      throw new ValidationError(`资产类型 ${item.assetClassId} 不属于该账户`)
    }
  }

  // 4. 校验同一个 assetClassId 不能重复
  const seenAssetClassIds = new Set<string>()
  for (const item of data.items) {
    if (seenAssetClassIds.has(item.assetClassId)) {
      throw new ValidationError(`资产类型 ${item.assetClassId} 重复`)
    }
    seenAssetClassIds.add(item.assetClassId)
  }

  // 5. 获取快照日的账户余额（下一天，因为 calculateBalancesBatch 使用 lt: targetDate）
  const snapshotDate = new Date(data.date + 'T00:00:00')
  const nextDay = new Date(snapshotDate)
  nextDay.setDate(nextDay.getDate() + 1)
  const balanceCache = await calculateBalancesBatch([data.accountId], [nextDay])
  const accountBalance = balanceCache.get(data.accountId, nextDay)

  // 6. 市值总和可小于账户余额；差额由投资分析展示为「未分类」，不阻断保存。

  // 7. 找到该账户在当前日期之前（严格早于当天）的最新快照
  const previousSnapshot = await snapshotRepo.findFirst({
    where: {
      accountId: data.accountId,
      date: { lt: new Date(data.date + 'T00:00:00') },
    },
    orderBy: { date: 'desc' },
    include: SNAPSHOT_ITEMS_RELATIONS,
  })

  // 8. 是否为最早一条快照
  const isEarliestSnapshot = !previousSnapshot

  // 9. 检查同日是否已有快照（upsert 逻辑）
  const existingSnapshot = await snapshotRepo.findFirst({
    where: {
      accountId: data.accountId,
      date: {
        gte: new Date(data.date + 'T00:00:00'),
        lte: new Date(data.date + 'T23:59:59.999'),
      },
    },
  })

  // 10. 写入数据库（事务中执行）
  const result = await withTransaction(async (tx) => {
    // 如果是最早一条快照，强制写入 periodNetFlow=0
    const itemsData = data.items.map((item, index) => ({
      assetClassId: item.assetClassId,
      marketValue: BigInt(item.marketValue),
      periodNetFlow: isEarliestSnapshot ? BigInt(0) : BigInt(item.periodNetFlow ?? 0),
      sort: index,
    }))

    if (existingSnapshot) {
      // 更新旧快照：先删除旧 items
      await allocationItemRepo.deleteManyWhere({ snapshotId: existingSnapshot.id }, tx)
    }

    const saved = existingSnapshot
      ? await snapshotRepo.update(
          {
            where: { id: existingSnapshot.id },
            data: {
              accountBalance: BigInt(accountBalance),
              previousSnapshotId: previousSnapshot?.id ?? null,
              note: data.note ?? null,
              items: {
                create: itemsData,
              },
            },
            include: SNAPSHOT_ITEMS_RELATIONS,
          },
          tx,
        )
      : await snapshotRepo.create(
          {
            data: {
              id: data.id,
              accountId: data.accountId,
              date: new Date(data.date + 'T00:00:00'),
              accountBalance: BigInt(accountBalance),
              previousSnapshotId: previousSnapshot?.id ?? null,
              note: data.note ?? null,
              items: {
                create: itemsData,
              },
            },
            include: SNAPSHOT_ITEMS_RELATIONS,
          },
          tx,
        )

    await relinkSnapshots(tx, data.accountId)
    return saved
  })
  logger.info({ action: 'save', date: data.date, itemCount: data.items.length }, 'snapshot saved')
  return result
}

// 获取某账户的快照列表
export async function getSnapshots(
  accountId: string,
  startDate?: string,
  endDate?: string
) {
  const where: { accountId: string; date?: { gte?: Date; lte?: Date; lt?: Date } } = { accountId }
  if (startDate) {
    where.date = { ...where.date, gte: new Date(startDate + 'T00:00:00') }
  }
  if (endDate) {
    const endExclusive = new Date(endDate + 'T00:00:00')
    endExclusive.setDate(endExclusive.getDate() + 1)
    where.date = { ...where.date, lt: endExclusive }
  }

  return snapshotRepo.findMany({
    where,
    include: SNAPSHOT_ITEMS_RELATIONS,
    orderBy: { date: 'desc' },
  })
}

// 获取某账户最近快照
export async function getLatestSnapshot(accountId: string, beforeDate?: string) {
  const where: { accountId: string; date?: { lt: Date } } = { accountId }
  if (beforeDate) {
    where.date = { lt: new Date(beforeDate + 'T00:00:00') }
  }

  return snapshotRepo.findFirst({
    where,
    include: SNAPSHOT_ITEMS_RELATIONS,
    orderBy: { date: 'desc' },
  })
}

// 删除快照，重排前后链
export async function deleteSnapshot(id: string) {
  const snapshot = await snapshotRepo.findUnique({
    where: { id },
    select: { accountId: true },
  })

  if (!snapshot) throw new NotFoundError('快照不存在')

  const result = await withTransaction(async (tx) => {
    await allocationItemRepo.deleteManyWhere({ snapshotId: id }, tx)
    const deleted = await snapshotRepo.deleteById(id, tx)
    await relinkSnapshots(tx, snapshot.accountId)
    return deleted
  })
  logger.info({ action: 'delete' }, 'snapshot deleted')
  return result
}

// 更新快照
export async function updateSnapshot(
  id: string,
  data: {
    date: string
    items: Array<{
      assetClassId: string
      marketValue: number
      periodNetFlow?: number
    }>
    note?: string
  }
) {
  const newDate = new Date(data.date + 'T00:00:00')

  const existingSnapshot = await snapshotRepo.findUnique({
    where: { id },
    include: {
      ...SNAPSHOT_ITEMS_RELATIONS,
      nextSnapshots: true,
    },
  })

  if (!existingSnapshot) throw new NotFoundError('快照不存在')

  const accountId = existingSnapshot.accountId

  const duplicate = await snapshotRepo.findFirst({
    where: { accountId, date: newDate, id: { not: id } },
    select: { id: true },
  })
  if (duplicate) {
    throw new ValidationError('该账户在该日期已有快照，请改选日期')
  }

  if (existingSnapshot.nextSnapshots.length > 0) {
    const earliestNext = existingSnapshot.nextSnapshots.reduce((earliest, s) =>
      s.date < earliest.date ? s : earliest
    )
    if (newDate >= earliestNext.date) {
      throw new ValidationError(
        `新日期不能晚于或等于后继快照日期（${formatDateLocal(earliestNext.date)}）`
      )
    }
  }

  const assetClasses = await assetClassRepo.findMany({
    where: { accountId },
  })
  if (assetClasses.length === 0) {
    throw new ValidationError('请先配置资产类型')
  }

  const assetClassIds = new Set(assetClasses.map((ac) => ac.id))
  for (const item of data.items) {
    if (!assetClassIds.has(item.assetClassId)) {
      throw new ValidationError(`资产类型 ${item.assetClassId} 不属于该账户`)
    }
  }

  const seenAssetClassIds = new Set<string>()
  for (const item of data.items) {
    if (seenAssetClassIds.has(item.assetClassId)) {
      throw new ValidationError(`资产类型 ${item.assetClassId} 重复`)
    }
    seenAssetClassIds.add(item.assetClassId)
  }

  // 5. 获取快照日的账户余额
  const snapshotDate = new Date(data.date + 'T00:00:00')
  const nextDay = new Date(snapshotDate)
  nextDay.setDate(nextDay.getDate() + 1)
  const balanceCache = await calculateBalancesBatch([accountId], [nextDay])
  const accountBalance = balanceCache.get(accountId, nextDay)

  // 6. 市值总和可小于账户余额；差额由投资分析展示为「未分类」，不阻断保存。

  // 7. 找到该账户在当前日期之前的最新快照（严格早于当天，排除自身）
  const previousSnapshot = await snapshotRepo.findFirst({
    where: {
      accountId,
      date: { lt: new Date(data.date + 'T00:00:00') },
      id: { not: id },
    },
    orderBy: { date: 'desc' },
  })

  // 8. 更新数据库
  const result = await withTransaction(async (tx) => {
    // 删除旧 items
    await allocationItemRepo.deleteManyWhere({ snapshotId: id }, tx)

    // 准备新 items 数据
    const itemsData = data.items.map((item, index) => ({
      assetClassId: item.assetClassId,
      marketValue: BigInt(item.marketValue),
      periodNetFlow: BigInt(item.periodNetFlow ?? 0),
      sort: index,
    }))

    // 更新快照
    const saved = await snapshotRepo.update(
      {
        where: { id },
        data: {
          date: new Date(data.date + 'T00:00:00'),
          accountBalance: BigInt(accountBalance),
          previousSnapshotId: previousSnapshot?.id ?? null,
          note: data.note ?? null,
          items: {
            create: itemsData,
          },
        },
        include: SNAPSHOT_ITEMS_RELATIONS,
      },
      tx,
    )

    await relinkSnapshots(tx, accountId)
    return saved
  })
  logger.info({ action: 'update', date: data.date }, 'snapshot updated')
  return result
}
