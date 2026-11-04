import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  compareVersionVectors,
  findPendingRecords,
  mergeRecords,
  parseVersionVector,
  recordKey,
  resolutionStamp,
  type SyncRecord,
} from '../src/index.js'

interface VectorCase {
  name: string
  existing: SyncRecord[]
  incoming: SyncRecord[]
  expected: {
    records: SyncRecord[]
    inserted: number
    replaced: number
    duplicates: number
    stale: number
    conflicts: number
  }
}

interface VectorFile {
  version: number
  cases: VectorCase[]
}

const vectors: VectorFile = JSON.parse(
  readFileSync(new URL('../test-vectors/merge-vectors.json', import.meta.url), 'utf8'),
)

function record(
  entityType: string,
  entityId: string,
  rev: number,
  vv: Record<string, number>,
  data: SyncRecord['data'],
  deletedAt: string | null = null,
): SyncRecord {
  return { entityType, entityId, rev, vv: JSON.stringify(vv), deletedAt, data }
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  const result: T[][] = []
  for (let index = 0; index < items.length; index += 1) {
    const head = items[index]
    if (head === undefined) continue
    const rest = [...items.slice(0, index), ...items.slice(index + 1)]
    for (const tail of permutations(rest)) result.push([head, ...tail])
  }
  return result
}

test('固定向量：记录级合并的判定与结果逐字段一致', () => {
  assert.equal(vectors.version, 1)
  for (const vector of vectors.cases) {
    const result = mergeRecords(vector.existing, vector.incoming)
    assert.deepStrictEqual(result.records, vector.expected.records, vector.name)
    assert.equal(result.inserted, vector.expected.inserted, `${vector.name} inserted`)
    assert.equal(result.replaced, vector.expected.replaced, `${vector.name} replaced`)
    assert.equal(result.duplicates, vector.expected.duplicates, `${vector.name} duplicates`)
    assert.equal(result.stale, vector.expected.stale, `${vector.name} stale`)
    assert.equal(result.conflicts.length, vector.expected.conflicts, `${vector.name} conflicts`)
  }
})

test('任意顺序应用两次，结果逐字段一致（不变量 10）', () => {
  const base = record('transaction', 'tx-1', 1, { 'dev-a': 1 }, { amount: 10 })
  const concurrent = record('transaction', 'tx-1', 1, { 'dev-b': 1 }, { amount: 20 })
  const newer = record('transaction', 'tx-1', 2, { 'dev-a': 2 }, { amount: 30 })
  const account = record('account', 'acct-1', 1, { 'dev-a': 1 }, { name: '现金' })
  const batch = [base, concurrent, newer, account]

  const expected = mergeRecords([], batch).records
  const singlePass = mergeRecords([], batch)

  for (const order of permutations(batch)) {
    const first = mergeRecords([], order)
    const second = mergeRecords(first.records, order)
    assert.deepStrictEqual(first.records, expected, '首轮结果应与顺序无关')
    assert.deepStrictEqual(second.records, expected, '第二轮不应再改变字段')
  }

  // 同一批里的同一冲突在第二轮不应重复产出（避免冲突表堆重复行）。
  const repeated = mergeRecords(singlePass.records, [base, concurrent])
  assert.equal(repeated.conflicts.length, 1)
})

test('解决冲突的新记录同时支配双方，另一端不再复现同一冲突', () => {
  const left = record('transaction', 'tx-1', 2, { 'dev-a': 2 }, { amount: 100 })
  const right = record('transaction', 'tx-1', 1, { 'dev-b': 1 }, { amount: 200 })

  const stamp = resolutionStamp(left, right, 'dev-c')
  assert.equal(stamp.rev, 3)
  assert.deepStrictEqual(parseVersionVector(stamp.vv), {
    'dev-a': 2,
    'dev-b': 1,
    'dev-c': 3,
  })
  assert.equal(
    compareVersionVectors(parseVersionVector(stamp.vv), parseVersionVector(left.vv)),
    'dominates',
  )
  assert.equal(
    compareVersionVectors(parseVersionVector(stamp.vv), parseVersionVector(right.vv)),
    'dominates',
  )

  const resolution = record('transaction', 'tx-1', stamp.rev, parseVersionVector(stamp.vv), {
    amount: 150,
  })
  for (const local of [left, right]) {
    const result = mergeRecords([local], [resolution])
    assert.deepStrictEqual(result.records, [resolution])
    assert.equal(result.conflicts.length, 0, '另一端不应复现同一冲突')
  }
})

test('悬空引用进入待补全，补齐后转为正常；墓碑引用不静默复活', () => {
  const account = record('account', 'acct-1', 1, { 'dev-a': 1 }, { name: '现金' })
  const transaction = record(
    'transaction',
    'tx-1',
    1,
    { 'dev-a': 1 },
    { amount: 100, accountId: 'acct-1' },
  )

  // 账户还没到：交易待补全，不入账。
  const withoutAccount = findPendingRecords([transaction])
  assert.equal(withoutAccount.length, 1)
  assert.deepStrictEqual(withoutAccount[0]?.missing, [
    { entityType: 'account', entityId: 'acct-1' },
  ])

  // 账户补齐：交易不再待补全。
  assert.deepStrictEqual(findPendingRecords([account, transaction]), [])

  // 账户被删除：以墓碑为准，交易继续待补全并提示用户处理。
  const tombstone = record(
    'account',
    'acct-1',
    2,
    { 'dev-a': 2 },
    { name: '现金' },
    '2026-11-04T00:00:00.000Z',
  )
  const deleted = findPendingRecords([tombstone, transaction])
  assert.equal(deleted.length, 1)
  assert.deepStrictEqual(deleted[0]?.deleted, [
    { entityType: 'account', entityId: 'acct-1' },
  ])

  // 传递性：交易引用的账户自身待补全（缺分类）→ 交易也待补全。
  const accountMissingCategory = record(
    'account',
    'acct-2',
    1,
    { 'dev-a': 1 },
    { name: '银行卡', categoryId: 'acct-cat-1' },
  )
  const blockedTransaction = record(
    'transaction',
    'tx-2',
    1,
    { 'dev-a': 1 },
    { amount: 50, accountId: 'acct-2' },
  )
  const pending = findPendingRecords([accountMissingCategory, blockedTransaction])
  assert.deepStrictEqual(pending.map((item) => recordKey(item.record)).sort(), [
    recordKey(accountMissingCategory),
    recordKey(blockedTransaction),
  ])
  assert.deepStrictEqual(pending[1]?.blockedBy, [
    { entityType: 'account', entityId: 'acct-2' },
  ])
})
