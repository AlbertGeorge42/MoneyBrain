import type { Prisma, Transaction } from '@prisma/client'
import { withTransaction } from '../db/transaction.js'
import { NotFoundError, ValidationError } from '../common/index.js'
import * as auditEventRepo from '../db/repositories/audit-event.repository.js'
import * as transactionRepo from '../db/repositories/transaction.repository.js'
import type { TransactionWithRelations } from '../db/repositories/transaction.repository.js'

// 审计与撤销（B2-3 / B2-4）。
//
// - 撤销 = 依据审计事件里的 before 快照反向写入，不另建撤销表；
// - 回收站的「恢复」= 撤销最近一条 deleted 事件，与提示条上的「撤销」走同一条反向写入路径。
// - 反向写只回滚快照里出现的业务字段（id / createdAt / ruleVersion 不在 snapshotToUpdate 里，永不回滚）。

function parseSnapshot(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not a plain object')
    }
    // JSON 边界解析：结构已在上面收窄，这里是安全断言
    return parsed as Record<string, unknown>
  } catch {
    throw new ValidationError('审计事件快照损坏，无法撤销')
  }
}

/** before 快照 → prisma 更新数据：字符串按字段语义还原成 Date / BigInt。 */
function snapshotToUpdate(snapshot: Record<string, unknown>): Prisma.TransactionUncheckedUpdateInput {
  const update: Prisma.TransactionUncheckedUpdateInput = {}

  if (snapshot.type !== undefined) update.type = String(snapshot.type)
  if (snapshot.amount !== undefined) update.amount = BigInt(String(snapshot.amount))
  if (snapshot.fee !== undefined) update.fee = BigInt(String(snapshot.fee))
  if (snapshot.coupon !== undefined) update.coupon = BigInt(String(snapshot.coupon))
  // date / accountId 是必填列，快照里必有值；防御性跳过意外的 null
  if (snapshot.date !== undefined && snapshot.date !== null) {
    update.date = new Date(String(snapshot.date))
  }
  if (snapshot.note !== undefined) {
    update.note = snapshot.note === null ? null : String(snapshot.note)
  }
  if (snapshot.accountId !== undefined && snapshot.accountId !== null) {
    update.accountId = String(snapshot.accountId)
  }
  if (snapshot.toAccountId !== undefined) {
    update.toAccountId = snapshot.toAccountId === null ? null : String(snapshot.toAccountId)
  }
  if (snapshot.categoryId !== undefined) {
    update.categoryId = snapshot.categoryId === null ? null : String(snapshot.categoryId)
  }
  if (snapshot.relatedTransactionId !== undefined) {
    update.relatedTransactionId =
      snapshot.relatedTransactionId === null ? null : String(snapshot.relatedTransactionId)
  }
  if (snapshot.relatedType !== undefined) {
    update.relatedType = snapshot.relatedType === null ? null : String(snapshot.relatedType)
  }
  if (snapshot.excludeFromIncomeExpense !== undefined) {
    update.excludeFromIncomeExpense = Boolean(snapshot.excludeFromIncomeExpense)
  }
  if (snapshot.deletedAt !== undefined) {
    update.deletedAt = snapshot.deletedAt === null ? null : new Date(String(snapshot.deletedAt))
  }
  return update
}

/** 当前行是否与事件记录的 after 一致（撤销前的过期校验，防止静默丢掉后续修改）。 */
function snapshotEquals(current: Record<string, unknown>, snapshot: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(current), ...Object.keys(snapshot)])
  for (const key of keys) {
    if (current[key] !== snapshot[key]) return false
  }
  return true
}

/** 软删除 / 恢复 / 修改 按前后状态推导事件动作名。 */
function deriveAction(before: Transaction, after: Transaction): string {
  if (before.deletedAt && !after.deletedAt) return 'restored'
  if (!before.deletedAt && after.deletedAt) return 'deleted'
  return 'updated'
}

// ===== 写入（供 transaction.service 调用） =====

