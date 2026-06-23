import { prisma } from '../../index.js'
import { calculateBalancesBatch } from '../balance.service.js'
import { NotFoundError, ValidationError } from '../../common/index.js'

// 创建/更新快照（含校验）
export async function createSnapshot(data: {
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
  const account = await prisma.account.findUnique({ where: { id: data.accountId } })
  if (!account) throw new NotFoundError('账户不存在')

  // 2. 校验账户有资产类型
  const assetClasses = await prisma.investmentAssetClass.findMany({
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
  const snapshotDate = new Date(data.date)
  const nextDay = new Date(snapshotDate)
  nextDay.setDate(nextDay.getDate() + 1)
  const balanceCache = await calculateBalancesBatch([data.accountId], [nextDay])
  const accountBalance = balanceCache.get(data.accountId, nextDay)

  // 7. 找到该账户在当前日期之前（或同日）的最新快照
  const previousSnapshot = await prisma.investmentAllocationSnapshot.findFirst({
    where: {
      accountId: data.accountId,
      date: { lt: new Date(data.date + 'T23:59:59.999') },
    },
    orderBy: { date: 'desc' },
    include: {
      items: {
        include: { assetClass: true },
        orderBy: { sort: 'asc' },
      },
    },
  })

  // 8. 是否为最早一条快照
  const isEarliestSnapshot = !previousSnapshot

  // 9. 检查同日是否已有快照（upsert 逻辑）
  const existingSnapshot = await prisma.investmentAllocationSnapshot.findFirst({
    where: {
      accountId: data.accountId,
      date: {
        gte: new Date(data.date + 'T00:00:00'),
        lte: new Date(data.date + 'T23:59:59.999'),
      },
    },
  })

  // 10. 写入数据库（事务中执行）
  return prisma.$transaction(async (tx) => {
    // 如果是最早一条快照，强制写入 periodNetFlow=0
    const itemsData = data.items.map((item, index) => ({
      assetClassId: item.assetClassId,
      marketValue: item.marketValue,
      periodNetFlow: isEarliestSnapshot ? 0 : (item.periodNetFlow ?? 0),
      sort: index,
    }))

    if (existingSnapshot) {
      // 更新旧快照：先删除旧 items，再更新快照
      await tx.investmentAllocationItem.deleteMany({
        where: { snapshotId: existingSnapshot.id },
      })

      return tx.investmentAllocationSnapshot.update({
        where: { id: existingSnapshot.id },
        data: {
          accountBalance,
          previousSnapshotId: previousSnapshot?.id ?? null,
          note: data.note ?? null,
          items: {
            create: itemsData,
          },
        },
        include: {
          items: {
            include: { assetClass: true },
            orderBy: { sort: 'asc' },
          },
        },
      })
    } else {
      // 创建新快照
      return tx.investmentAllocationSnapshot.create({
        data: {
          accountId: data.accountId,
          date: new Date(data.date + 'T00:00:00'),
          accountBalance,
          previousSnapshotId: previousSnapshot?.id ?? null,
          note: data.note ?? null,
          items: {
            create: itemsData,
          },
        },
        include: {
          items: {
            include: { assetClass: true },
            orderBy: { sort: 'asc' },
          },
        },
      })
    }
  })
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
    where.date = { ...where.date, lte: new Date(endDate + 'T23:59:59.999') }
  }

  return prisma.investmentAllocationSnapshot.findMany({
    where,
    include: {
      items: {
        include: { assetClass: true },
        orderBy: { sort: 'asc' },
      },
    },
    orderBy: { date: 'desc' },
  })
}

// 获取某账户最近快照
export async function getLatestSnapshot(accountId: string, beforeDate?: string) {
  const where: { accountId: string; date?: { lt: Date } } = { accountId }
  if (beforeDate) {
    where.date = { lt: new Date(beforeDate + 'T00:00:00') }
  }

  return prisma.investmentAllocationSnapshot.findFirst({
    where,
    include: {
      items: {
        include: { assetClass: true },
        orderBy: { sort: 'asc' },
      },
    },
    orderBy: { date: 'desc' },
  })
}

// 删除快照，修复前后链
export async function deleteSnapshot(id: string) {
  const snapshot = await prisma.investmentAllocationSnapshot.findUnique({
    where: { id },
    include: {
      previousSnapshot: true,
      nextSnapshots: true,
    },
  })

  if (!snapshot) throw new NotFoundError('快照不存在')

  if (snapshot.nextSnapshots.length > 1) {
    throw new ValidationError(
      `该快照存在 ${snapshot.nextSnapshots.length} 个后继快照，链表数据异常，请联系管理员处理`
    )
  }

  return prisma.$transaction(async (tx) => {
    await tx.investmentAllocationItem.deleteMany({
      where: { snapshotId: id },
    })

    if (snapshot.nextSnapshots.length === 1) {
      await tx.investmentAllocationSnapshot.update({
        where: { id: snapshot.nextSnapshots[0].id },
        data: { previousSnapshotId: snapshot.previousSnapshotId },
      })
    }

    return tx.investmentAllocationSnapshot.delete({ where: { id } })
  })
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

  const existingSnapshot = await prisma.investmentAllocationSnapshot.findUnique({
    where: { id },
    include: {
      items: {
        include: { assetClass: true },
        orderBy: { sort: 'asc' },
      },
      nextSnapshots: true,
    },
  })

  if (!existingSnapshot) throw new NotFoundError('快照不存在')

  const accountId = existingSnapshot.accountId

  if (existingSnapshot.nextSnapshots.length > 0) {
    const earliestNext = existingSnapshot.nextSnapshots.reduce((earliest, s) =>
      s.date < earliest.date ? s : earliest
    )
    if (newDate >= earliestNext.date) {
      throw new ValidationError(
        `新日期不能晚于或等于后继快照日期（${earliestNext.date.toISOString().split('T')[0]}）`
      )
    }
  }

  const assetClasses = await prisma.investmentAssetClass.findMany({
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
  const snapshotDate = new Date(data.date)
  const nextDay = new Date(snapshotDate)
  nextDay.setDate(nextDay.getDate() + 1)
  const balanceCache = await calculateBalancesBatch([accountId], [nextDay])
  const accountBalance = balanceCache.get(accountId, nextDay)

  // 6. 找到该账户在当前日期之前的最新快照（排除自身）
  const previousSnapshot = await prisma.investmentAllocationSnapshot.findFirst({
    where: {
      accountId,
      date: { lt: new Date(data.date + 'T23:59:59.999') },
      id: { not: id },
    },
    orderBy: { date: 'desc' },
  })

  // 7. 更新数据库
  return prisma.$transaction(async (tx) => {
    // 删除旧 items
    await tx.investmentAllocationItem.deleteMany({
      where: { snapshotId: id },
    })

    // 准备新 items 数据
    const itemsData = data.items.map((item, index) => ({
      assetClassId: item.assetClassId,
      marketValue: item.marketValue,
      periodNetFlow: item.periodNetFlow ?? 0,
      sort: index,
    }))

    // 更新快照
    return tx.investmentAllocationSnapshot.update({
      where: { id },
      data: {
        date: new Date(data.date + 'T00:00:00'),
        accountBalance,
        previousSnapshotId: previousSnapshot?.id ?? null,
        note: data.note ?? null,
        items: {
          create: itemsData,
        },
      },
      include: {
        items: {
          include: { assetClass: true },
          orderBy: { sort: 'asc' },
        },
      },
    })
  })
}
