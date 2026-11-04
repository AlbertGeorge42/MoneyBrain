// 合并时的引用完整性（F-B）。
//
// 快照语义下必然出现中间态：某份容器先到，它引用的账户 / 分类还在别的文件里，或者已被墓碑删除。
// 这类记录**不入账、不参与余额与报表**（进入「待补全」），后续文件补齐后自动转为正常记录；
// 指向已删除对象的记录同样待补全，交给界面提示用户处理，不静默复活。
//
// 注意：合并核心（merge.ts）不认识实体类型；这里按实体类型登记「哪些字段是引用」，
// 属于应用层规则（决策 #34 的边界）。新增实体时只加一行登记，不改合并算法。

import type { JsonValue, SyncRecord } from './types.js'
import { recordKey } from './types.js'

export const SYNC_ENTITY_TYPES = {
  accountCategory: 'accountCategory',
  account: 'account',
  transactionCategory: 'transactionCategory',
  transaction: 'transaction',
  budget: 'budget',
  investmentSnapshot: 'investmentSnapshot',
} as const

export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[keyof typeof SYNC_ENTITY_TYPES]

export interface ReferenceSpec {
  field: string
  entityType: SyncEntityType
}

export interface RecordReference {
  entityType: SyncEntityType
  entityId: string
}

/** 可同步实体的引用字段表；未登记的实体视为无引用。 */
export const SYNC_REFERENCES: Readonly<Record<string, readonly ReferenceSpec[]>> = {
  [SYNC_ENTITY_TYPES.accountCategory]: [
    { field: 'parentId', entityType: SYNC_ENTITY_TYPES.accountCategory },
  ],
  [SYNC_ENTITY_TYPES.account]: [
    { field: 'categoryId', entityType: SYNC_ENTITY_TYPES.accountCategory },
  ],
  [SYNC_ENTITY_TYPES.transactionCategory]: [
    { field: 'parentId', entityType: SYNC_ENTITY_TYPES.transactionCategory },
  ],
  [SYNC_ENTITY_TYPES.transaction]: [
    { field: 'accountId', entityType: SYNC_ENTITY_TYPES.account },
    { field: 'toAccountId', entityType: SYNC_ENTITY_TYPES.account },
    { field: 'categoryId', entityType: SYNC_ENTITY_TYPES.transactionCategory },
    { field: 'relatedTransactionId', entityType: SYNC_ENTITY_TYPES.transaction },
  ],
  [SYNC_ENTITY_TYPES.budget]: [
    { field: 'accountId', entityType: SYNC_ENTITY_TYPES.account },
    { field: 'toAccountId', entityType: SYNC_ENTITY_TYPES.account },
    { field: 'categoryId', entityType: SYNC_ENTITY_TYPES.transactionCategory },
  ],
  [SYNC_ENTITY_TYPES.investmentSnapshot]: [
    { field: 'accountId', entityType: SYNC_ENTITY_TYPES.account },
  ],
}

export interface PendingRecord {
  record: SyncRecord
  /** 本批完全未见到的引用对象。 */
  missing: RecordReference[]
  /** 引用对象存在，但已经是墓碑（已被删除）。 */
  deleted: RecordReference[]
  /** 引用对象本身在待补全状态（传递性）。 */
  blockedBy: RecordReference[]
}

function referencesOf(record: SyncRecord): RecordReference[] {
  const specs = SYNC_REFERENCES[record.entityType] ?? []
  const references: RecordReference[] = []
  for (const spec of specs) {
    const value: JsonValue | undefined = record.data[spec.field]
    if (typeof value !== 'string' || value.length === 0) continue
    references.push({ entityType: spec.entityType, entityId: value })
  }
  return references
}

/**
 * 从**完整记录集**（本地状态 + 本批合并结果）算出待补全记录。
 * 墓碑记录自身不需要引用完整性；引用墓碑或引用待补全记录都会传递性地待补全。
 */
export function findPendingRecords(records: Iterable<SyncRecord>): PendingRecord[] {
  const byKey = new Map<string, SyncRecord>()
  for (const record of records) byKey.set(recordKey(record), record)

  const pending = new Map<string, PendingRecord>()

  for (const record of byKey.values()) {
    if (record.deletedAt !== null) continue
    const missing: RecordReference[] = []
    const deleted: RecordReference[] = []
    for (const reference of referencesOf(record)) {
      const target = byKey.get(recordKey(reference))
      if (!target) {
        missing.push(reference)
      } else if (target.deletedAt !== null) {
        deleted.push(reference)
      }
    }
    if (missing.length > 0 || deleted.length > 0) {
      pending.set(recordKey(record), { record, missing, deleted, blockedBy: [] })
    }
  }

  // 传递闭包：引用了待补全记录的记录也待补全（它依赖的对象最终不会入账）。
  let changed = true
  while (changed) {
    changed = false
    for (const record of byKey.values()) {
      const key = recordKey(record)
      if (record.deletedAt !== null || pending.has(key)) continue
      const blockedBy = referencesOf(record).filter((reference) => {
        const targetKey = recordKey(reference)
        return pending.has(targetKey)
      })
      if (blockedBy.length > 0) {
        pending.set(key, { record, missing: [], deleted: [], blockedBy })
        changed = true
      }
    }
  }

  return [...pending.values()].sort((left, right) => {
    const leftKey = recordKey(left.record)
    const rightKey = recordKey(right.record)
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
  })
}
