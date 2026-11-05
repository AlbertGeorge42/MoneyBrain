// 应用入口：未知实体类型跳过并警告，已识别实体照常合并（F-C）。
//
// 容器/合并层本身不认识实体集合；这一层只做「按注册表分拣」，
// 所以新增一种可同步实体不需要改合并算法，也不会让旧设备挡住整批（决策 #34）。

import type { MergeBatchResult } from './merge.js'
import { mergeRecords } from './merge.js'
import { partitionKnownRecords, type UnknownEntityWarning } from './records.js'
import { SYNC_ENTITY_TYPES } from './references.js'
import type { SyncRecord } from './types.js'

export const KNOWN_SYNC_ENTITY_TYPES: readonly string[] = Object.values(SYNC_ENTITY_TYPES)

export interface KnownRecordsMergeResult extends MergeBatchResult {
  /** 因实体类型未注册而跳过的记录；这些记录不参与合并，但不会让整批失败。 */
  skipped: UnknownEntityWarning[]
}

export function mergeKnownRecords(
  existing: Iterable<SyncRecord>,
  incoming: Iterable<SyncRecord>,
  knownEntityTypes: Iterable<string> = KNOWN_SYNC_ENTITY_TYPES,
): KnownRecordsMergeResult {
  const { accepted, skipped } = partitionKnownRecords([...incoming], knownEntityTypes)
  return { ...mergeRecords(existing, accepted), skipped }
}
