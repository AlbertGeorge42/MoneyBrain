import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  InvalidSyncRecordError,
  SYNC_ENTITY_TYPES,
  mergeKnownRecords,
  partitionKnownRecords,
  validateSyncRecord,
  validateSyncRecords,
  type SyncRecord,
} from '../src/index.js'

function record(overrides: Partial<SyncRecord> = {}): SyncRecord {
  return {
    entityType: 'transaction',
    entityId: 'tx-1',
    rev: 1,
    vv: JSON.stringify({ deviceA: 1 }),
    deletedAt: null,
    data: { amount: -1200, accountId: 'acc-1' },
    ...overrides,
  }
}

test('合法记录通过校验，vv 键序被规范化', () => {
  const normalized = validateSyncRecord(record({ vv: JSON.stringify({ b: 2, a: 1 }) }))
  assert.equal(normalized.vv, JSON.stringify({ a: 1, b: 2 }))
  assert.deepEqual(normalized.data, { amount: -1200, accountId: 'acc-1' })
})

test('单条记录字段非法时抛错并带位置', () => {
  const cases: Array<[unknown, RegExp]> = [
    [record({ entityType: '' }), /entityType/],
    [record({ entityId: '' }), /entityId/],
    [record({ rev: 0 }), /rev/],
    [record({ rev: 1.5 }), /rev/],
    [record({ vv: '{}' }), /vv/],
    [record({ vv: '[]' }), /vv/],
    [record({ vv: JSON.stringify({ a: 0 }) }), /正整数/],
    [record({ deletedAt: 'not-a-date' }), /deletedAt/],
    [record({ data: { rev: 1 } }), /同步元数据/],
    [record({ data: { nested: Number.NaN } }), /有限数字/],
  ]
  for (const [raw, pattern] of cases) {
    assert.throws(() => validateSyncRecord(raw), (error: unknown) => {
      assert.equal(error instanceof InvalidSyncRecordError, true)
      assert.match((error as Error).message, pattern)
      return true
    })
  }
})

test('整批校验任一条失败即抛错（不返回前缀）', () => {
  assert.throws(
    () => validateSyncRecords([record(), record({ entityId: '' })]),
    /第 2 条/,
  )
  assert.throws(() => validateSyncRecords({}), /数组/)
})

test('未知 entityType 跳过并警告，已知实体照常合并', () => {
  const known = record()
  const unknown = record({ entityType: 'futureEntity', entityId: 'future-1' })

  const partition = partitionKnownRecords([known, unknown], Object.values(SYNC_ENTITY_TYPES))
  assert.equal(partition.accepted.length, 1)
  assert.equal(partition.skipped.length, 1)
  assert.equal(partition.skipped[0]!.reason, 'unknown-entity-type')

  const merged = mergeKnownRecords([], [known, unknown])
  assert.equal(merged.records.length, 1)
  assert.equal(merged.skipped.length, 1)
  assert.equal(merged.inserted, 1)
})

test('同一组记录任意顺序合并结果一致，重复应用幂等', () => {
  const first = record({ entityId: 'tx-1', rev: 1, vv: JSON.stringify({ deviceA: 1 }) })
  const second = record({
    entityId: 'tx-2',
    rev: 2,
    vv: JSON.stringify({ deviceA: 1 }),
    data: { amount: 800, accountId: 'acc-2' },
  })

  const forward = mergeKnownRecords([], [first, second])
  const backward = mergeKnownRecords([], [second, first])
  assert.deepEqual(forward.records, backward.records)

  const applied = mergeKnownRecords(forward.records, [first, second])
  assert.equal(applied.duplicates, 2)
  assert.deepEqual(applied.records, forward.records)
})