/** 软删除 + 审计事件（同一事务内），返回审计事件 id（提示条「撤销」用）。 */
export async function softDeleteWithEvent(transaction: Transaction): Promise<string> {
  const event = await withTransaction(async (tx) => {
    const after = await transactionRepo.softDelete(transaction.id, tx)
    return auditEventRepo.createAuditEvent(
      {
        entity: 'transaction',
        entityId: transaction.id,
        action: 'deleted',
        before: transaction,
        after,
      },
      tx,
    )
  })
  return event.id
}

/** 修改 + 审计事件（同一事务内），返回带关联的更新后交易。 */
export async function updateWithEvent(
  id: string,
  before: Transaction,
  data: Prisma.TransactionUncheckedUpdateInput,
): Promise<TransactionWithRelations> {
  return withTransaction(async (tx) => {
    const after = await transactionRepo.updateFields(id, data, tx)
    await auditEventRepo.createAuditEvent(
      {
        entity: 'transaction',
        entityId: id,
        action: 'updated',
        before,
        after,
      },
      tx,
    )
    const updated = await transactionRepo.findByIdWithRelations(id, {}, tx)
    if (!updated) throw new NotFoundError('交易记录')
    return updated
  })
}

// ===== 撤销（反向写入的唯一路径） =====

/**
 * 撤销一条审计事件：把事件里的 before 快照写回该交易。
 * 提示条「撤销」与回收站「恢复」（恢复 = 撤销最近一条 deleted 事件）共用此函数。
 */
export async function undoAuditEvent(eventId: string): Promise<TransactionWithRelations> {
  const event = await auditEventRepo.findAuditEventById(eventId)
  if (!event) throw new NotFoundError('审计事件')
  if (event.entity !== 'transaction' || !event.beforeJson) {
    throw new ValidationError('该审计事件不支持撤销')
  }

  const current = await transactionRepo.findByIdIncludingDeleted(event.entityId)
  if (!current) throw new NotFoundError('交易记录')

  if (event.afterJson) {
    const after = parseSnapshot(event.afterJson)
    if (!snapshotEquals(auditEventRepo.serializeRow(current), after)) {
      throw new ValidationError('交易在撤销前又发生了变化，无法按该事件撤销')
    }
  }

  return applyTransactionSnapshot(event.entityId, current, parseSnapshot(event.beforeJson))
}

/** 把目标快照写回交易并记录对应审计事件，返回带关联的交易。 */
async function applyTransactionSnapshot(
  transactionId: string,
  current: Transaction,
  target: Record<string, unknown>,
): Promise<TransactionWithRelations> {
  await withTransaction(async (tx) => {
    const after = await transactionRepo.updateFields(transactionId, snapshotToUpdate(target), tx)
    await auditEventRepo.createAuditEvent(
      {
        entity: 'transaction',
        entityId: transactionId,
        action: deriveAction(current, after),
        before: current,
        after,
      },
      tx,
    )
  })
  const restored = await transactionRepo.findByIdWithRelations(transactionId, { includeDeleted: true })
  if (!restored) throw new NotFoundError('交易记录')
  return restored
}

// ===== 查询（详情历史 / 回收站） =====

/** 详情页修改历史。 */
export async function getTransactionHistory(transactionId: string) {
  return auditEventRepo.listAuditEvents('transaction', transactionId)
}

/** 回收站：已删除交易 + 各自最近一条 deleted 事件 id（「恢复」按钮撤销它）。 */
export async function getRecycleBin(): Promise<
  Array<{ transaction: TransactionWithRelations; deleteEventId: string | null }>
> {
  const deleted = await transactionRepo.listDeleted()
  const latestDeleteEvents = await auditEventRepo.findLatestDeleteEventIds(
    'transaction',
    deleted.map((transaction) => transaction.id),
  )
  return deleted.map((transaction) => ({
    transaction,
    deleteEventId: latestDeleteEvents.get(transaction.id) ?? null,
  }))
}
