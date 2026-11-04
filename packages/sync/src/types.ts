// 同步记录的最小契约（F-B）。
//
// 合并算法只认这四个版本字段与 data 负载，**不认识具体实体类型**（决策 #34）。
// 实体语义（哪些字段是引用、删除墓碑怎么解释）放在 references.ts，不混进合并核心。

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export interface SyncRecord {
  /** 实体类型标签，如 `transaction`；合并算法只当作不透明字符串。 */
  entityType: string
  /** 客户端生成的稳定 UUID。 */
  entityId: string
  /** 本设备对这条记录的本地修订号。 */
  rev: number
  /** 版本向量 JSON：`{deviceId: maxRev}`。 */
  vv: string
  /** 墓碑时间；null = 未删除。 */
  deletedAt: string | null
  /** 业务负载，不含同步元数据（rev/vv/deletedAt）。 */
  data: { [key: string]: JsonValue }
}

/** 同一记录的身份键：类型 + ID。 */
export function recordKey(record: Pick<SyncRecord, 'entityType' | 'entityId'>): string {
  return `${record.entityType}\u0000${record.entityId}`
}
