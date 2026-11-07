import type { Prisma, Transaction } from '@prisma/client'
import { withTransaction } from '../db/transaction.js'
import { NotFoundError, ValidationError } from '../common/index.js'
import * as auditEventRepo from '../db/repositories/audit-event.repository.js'
import * as accountRepo from '../db/repositories/account.repository.js'
import * as budgetRepo from '../db/repositories/budget.repository.js'
import * as transactionCategoryRepo from '../db/repositories/transaction-category.repository.js'
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
 * 撤销一条审计事件：
 * - transaction：把 before 快照写回该交易（软删除恢复 / 修改回滚）；
 * - account / transaction_category：硬删除后按 before 快照重建该行。
 * 提示条「撤销」与回收站「恢复」共用此函数。
 */
export async function undoAuditEvent(
  eventId: string,
): Promise<TransactionWithRelations | { restored: string; entityId: string }> {
  const event = await auditEventRepo.findAuditEventById(eventId)
  if (!event) throw new NotFoundError('审计事件')
  if (!event.beforeJson) {
    throw new ValidationError('该审计事件不支持撤销')
  }

  if (event.entity === 'transaction') {
    return undoTransactionEvent(event)
  }
  if (event.entity === 'account') {
    return restoreAccount(event)
  }
  if (event.entity === 'transaction_category') {
    return restoreTransactionCategory(event)
  }
  throw new ValidationError('该审计事件不支持撤销')
}

async function undoTransactionEvent(event: {
  id: string
  entityId: string
  beforeJson: string | null
  afterJson: string | null
}): Promise<TransactionWithRelations> {
  const current = await transactionRepo.findByIdIncludingDeleted(event.entityId)
  if (!current) throw new NotFoundError('交易记录')

  if (event.afterJson) {
    const after = parseSnapshot(event.afterJson)
    if (!snapshotEquals(auditEventRepo.serializeRow(current), after)) {
      throw new ValidationError('交易在撤销前又发生了变化，无法按该事件撤销')
    }
  }

  return applyTransactionSnapshot(event.entityId, current, parseSnapshot(event.beforeJson!))
}

/** 硬删除行的找回：仅允许撤销该实体最近一条事件，且不支持有级联删除的账户。 */
async function assertRestorable(entity: string, eventId: string, entityId: string, label: string) {
  const history = await auditEventRepo.listAuditEvents(entity, entityId)
  if (history[0]?.id !== eventId) {
    throw new ValidationError(`${label}又发生了变化，无法按该事件恢复`)
  }
}

function deleteMeta(event: { afterJson: string | null }): Record<string, unknown> | null {
  if (!event.afterJson) return null
  const after = parseSnapshot(event.afterJson)
  const meta = after.__deleteMeta
  return meta && typeof meta === 'object' && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : null
}

async function restoreAccount(event: {
  id: string
  entityId: string
  beforeJson: string | null
  afterJson: string | null
}): Promise<{ restored: string; entityId: string }> {
  const existing = await accountRepo.findById(event.entityId)
  if (existing) throw new ValidationError('账户已恢复，无需重复撤销')
  await assertRestorable('account', event.id, event.entityId, '账户')

  const meta = deleteMeta(event)
  if (meta?.force) {
    throw new ValidationError('该账户删除时已级联删除关联数据，无法自动恢复')
  }

  const snapshot = parseSnapshot(event.beforeJson!)
  const data: Prisma.AccountUncheckedCreateInput = {
    id: event.entityId,
    name: String(snapshot.name),
    type: String(snapshot.type),
    initialBalance: BigInt(String(snapshot.initialBalance ?? 0)),
    initialBalanceDate:
      snapshot.initialBalanceDate === null || snapshot.initialBalanceDate === undefined
        ? null
        : new Date(String(snapshot.initialBalanceDate)),
    categoryId:
      snapshot.categoryId === null || snapshot.categoryId === undefined
        ? null
        : String(snapshot.categoryId),
    sort: Number(snapshot.sort ?? 0),
    rev: Number(snapshot.rev ?? 1),
    vv: snapshot.vv === null || snapshot.vv === undefined ? null : String(snapshot.vv),
  }

  await withTransaction(async (tx) => {
    await accountRepo.createWithCategory(data, tx)
    await auditEventRepo.createAuditEvent(
      {
        entity: 'account',
        entityId: event.entityId,
        action: 'restored',
        before: snapshot,
        after: data as unknown as Record<string, unknown>,
      },
      tx,
    )
  })
  return { restored: 'account', entityId: event.entityId }
}

