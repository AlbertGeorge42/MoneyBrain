import { prisma } from '../prisma.js'
import { NotFoundError, ValidationError } from '../common/index.js'
import { toMinor } from '../common/index.js'
import * as accountRepo from '../db/repositories/account.repository.js'
import * as accountCategoryRepo from '../db/repositories/account-category.repository.js'
import * as assetClassRepo from '../db/repositories/investment-asset-class.repository.js'
import * as snapshotRepo from '../db/repositories/investment-allocation-snapshot.repository.js'
import * as allocationItemRepo from '../db/repositories/investment-allocation-item.repository.js'
import * as auditEventRepo from '../db/repositories/audit-event.repository.js'
import * as budgetRepo from '../db/repositories/budget.repository.js'
import * as transactionRepo from '../db/repositories/transaction.repository.js'
import type { AccountStats } from '../../../../packages/contracts/types/index.js'

type AccountSortItem = {
  id: string
  sort: number
  categoryId: string | null
}

type AccountUpdateData = {
  name?: string
  type?: string
  icon?: string | null
  color?: string | null
  categoryId?: string | null
  initialBalance?: number
  initialBalanceDate?: string
}

export async function getAccounts(params?: { type?: string; categoryId?: string }) {
  const where: Record<string, unknown> = {}
  if (params?.type) where.type = params.type
  if (params?.categoryId) where.categoryId = params.categoryId

  return accountRepo.findMany({
    where,
    include: { category: true },
    orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
  })
}

export async function updateAccountSorts(items: AccountSortItem[]): Promise<void> {
  await accountRepo.updateSorts(items)
}

export async function getAccountDetail(accountId: string) {
  const account = await accountRepo.findByIdWithCategory(accountId)
  if (!account) return null

  // 最近交易走交易 repository：软删除过滤只在那层做
  const fromTransactions = await transactionRepo.findActive(
    { accountId },
    {
      orderBy: { date: 'desc' },
      take: 10,
      include: { category: true },
    },
  )

  return { ...account, fromTransactions }
}

export async function createAccount(data: {
  name: string
  type: string
  icon?: string | null
  color?: string | null
  categoryId?: string | null
  initialBalance?: number
  initialBalanceDate?: string
}) {
  return accountRepo.createWithCategory({
    name: data.name,
    type: data.type,
    initialBalance: BigInt(data.initialBalance ?? 0),
    initialBalanceDate: data.initialBalanceDate
      ? new Date(`${data.initialBalanceDate}T00:00:00`)
      : new Date(),
    icon: data.icon,
    color: data.color,
    categoryId: data.categoryId,
  })
}

export async function updateAccountProfile(accountId: string, data: AccountUpdateData) {
  const currentAccount = await accountRepo.findById(accountId)
  if (!currentAccount) {
    throw new NotFoundError('账户')
  }

  const updateData: Record<string, unknown> = {
    name: data.name,
    initialBalanceDate: data.initialBalanceDate
      ? new Date(`${data.initialBalanceDate}T00:00:00`)
      : undefined,
  }

  if (data.icon !== undefined) {
    updateData.icon = data.icon
  }
  if (data.color !== undefined) {
    updateData.color = data.color
  }

  if (data.type && data.type !== currentAccount.type) {
    updateData.type = data.type

    if (!data.categoryId) {
      const defaultCategory = await accountCategoryRepo.findFirst({
        where: { type: data.type, parentId: null },
      })
      if (defaultCategory) {
        updateData.categoryId = defaultCategory.id
      }
    } else {
      updateData.categoryId = data.categoryId
    }
  } else {
    updateData.type = data.type
    updateData.categoryId = data.categoryId
  }

  if (data.initialBalance !== undefined) {
    updateData.initialBalance = BigInt(data.initialBalance)
  }

  return accountRepo.updateWithCategory(accountId, updateData)
}

