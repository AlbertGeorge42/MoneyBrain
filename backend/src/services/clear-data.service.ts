import { prisma } from '../index.js'
import { type TransactionClient } from './import/shared.js'
import { rootLogger } from '../common/index.js'

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
 * 仅清空交易相关数据（预算、投资快照/分配项、交易记录）
 */
export async function clearTransactionsOnly(): Promise<void> {
  logger.warn({ action: 'clear-transactions' }, '清空交易数据')
  await prisma.$transaction(async (tx) => {
    await tx.investmentAllocationItem.deleteMany()
    await tx.investmentAllocationSnapshot.deleteMany()
    await tx.budget.deleteMany()
    await tx.transaction.deleteMany()
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