async function restoreTransactionCategory(event: {
  id: string
  entityId: string
  beforeJson: string | null
  afterJson: string | null
}): Promise<{ restored: string; entityId: string }> {
  const existing = await transactionCategoryRepo.findById(event.entityId)
  if (existing) throw new ValidationError('分类已恢复，无需重复撤销')
  await assertRestorable('transaction_category', event.id, event.entityId, '分类')

  const snapshot = parseSnapshot(event.beforeJson!)
  const parentId =
    snapshot.parentId === null || snapshot.parentId === undefined
      ? null
      : String(snapshot.parentId)
  // 父分类若已被删除，降级为一级分类，避免外键失败。
  const parentExists = parentId
    ? Boolean(await transactionCategoryRepo.findById(parentId))
    : true

  const data = {
    id: event.entityId,
    name: String(snapshot.name),
    type: String(snapshot.type),
    cashFlowType:
      snapshot.cashFlowType === null || snapshot.cashFlowType === undefined
        ? null
        : String(snapshot.cashFlowType),
    parentId: parentExists ? parentId : null,
    sort: Number(snapshot.sort ?? 0),
    rev: Number(snapshot.rev ?? 1),
    vv: snapshot.vv === null || snapshot.vv === undefined ? null : String(snapshot.vv),
  } satisfies Prisma.TransactionCategoryUncheckedCreateInput

  const meta = deleteMeta(event)
  if (meta?.deletedTransactions !== undefined) {
    throw new ValidationError(
      `该分类删除时已级联删除 ${Number(meta.deletedTransactions)} 笔交易，交易已不在，无法恢复；如需重记请在流水页新增`,
    )
  }
  const transferTo =
    meta?.transferToCategoryId === undefined ? null : String(meta.transferToCategoryId)
  const transferredIds = Array.isArray(meta?.transferredTransactionIds)
    ? (meta.transferredTransactionIds as string[]).map(String)
    : []
  const transferredBudgetIds = Array.isArray(meta?.transferredBudgetIds)
    ? (meta.transferredBudgetIds as string[]).map(String)
    : []

  await withTransaction(async (tx) => {
    await transactionCategoryRepo.create({ data }, tx)
    if (transferTo && transferredIds.length > 0) {
      // 仍停在目标分类下的交易回填到恢复后的原分类；之后被用户改走的记录不覆盖。
      await transactionRepo.reassignCategoryByIds(
        transferredIds,
        transferTo,
        event.entityId,
        tx,
      )
    }
    if (transferTo && transferredBudgetIds.length > 0) {
      await budgetRepo.reassignCategoryByIds(
        transferredBudgetIds,
        transferTo,
        event.entityId,
        tx,
      )
    }
    await auditEventRepo.createAuditEvent(
      {
        entity: 'transaction_category',
        entityId: event.entityId,
        action: 'restored',
        before: snapshot,
        after: data as unknown as Record<string, unknown>,
      },
      tx,
    )
  })
  return { restored: 'transaction_category', entityId: event.entityId }
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

export interface DeletedEntityItem {
  deleteEventId: string
  entity: 'account' | 'transaction_category'
  entityId: string
  name: string
  /** 账户类型 / 分类类型，用于回收站行内说明。 */
  detail: string
  deletedAt: string
  /** 级联删除（force / 删除交易）的记录无法自动恢复。 */
  canRestore: boolean
}

/** 回收站里的账户与分类：硬删除，靠审计事件找回。 */
export async function getDeletedEntityRecycleBin(): Promise<{
  accounts: DeletedEntityItem[]
  categories: DeletedEntityItem[]
}> {
  const build = async (entity: 'account' | 'transaction_category'): Promise<DeletedEntityItem[]> => {
    const events = await auditEventRepo.listLatestDeletedEntities(entity)
    return events.map((event) => {
      let name = event.entityId
      let detail = ''
      let meta: Record<string, unknown> | null = null
      if (event.beforeJson) {
        const snapshot = parseSnapshot(event.beforeJson)
        if (typeof snapshot.name === 'string') name = snapshot.name
        if (typeof snapshot.type === 'string') detail = snapshot.type
      }
      if (event.afterJson) {
        const after = parseSnapshot(event.afterJson)
        const raw = after.__deleteMeta
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          meta = raw as Record<string, unknown>
        }
      }
      return {
        deleteEventId: event.id,
        entity,
        entityId: event.entityId,
        name,
        detail,
        deletedAt: event.at.toISOString(),
        // 级联删除（账户 force / 分类连交易一起删）无法完整恢复。
        canRestore: !(meta?.force === true) && !(meta?.deletedTransactions !== undefined),
      }
    })
  }

  const accounts = await build('account')
  const categories = await build('transaction_category')
  return { accounts, categories }
}
