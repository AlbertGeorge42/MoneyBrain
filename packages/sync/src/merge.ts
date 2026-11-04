// 记录级合并（F-B，决策 #24–#26）。
//
// 输入是同一 `entityType + entityId` 的两条**结果态**记录，输出是「该保留哪一版」：
// - vv 可比 → 取后继；
// - vv 不可比 → 真并发，两版都留存，一版生效、另一版进 `sync_conflicts`；
// - vv 相同且内容相同 → 幂等丢弃。
//
// **任意顺序、重复应用结果一致**：并发冲突时用 `(rev, 内容指纹)` 这个稳定全序选出生效版本，
// 与到达顺序无关；因此同一批记录无论怎么打乱、应用几次，落库后的字段都相同（不变量 10）。

import { recordContentFingerprint } from './canonical.js'
import { recordKey, type SyncRecord } from './types.js'
import {
  compareVersionVectors,
  maxVersionVectors,
  parseVersionVector,
  type VersionRelation,
} from './version-vector.js'

export interface MergeConflict {
  entityType: string
  entityId: string
  /** 当前生效（保留）的版本。 */
  winner: SyncRecord
  /** 输的一版：必须落本地 `sync_conflicts`，不能只在内存。 */
  loser: SyncRecord
}

export type MergeStep =
  | { action: 'insert'; record: SyncRecord }
  | { action: 'replace'; record: SyncRecord; previous: SyncRecord }
  | { action: 'conflict'; record: SyncRecord; previous: SyncRecord; conflict: MergeConflict }
  | { action: 'duplicate' }
  | { action: 'stale' }

export interface MergeBatchResult {
  /** 合并后的完整记录集（按 entityType + entityId 排序，便于逐字段比对）。 */
  records: SyncRecord[]
  /** 本次检出、且尚未去重的冲突（同一输家重复到达只保留一条）。 */
  conflicts: MergeConflict[]
  inserted: number
  replaced: number
  duplicates: number
  stale: number
}

/** 并发冲突的稳定全序：rev 大者优先，相同则内容指纹大者优先。 */
function compareRecords(left: SyncRecord, right: SyncRecord): number {
  if (left.rev !== right.rev) return left.rev - right.rev
  const leftFingerprint = recordContentFingerprint(left)
  const rightFingerprint = recordContentFingerprint(right)
  if (leftFingerprint === rightFingerprint) return 0
  return leftFingerprint < rightFingerprint ? -1 : 1
}

function conflictBetween(current: SyncRecord, incoming: SyncRecord): MergeStep {
  const winner = compareRecords(current, incoming) >= 0 ? current : incoming
  const loser = winner === current ? incoming : current
  return {
    action: 'conflict',
    record: winner,
    previous: current,
    conflict: {
      entityType: winner.entityType,
      entityId: winner.entityId,
      winner,
      loser,
    },
  }
}

/** 合并单条记录；`current` 为本地已有的同 ID 记录（没有则 null）。 */
export function mergeRecord(current: SyncRecord | null, incoming: SyncRecord): MergeStep {
  if (!current) return { action: 'insert', record: incoming }

  const relation: VersionRelation = compareVersionVectors(
    parseVersionVector(incoming.vv),
    parseVersionVector(current.vv),
  )
  const sameContent =
    recordContentFingerprint(incoming) === recordContentFingerprint(current)

  if (relation === 'equal') {
    return sameContent ? { action: 'duplicate' } : conflictBetween(current, incoming)
  }
  if (relation === 'dominates') {
    return { action: 'replace', record: incoming, previous: current }
  }
  if (relation === 'dominated') {
    return { action: 'stale' }
  }
  return conflictBetween(current, incoming)
}

/**
 * 应用一批记录。`existing` 是本地当前状态（可含墓碑）；返回合并后的完整状态。
 * 纯函数：不碰数据库、不依赖到达顺序。
 */
export function mergeRecords(
  existing: Iterable<SyncRecord>,
  incoming: Iterable<SyncRecord>,
): MergeBatchResult {
  const byKey = new Map<string, SyncRecord>()
  for (const record of existing) byKey.set(recordKey(record), record)

  const conflicts: MergeConflict[] = []
  const seenConflict = new Set<string>()
  let inserted = 0
  let replaced = 0
  let duplicates = 0
  let stale = 0

  for (const record of incoming) {
    const key = recordKey(record)
    const step = mergeRecord(byKey.get(key) ?? null, record)
    switch (step.action) {
      case 'insert':
        byKey.set(key, step.record)
        inserted += 1
        break
      case 'replace':
        byKey.set(key, step.record)
        replaced += 1
        break
      case 'conflict': {
        if (step.record !== step.previous) {
          byKey.set(key, step.record)
          replaced += 1
        }
        const conflictKey = `${key}\u0000${recordContentFingerprint(step.conflict.loser)}`
        if (!seenConflict.has(conflictKey)) {
          seenConflict.add(conflictKey)
          conflicts.push(step.conflict)
        }
        break
      }
      case 'duplicate':
        duplicates += 1
        break
      case 'stale':
        stale += 1
        break
    }
  }

  const records = [...byKey.values()].sort((left, right) => {
    const leftKey = recordKey(left)
    const rightKey = recordKey(right)
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
  })
  conflicts.sort((left, right) => {
    const leftKey = recordKey(left)
    const rightKey = recordKey(right)
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
  })

  return { records, conflicts, inserted, replaced, duplicates, stale }
}

export interface ResolutionStamp {
  rev: number
  vv: string
}

/**
 * 用户解决冲突后写回的新版本戳（`rev = 双方较大值 + 1`，`vv = 逐维最大`）。
 *
 * 本设备维度至少取 `rev` 的当前最大值再加一，保证新 `vv` 在**每一维**都 ≥ 两个旧版本：
 * 同时支配双方，其它设备应用后旧冲突不再复现。
 */
export function resolutionStamp(
  left: Pick<SyncRecord, 'rev' | 'vv'>,
  right: Pick<SyncRecord, 'rev' | 'vv'>,
  deviceId: string,
): ResolutionStamp {
  const vector = maxVersionVectors(
    parseVersionVector(left.vv),
    parseVersionVector(right.vv),
  )
  const rev = Math.max(left.rev, right.rev, vector[deviceId] ?? 0) + 1
  vector[deviceId] = rev
  const sorted: Record<string, number> = {}
  for (const key of Object.keys(vector).sort()) {
    const value = vector[key]
    if (value !== undefined) sorted[key] = value
  }
  return { rev, vv: JSON.stringify(sorted) }
}
