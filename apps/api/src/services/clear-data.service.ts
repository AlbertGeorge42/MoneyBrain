import { prisma, type TransactionClient } from '../prisma.js'
import { rootLogger, ValidationError } from '../common/index.js'
import type { DataType } from './backup.service.js'

const logger = rootLogger.child({ module: 'clear-data' })

/**
 * 清空配置相关数据（账户、账户分类、交易分类、投资资产类别）
 * 用于单独导入 config.json 时的覆盖模式。
 */
export async function clearConfigDataForImport(tx: TransactionClient): Promise<void> {
  await tx.investmentAssetClass.deleteMany()
  await tx.account.deleteMany()
  await tx.accountCategory.deleteMany({ where: { parentId: { not: null } } })
  await tx.accountCategory.deleteMany()
  await tx.transactionCategory.deleteMany({ where: { parentId: { not: null } } })
  await tx.transactionCategory.deleteMany()
}

/**
 * 清空所有数据（用于完整 ZIP 覆盖模式导入或手动清空全部）
 * 必须按外键依赖顺序删除：子表先于父表，交易/账户先于分类。
 */
export async function clearAllDataForImport(tx: TransactionClient): Promise<void> {
  // 先删引用方（子表）：交易引用分类和账户
  await tx.transaction.deleteMany()
  await tx.budget.deleteMany()
  await tx.investmentAllocationItem.deleteMany()
  await tx.investmentAllocationSnapshot.deleteMany()
  // 再删被引用方（父表）
  await clearConfigDataForImport(tx)
}

/**
 * 按导入范围清空数据。必须按外键依赖顺序执行，并且只清空本次要覆盖的范围。
 * 配置覆盖会删除账户；若仍存在未纳入本次覆盖的交易/预算/快照，直接拒绝。
 */
export async function clearSelectedDataForImport(
  tx: TransactionClient,
  includes: DataType[],
): Promise<void> {
  if (includes.includes('transactions')) {
    await tx.transaction.deleteMany()
  }
  if (includes.includes('snapshots')) {
    await tx.investmentAllocationItem.deleteMany()
    await tx.investmentAllocationSnapshot.deleteMany()
  }
  if (includes.includes('budgets')) {
    await tx.budget.deleteMany()
  }
  if (includes.includes('config')) {
    const [transactionCount, budgetCount, snapshotCount] = await Promise.all([
      tx.transaction.count(),
      tx.budget.count(),
      tx.investmentAllocationSnapshot.count(),
    ])
    if (transactionCount + budgetCount + snapshotCount > 0) {
      throw new ValidationError(
        '覆盖配置会删除现有账户，但仍有未纳入覆盖范围的交易、预算或投资快照。请同时选择这些数据类型，或改用合并模式。'
      )
    }
    await clearConfigDataForImport(tx)
  }
}

/**
 * 仅清空交易记录，供 CSV 覆盖导入使用，必须在调用方的事务内执行。
 * 预算和投资快照不属于交易范围，覆盖交易时不删除。
 */
export async function clearTransactionsForImport(tx: TransactionClient): Promise<void> {
  await tx.transaction.deleteMany()
}

/** 仅清空交易相关数据（公开 API，用于路由层）。 */
export async function clearTransactionsOnly(): Promise<void> {
  logger.warn({ action: 'clear-transactions' }, '清空交易数据')
  await prisma.$transaction(async (tx) => {
    await tx.investmentAllocationItem.deleteMany()
    await tx.investmentAllocationSnapshot.deleteMany()
    await tx.budget.deleteMany()
    await clearTransactionsForImport(tx)
  })
}

/**
 * 清空所有数据（公开 API，用于路由层）
 */
export async function clearAllData(): Promise<void> {
  logger.warn({ action: 'clear-all' }, 'all data cleared')
  await prisma.$transaction(async (tx) => {
    await clearAllDataForImport(tx)
  })
}
