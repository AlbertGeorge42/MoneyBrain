// 同步协议的公共入口（与端无关，禁止依赖文件系统 / 网盘 SDK）。

export type { JsonValue, SyncRecord } from './types.js'
export { recordKey } from './types.js'

export { canonicalJson, recordContentFingerprint } from './canonical.js'

export type { VersionRelation, VersionVector } from './version-vector.js'
export {
  compareVersionVectors,
  encodeVersionVector,
  maxVersionVectors,
  parseVersionVector,
} from './version-vector.js'

export type {
  MergeBatchResult,
  MergeConflict,
  MergeStep,
  ResolutionStamp,
} from './merge.js'
export { mergeRecord, mergeRecords, resolutionStamp } from './merge.js'

export type {
  PendingRecord,
  RecordReference,
  ReferenceSpec,
  SyncEntityType,
} from './references.js'
export {
  SYNC_ENTITY_TYPES,
  SYNC_REFERENCES,
  findPendingRecords,
} from './references.js'
