import type { TransactionClient } from '../prisma.js'
import { withTransaction } from '../db/transaction.js'
import { rootLogger, ValidationError } from '../common/index.js'
import * as transactionRepo from '../db/repositories/transaction.repository.js'
import * as budgetRepo from '../db/repositories/budget.repository.js'
import * as investmentAllocationItemRepo from '../db/repositories/investment-allocation-item.repository.js'
import * as investmentAllocationSnapshotRepo from '../db/repositories/investment-allocation-snapshot.repository.js'
import * as investmentAssetClassRepo from '../db/repositories/investment-asset-class.repository.js'
import * as accountRepo from '../db/repositories/account.repository.js'
import * as accountCategoryRepo from '../db/repositories/account-category.repository.js'
import * as transactionCategoryRepo from '../db/repositories/transaction-category.repository.js'
import type { DataType } from './backup.service.js'

const logger = rootLogger.child({ module: 'clear-data' })

/**
 * 清空配置相关数据（账户、账户分类、交易分类、投资资产类别）。
 * 仅供本文件的清空流程使用。
 */
async function clearConfigDataForImport(tx: TransactionClient): Promise<void> {
  await investmentAssetClassRepo.deleteManyWhere(undefined, tx)
  await accountRepo.deleteManyWhere(undefined, tx)
  await accountCategoryRepo.deleteManyWhere({ parentId: { not: null } }, tx)
  await accountCategoryRepo.deleteManyWhere(undefined, tx)
  await transactionCategoryRepo.deleteManyWhere({ parentId: { not: null } }, tx)
  await transactionCategoryRepo.deleteManyWhere(undefined, tx)
}

/**
 * 清空所有数据（用于手动清空全部）。
 * 必须按外键依赖顺序删除：子表先于父表，交易/账户先于分类。
 */
async function clearAllDataForImport(tx: TransactionClient): Promise<void> {
  // 先删引用方（子表）：交易引用分类和账户；清库是全量硬删，不过滤软删除
  await transactionRepo.deleteManyWhere(undefined, tx)
  await budgetRepo.deleteManyWhere(undefined, tx)
  await investmentAllocationItemRepo.deleteManyWhere(undefined, tx)
  await investmentAllocationSnapshotRepo.deleteManyWhere(undefined, tx)
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
    await transactionRepo.deleteManyWhere(undefined, tx)
  }
  if (includes.includes('snapshots')) {
    await investmentAllocationItemRepo.deleteManyWhere(undefined, tx)
    await investmentAllocationSnapshotRepo.deleteManyWhere(undefined, tx)
  }
  if (includes.includes('budgets')) {
    await budgetRepo.deleteManyWhere(undefined, tx)
  }
  if (includes.includes('config')) {
    // 计数含软删除行：回收站里的交易同样引用账户，从保守判定
    const [transactionCount, budgetCount, snapshotCount] = await Promise.all([
      transactionRepo.countIncludingDeleted({}, tx),
      budgetRepo.count(undefined, tx),
      investmentAllocationSnapshotRepo.count(undefined, tx),
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
 * 仅清空交易记录。预算和投资快照不属于交易范围，覆盖交易时不删除。
 */
async function clearTransactionsForImport(tx: TransactionClient): Promise<void> {
  await transactionRepo.deleteManyWhere(undefined, tx)
}

/** 仅清空交易相关数据（公开 API，用于路由层）。 */
export async function clearTransactionsOnly(): Promise<void> {
  logger.warn({ action: 'clear-transactions' }, '清空交易数据')
  await withTransaction(async (tx) => {
    await investmentAllocationItemRepo.deleteManyWhere(undefined, tx)
    await investmentAllocationSnapshotRepo.deleteManyWhere(undefined, tx)
    await budgetRepo.deleteManyWhere(undefined, tx)
    await clearTransactionsForImport(tx)
  })
}

/**
 * 清空所有数据（公开 API，用于路由层）
 */
export async function clearAllData(): Promise<void> {
  logger.warn({ action: 'clear-all' }, 'all data cleared')
  await withTransaction(async (tx) => {
    await clearAllDataForImport(tx)
  })
}
