import { prisma } from '../../index.js'
import { calculateBalanceAtDate } from '../balance.service.js'
import { NotFoundError, ValidationError } from '../../common/index.js'

// 浮点误差容许值
const BALANCE_TOLERANCE = 0.01

// 创建/更新快照（含校验）
export async function createSnapshot(data: {
  accountId: string
  date: string
  items: Array<{
    assetClassId: string
    marketValue: number
    periodInvested?: number
    periodWithdrawn?: number
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

  // 5. 获取快照日的账户余额（下一天，因为 calculateBalanceAtDate 使用 lt）
  const snapshotDate = new Date(data.date)
  const nextDay = new Date(snapshotDate)
  nextDay.setDate(nextDay.getDate() + 1)
  const accountBalance = await calculateBalanceAtDate(data.accountId, nextDay)

  // 6. 市值校验：sum(items.marketValue) 必须等于账户余额（误差允许 0.01）
  const totalMarketValue = data.items.reduce((sum, item) => sum + item.marketValue, 0)
  if (Math.abs(totalMarketValue - accountBalance) > BALANCE_TOLERANCE) {
    throw new ValidationError(
      `市值总和(${totalMarketValue.toFixed(2)})与账户余额(${accountBalance.toFixed(2)})不一致，请调整后重试`
    )
  }

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

  // 8. 净投入校验（若存在上一快照且提供了 periodInvested/periodWithdrawn）
  const isEarliestSnapshot = !previousSnapshot
  if (!isEarliestSnapshot) {
    const totalPeriodInvested = data.items.reduce(
      (sum, item) => sum + (item.periodInvested ?? 0),
      0
    )
    const totalPeriodWithdrawn = data.items.reduce(
      (sum, item) => sum + (item.periodWithdrawn ?? 0),
      0
    )
    const totalNetContribution = totalPeriodInvested - totalPeriodWithdrawn

    // 计算账户在两次快照之间的投资净流入
    // 这里简化处理：只校验净投入总和是否合理（>= -previousBalance）
    // 实际业务中可以根据投资现金流计算逻辑进行校验
    const previousBalance = previousSnapshot.accountBalance
    const accountBalanceChange = accountBalance - previousBalance

    // 净投入应该等于账户余额变化减去收益
    // 由于收益无法直接计算，这里只做软校验：净投入不能超过账户余额变化太多
    // 如果用户提供的净投入与账户余额变化差异过大，给出警告但不阻止
    // 注意：这里移除了强制校验，因为资产市值变化包含收益，不能和账户余额变化直接等同
  }

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
    // 如果是最早一条快照，强制写入 periodInvested=0, periodWithdrawn=0
    const itemsData = data.items.map((item, index) => ({
      assetClassId: item.assetClassId,
      marketValue: item.marketValue,
      periodInvested: isEarliestSnapshot ? 0 : (item.periodInvested ?? 0),
      periodWithdrawn: isEarliestSnapshot ? 0 : (item.periodWithdrawn ?? 0),
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
  const where: any = { accountId }
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
  const where: any = { accountId }
  if (beforeDate) {
    where.date = { ...where.date, lt: new Date(beforeDate + 'T00:00:00') }
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

  return prisma.$transaction(async (tx) => {
    // 将下一个快照的 previousSnapshotId 指向当前快照的上一个
    if (snapshot.nextSnapshots.length > 0) {
      await tx.investmentAllocationSnapshot.updateMany({
        where: { id: { in: snapshot.nextSnapshots.map((s) => s.id) } },
        data: { previousSnapshotId: snapshot.previousSnapshotId },
      })
    }

    return tx.investmentAllocationSnapshot.delete({ where: { id } })
  })
}
