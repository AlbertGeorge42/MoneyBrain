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

export type { UnknownEntityWarning, PartitionedRecords } from './records.js'
export {
  InvalidSyncRecordError,
  partitionKnownRecords,
  validateSyncRecord,
  validateSyncRecords,
} from './records.js'

export type { KnownRecordsMergeResult } from './apply.js'
export { KNOWN_SYNC_ENTITY_TYPES, mergeKnownRecords } from './apply.js'

export type { Argon2idParams, ContainerHeader, OpenedContainer, OpenContainerOptions, SealContainerOptions } from './container.js'
export {
  CONTAINER_FORMAT_VERSION,
  CONTAINER_MAGIC,
  CONTAINER_MAGIC_BYTES,
  ContainerAuthenticationError,
  ContainerError,
  ContainerLedgerMismatchError,
  DEFAULT_KDF_PARAMS,
  UnsupportedContainerVersionError,
  displayRecoveryCode,
  generateRecoveryCode,
  hchacha20,
  isContainerFile,
  isValidDisplayRecoveryCode,
  normalizeRecoveryCode,
  openContainer,
  sealContainer,
} from './container.js'

export {
  LOCAL_ONLY_DATA_FIELDS,
  LocalOnlyFieldError,
  assertNoLocalOnlyFields,
  stripLocalOnlyFields,
  stripLocalOnlyRecordFields,
} from './local-fields.js'
