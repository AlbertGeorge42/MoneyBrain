// 只在本地成立的字段：**不进同步记录**（F-C）。
//
// 投资快照的 previousSnapshotId 是本地重排后的结果（原则 #2 的唯一例外），
// 设备间传的是快照本身；应用后由本地日期规则重算，不能把一个设备的重排结果覆盖到另一台。
// 记录在封进容器前统一剔除，避免某条导出路径漏掉。

import type { SyncRecord } from './types.js'

/** entityType → 只属于本地、不得进入容器的 data 字段。 */
export const LOCAL_ONLY_DATA_FIELDS: Readonly<Record<string, readonly string[]>> = {
  investmentSnapshot: ['previousSnapshotId'],
}

export class LocalOnlyFieldError extends Error {
  constructor(entityType: string, field: string) {
    super(`同步记录 ${entityType} 不得包含本地字段 ${field}`)
    this.name = 'LocalOnlyFieldError'
  }
}

/** 剔除本地字段；返回新记录，不修改入参。 */
export function stripLocalOnlyFields(record: SyncRecord): SyncRecord {
  const fields = LOCAL_ONLY_DATA_FIELDS[record.entityType]
  if (!fields || fields.length === 0) return record

  const data = { ...record.data }
  let changed = false
  for (const field of fields) {
    if (field in data) {
      delete data[field]
      changed = true
    }
  }
  return changed ? { ...record, data } : record
}

export function stripLocalOnlyRecordFields(records: readonly SyncRecord[]): SyncRecord[] {
  return records.map(stripLocalOnlyFields)
}

/** 封容器前的边界断言：任何本地字段残留都说明导出路径写错了。 */
export function assertNoLocalOnlyFields(records: readonly SyncRecord[]): void {
  for (const record of records) {
    const fields = LOCAL_ONLY_DATA_FIELDS[record.entityType] ?? []
    for (const field of fields) {
      if (field in record.data) throw new LocalOnlyFieldError(record.entityType, field)
    }
  }
}