export async function deleteAccount(accountId: string, forceDelete = false) {
  const account = await accountRepo.findById(accountId)
  if (!account) {
    throw new NotFoundError('账户')
  }

  // 交易计数不过滤软删除：回收站里的交易仍引用本账户，恢复时要能对上
  const transactionsCount = await transactionRepo.countIncludingDeleted({ accountId })

  // 转入交易（toAccountId 指向本账户）不会计入 transactionsCount，
  // 但账户被删除后这些交易会被外键置空 toAccountId，静默破坏转账配对，
  // 因此必须一并纳入"关联数据"判定与级联删除。
  const incomingTransfersCount = await transactionRepo.countIncludingDeleted({ toAccountId: accountId })

  // 该账户（作为转出或转入方）被预算引用时，外键为 RESTRICT，
  // 若不先删除预算，删除账户会直接抛出外键错误。
  const budgetsCount = await budgetRepo.count({
    OR: [{ accountId }, { toAccountId: accountId }],
  })

  const assetClassesCount = await assetClassRepo.count({ accountId })

  const snapshotsCount = await snapshotRepo.count({ accountId })

  const hasRelatedData =
    transactionsCount > 0 ||
    incomingTransfersCount > 0 ||
    budgetsCount > 0 ||
    assetClassesCount > 0 ||
    snapshotsCount > 0

  if (!forceDelete && hasRelatedData) {
    const messages: string[] = []
    if (transactionsCount > 0) messages.push(`${transactionsCount} 条交易记录`)
    if (incomingTransfersCount > 0) messages.push(`${incomingTransfersCount} 条转入交易`)
    if (budgetsCount > 0) messages.push(`${budgetsCount} 个预算`)
    if (assetClassesCount > 0) messages.push(`${assetClassesCount} 个投资大类`)
    if (snapshotsCount > 0) messages.push(`${snapshotsCount} 个投资快照`)
    throw new ValidationError(`该账户下存在 ${messages.join('、')}，无法删除`)
  }

  if (forceDelete && hasRelatedData) {
    await prisma.$transaction(async (tx) => {
      // 先删引用账户的子表（交易、预算），再删账户；交易的批量删除走 repository
      if (transactionsCount > 0) {
        await transactionRepo.deleteManyWhere({ accountId }, tx)
      }
      if (incomingTransfersCount > 0) {
        await transactionRepo.deleteManyWhere({ toAccountId: accountId }, tx)
      }
      if (budgetsCount > 0) {
        await budgetRepo.deleteManyWhere(
          { OR: [{ accountId }, { toAccountId: accountId }] },
          tx,
        )
      }

      if (snapshotsCount > 0) {
        await allocationItemRepo.deleteManyWhere({ snapshot: { accountId } }, tx)
        await snapshotRepo.deleteManyWhere({ accountId }, tx)
      }

      if (assetClassesCount > 0) {
        await assetClassRepo.deleteManyWhere({ accountId }, tx)
      }

      await accountRepo.deleteById(accountId, tx)
      // 账户硬删除记审计事件（撤销暂不支持，留痕供后续 D1 接入）
      await auditEventRepo.createAuditEvent(
        { entity: 'account', entityId: accountId, action: 'deleted', before: account },
        tx,
      )
    })
  } else {
    await accountRepo.deleteById(accountId)
    await auditEventRepo.createAuditEvent(
      { entity: 'account', entityId: accountId, action: 'deleted', before: account },
    )
  }

  return {
    message: '删除成功',
    deletedTransactions: transactionsCount,
    deletedIncomingTransfers: incomingTransfersCount,
    deletedBudgets: budgetsCount,
    deletedAssetClasses: assetClassesCount,
    deletedSnapshots: snapshotsCount,
  }
}

export async function getAccountStats(accountId: string): Promise<AccountStats> {
  // isAdjustment 已删除：type='adjustment' 已能区分非业务调整
  // 不计收支标记的交易不计入账户收入/支出统计（仍计入账户余额）
  const [countResult, incomeResult, expenseResult] = await Promise.all([
    transactionRepo.countActive({ accountId }),
    transactionRepo.sumActiveAmount({ accountId, type: 'income', excludeFromIncomeExpense: false }),
    transactionRepo.sumActiveAmount({ accountId, type: 'expense', excludeFromIncomeExpense: false }),
  ])

  return {
    transactionCount: countResult,
    totalIncome: toMinor(incomeResult._sum.amount),
    totalExpense: toMinor(expenseResult._sum.amount),
  }
}
