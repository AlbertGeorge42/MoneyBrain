import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolvePreviousSnapshotIds, sortSnapshotChain, type SnapshotChainNode } from '../src/index.js'

function node(overrides: Partial<SnapshotChainNode> & Pick<SnapshotChainNode, 'id'>): SnapshotChainNode {
  return {
    accountId: 'acc-1',
    date: '2026-11-01',
    createdAt: '2026-11-01T02:00:00.000Z',
    ...overrides,
  }
}

test('前链按账户、日期、创建时间、id 稳定排序', () => {
  const nodes = [
    node({ id: 'b', accountId: 'acc-2', date: '2026-11-01' }),
    node({ id: 'a-late', accountId: 'acc-1', date: '2026-11-02' }),
    node({ id: 'a-early', accountId: 'acc-1', date: '2026-11-01' }),
    node({ id: 'a-early-2', accountId: 'acc-1', date: '2026-11-01', createdAt: '2026-11-01T03:00:00.000Z' }),
  ]
  assert.deepEqual(
    sortSnapshotChain(nodes).map((item) => item.id),
    ['a-early', 'a-early-2', 'a-late', 'b'],
  )
})

test('同日同创建时间用 id 兜底，跨设备重算结果确定', () => {
  const nodes = [
    node({ id: 'snap-b', createdAt: null }),
    node({ id: 'snap-a', createdAt: null }),
  ]
  assert.deepEqual(sortSnapshotChain(nodes).map((item) => item.id), ['snap-a', 'snap-b'])
})

test('重算结果：每条指向前一条，每个账户第一条为 null', () => {
  const nodes = [
    node({ id: 's3', date: '2026-11-03' }),
    node({ id: 's1', date: '2026-11-01' }),
    node({ id: 's2', date: '2026-11-02' }),
    node({ id: 'other', accountId: 'acc-2', date: '2026-11-01' }),
  ]
  const links = resolvePreviousSnapshotIds(nodes)
  assert.deepEqual(
    [...links.entries()].sort(([left], [right]) => (left < right ? -1 : 1)),
    [
      ['other', null],
      ['s1', null],
      ['s2', 's1'],
      ['s3', 's2'],
    ],
  )
})

test('输入顺序任意，重算结果一致（乱序/幂等）', () => {
  const nodes = [
    node({ id: 's1', date: '2026-11-01' }),
    node({ id: 's2', date: '2026-11-02' }),
    node({ id: 's3', date: '2026-11-02', createdAt: '2026-11-02T05:00:00.000Z' }),
  ]
  const forward = resolvePreviousSnapshotIds(nodes)
  const backward = resolvePreviousSnapshotIds([...nodes].reverse())
  assert.deepEqual([...forward.entries()], [...backward.entries()])
  assert.deepEqual([...resolvePreviousSnapshotIds(nodes).entries()], [...forward.entries()])
})
