// 记录级运行时校验（F-C）。
//
// 容器里的记录来自别的设备，不能信任类型断言：坏记录必须**整批拒绝**，
// 不能「前面的应用了、后面的坏了」留下半份状态（不变量 10）。
// 但**未知 entityType** 不是坏记录——那是旧设备遇到新实体的正常情况，
// 只跳过该条并记录警告，已识别的实体照常合并（决策 #34）。

import type { JsonValue, SyncRecord } from './types.js'

export class InvalidSyncRecordError extends Error {
  readonly index: number
  readonly reason: string

  constructor(index: number, reason: string) {
    super(`第 ${index + 1} 条同步记录无效：${reason}`)
    this.name = 'InvalidSyncRecordError'
    this.index = index
    this.reason = reason
  }
}

/** data 里不允许出现同步元数据，避免同一字段有两个来源。 */
const RESERVED_DATA_KEYS = ['rev', 'vv', 'deletedAt'] as const
const MAX_ENTITY_TYPE_LENGTH = 64
const MAX_ENTITY_ID_LENGTH = 128

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidTimestamp(value: string | null): boolean {
  return value === null || !Number.isNaN(Date.parse(value))
}

/** 递归确认负载可被 JSON 完整表达（拒绝函数、undefined、NaN、循环之外的怪值）。 */
function assertJsonValue(value: unknown, index: number, path: string): asserts value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new InvalidSyncRecordError(index, `${path} 不是有限数字`)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, position) => assertJsonValue(item, index, `${path}[${position}]`))
    return
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      assertJsonValue(item, index, `${path}.${key}`)
    }
    return
  }
  throw new InvalidSyncRecordError(index, `${path} 含不可序列化的值`)
}

function parseStrictVersionVector(raw: unknown, index: number): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new InvalidSyncRecordError(index, 'vv 缺失或不是字符串')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new InvalidSyncRecordError(index, 'vv 不是合法 JSON')
  }
  if (!isPlainObject(parsed)) throw new InvalidSyncRecordError(index, 'vv 必须是对象')
  const entries = Object.entries(parsed)
  if (entries.length === 0) throw new InvalidSyncRecordError(index, 'vv 至少需要一个设备维度')
  for (const [deviceId, value] of entries) {
    if (deviceId.length === 0) throw new InvalidSyncRecordError(index, 'vv 含空设备维度')
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new InvalidSyncRecordError(index, `vv 的 ${deviceId} 维度不是正整数`)
    }
  }
  return JSON.stringify(
    Object.fromEntries(entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))),
  )
}

/** 单条记录校验；成功返回规范化副本（vv 键序稳定）。 */
export function validateSyncRecord(raw: unknown, index = 0): SyncRecord {
  if (!isPlainObject(raw)) throw new InvalidSyncRecordError(index, '记录必须是对象')

  const { entityType, entityId, rev, vv, deletedAt, data } = raw
  if (typeof entityType !== 'string' || entityType.length === 0 || entityType.length > MAX_ENTITY_TYPE_LENGTH) {
    throw new InvalidSyncRecordError(index, 'entityType 缺失或超长')
  }
  if (entityType.includes('\u0000')) throw new InvalidSyncRecordError(index, 'entityType 含非法字符')
  if (typeof entityId !== 'string' || entityId.length === 0 || entityId.length > MAX_ENTITY_ID_LENGTH) {
    throw new InvalidSyncRecordError(index, 'entityId 缺失或超长')
  }
  if (entityId.includes('\u0000')) throw new InvalidSyncRecordError(index, 'entityId 含非法字符')
  if (typeof rev !== 'number' || !Number.isInteger(rev) || rev < 1) {
    throw new InvalidSyncRecordError(index, 'rev 必须是 >= 1 的整数')
  }
  if (!isValidTimestamp(deletedAt as string | null)) {
    throw new InvalidSyncRecordError(index, 'deletedAt 必须是 null 或可解析的时间')
  }
  if (!isPlainObject(data)) throw new InvalidSyncRecordError(index, 'data 必须是对象')
  for (const key of RESERVED_DATA_KEYS) {
    if (key in data) throw new InvalidSyncRecordError(index, `data 不得包含同步元数据 ${key}`)
  }

  assertJsonValue(data, index, 'data')
  const normalizedVv = parseStrictVersionVector(vv, index)

  return {
    entityType,
    entityId,
    rev,
    vv: normalizedVv,
    deletedAt: deletedAt as string | null,
    data: data as { [key: string]: JsonValue },
  }
}

/** 整批校验：任一条失败即抛错，调用方不得应用已通过的前缀。 */
export function validateSyncRecords(raw: unknown): SyncRecord[] {
  if (!Array.isArray(raw)) throw new InvalidSyncRecordError(0, '记录集必须是数组')
  return raw.map((record, index) => validateSyncRecord(record, index))
}

export interface UnknownEntityWarning {
  index: number
  entityType: string
  entityId: string
  reason: 'unknown-entity-type'
}

export interface PartitionedRecords {
  accepted: SyncRecord[]
  skipped: UnknownEntityWarning[]
}

/**
 * 按已知实体类型分拣。未知类型只跳过该条并给出警告，不影响其它记录；
 * 合并算法因此永远不需要认识新实体（新增实体 = 加一个类型标签）。
 */
export function partitionKnownRecords(
  records: readonly SyncRecord[],
  knownEntityTypes: Iterable<string>,
): PartitionedRecords {
  const known = new Set(knownEntityTypes)
  const accepted: SyncRecord[] = []
  const skipped: UnknownEntityWarning[] = []
  records.forEach((record, index) => {
    if (known.has(record.entityType)) {
      accepted.push(record)
    } else {
      skipped.push({
        index,
        entityType: record.entityType,
        entityId: record.entityId,
        reason: 'unknown-entity-type',
      })
    }
  })
  return { accepted, skipped }
}
