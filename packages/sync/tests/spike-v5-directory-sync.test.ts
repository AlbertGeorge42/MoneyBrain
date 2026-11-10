import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ContainerError,
  encodeVersionVector,
  mergeRecords,
  openContainer,
  parseVersionVector,
  recordKey,
  sealContainer,
  type MergeConflict,
  type SyncRecord,
} from '../src/index.js'

// V5 目录同步收敛验证（不属于产品路径，但作为记录级合并的回归守卫保留）。
//
// 目标：两个实例（同一账本、不同 deviceId）只通过共享目录里的 `.mbx` 文件交换，
// 证明「多轮之后记录集一致；乱序/重复读取结果不变；半文件/非容器文件只被拒绝，
// 不会污染实例状态，也不会阻断后续收敛」。KDF 默认参数实测结论见 docs/roadmap.md §3，
// 本测试用低成本参数以免拖慢 `npm run test:sync`。

const FAST_KDF = { t: 1, m: 8192, p: 1, dkLen: 32 }
const LEDGER_ID = 'ledger-v5-spike'
const RECOVERY_CODE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

interface Instance {
  deviceId: string
  rev: number
  records: Map<string, SyncRecord>
  conflicts: MergeConflict[]
  rejectedFiles: string[]
  applied: number
  duplicates: number
}

type Directory = Map<string, Buffer>

function newInstance(deviceId: string): Instance {
  return { deviceId, rev: 0, records: new Map(), conflicts: [], rejectedFiles: [], applied: 0, duplicates: 0 }
}

/** 本地写入：rev 自增，vv 只抬高本设备维度；删除用墓碑（同一实体 id 的新版本）。 */
function localEdit(
  instance: Instance,
  entityType: string,
  entityId: string,
  data: SyncRecord['data'],
  deletedAt: string | null = null,
): void {
  const key = recordKey({ entityType, entityId })
  const current = instance.records.get(key)
  const rev = Math.max(instance.rev, current?.rev ?? 0) + 1
  instance.rev = rev
  const vector = parseVersionVector(current?.vv)
  vector[instance.deviceId] = rev
  instance.records.set(key, {
    entityType,
    entityId,
    rev,
    vv: encodeVersionVector(vector),
    deletedAt,
    data,
  })
}

function snapshot(instance: Instance): SyncRecord[] {
  return [...instance.records.values()]
    .map((record) => ({ ...record, vv: encodeVersionVector(parseVersionVector(record.vv)) }))
    .sort((left, right) => {
      const leftKey = recordKey(left)
      const rightKey = recordKey(right)
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
    })
}

/** 实例发布自己的全量容器；真实实现要求「临时文件 + 原子改名」，这里只模拟目录里的一份文件。 */
async function publish(instance: Instance, directory: Directory): Promise<void> {
  const bytes = await sealContainer([...instance.records.values()], RECOVERY_CODE, {
    ledgerId: LEDGER_ID,
    kdf: FAST_KDF,
  })
  directory.set(`${instance.deviceId}.mbx`, bytes)
}

/** 读取目录里的所有容器并合并；reverse 模拟乱序，twice 模拟重复读取同一份文件。 */
async function applyDirectory(
  instance: Instance,
  directory: Directory,
  options: { reverse?: boolean; twice?: boolean } = {},
): Promise<void> {
  const entries = [...directory.entries()].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  )
  if (options.reverse) entries.reverse()
  if (options.twice) entries.push(...entries)

  for (const [name, bytes] of entries) {
    let incoming: SyncRecord[]
    try {
      incoming = (
        await openContainer(bytes, RECOVERY_CODE, { expectedLedgerId: LEDGER_ID })
      ).records
    } catch (error) {
      assert.ok(error instanceof ContainerError, `${name} 必须以容器错误失败关闭`)
      instance.rejectedFiles.push(name)
      continue
    }
    const result = mergeRecords(instance.records.values(), incoming)
    instance.records = new Map(result.records.map((record) => [recordKey(record), record]))
    instance.conflicts.push(...result.conflicts)
    instance.applied += 1
    instance.duplicates += result.duplicates
  }
}

test('V5：两实例目录同步收敛，乱序 / 重复读取结果不变', async () => {
  const directory: Directory = new Map()
  const first = newInstance('dev-a')
  const second = newInstance('dev-b')

  localEdit(first, 'account', 'acc-a', { name: '现金', balance: 1000 })
  localEdit(first, 'transaction', 'tx-a', { accountId: 'acc-a', amount: 250 })
  localEdit(first, 'transaction', 'tx-gone', { accountId: 'acc-a', amount: 90 })
  localEdit(first, 'transaction', 'tx-gone', { accountId: 'acc-a', amount: 90 }, '2026-11-05T00:00:00.000Z')
  localEdit(second, 'account', 'acc-b', { name: '银行卡', balance: 2000 })
  localEdit(second, 'transaction', 'tx-b', { accountId: 'acc-b', amount: 30 })
  // 两边同时创建同一 entityId：真并发，必须稳定收敛到同一版。
  localEdit(first, 'account', 'acc-shared', { name: '钱包', balance: 300 })
  localEdit(second, 'account', 'acc-shared', { name: '钱包', balance: 500 })

  for (let round = 1; round <= 3; round += 1) {
    await publish(first, directory)
    await publish(second, directory)
    await applyDirectory(first, directory, { reverse: round === 2, twice: round === 3 })
    await applyDirectory(second, directory, { reverse: round !== 2, twice: round === 3 })
  }

  assert.deepStrictEqual(snapshot(first), snapshot(second))
  assert.equal(snapshot(first).length, 6)
  assert.equal(first.rejectedFiles.length, 0)
  assert.equal(second.rejectedFiles.length, 0)
  assert.ok(first.duplicates > 0 && second.duplicates > 0, '重复读取必须走幂等分支')
  assert.ok(first.conflicts.length > 0 && second.conflicts.length > 0, '并发写入必须被检出')

  const tombstone = first.records.get(recordKey({ entityType: 'transaction', entityId: 'tx-gone' }))
  assert.equal(tombstone?.deletedAt, '2026-11-05T00:00:00.000Z')
  assert.equal(
    second.records.get(recordKey({ entityType: 'transaction', entityId: 'tx-gone' }))?.deletedAt,
    '2026-11-05T00:00:00.000Z',
  )

  const winnerOnFirst = first.records.get(recordKey({ entityType: 'account', entityId: 'acc-shared' }))
  const winnerOnSecond = second.records.get(recordKey({ entityType: 'account', entityId: 'acc-shared' }))
  assert.deepStrictEqual(winnerOnFirst, winnerOnSecond)
})

test('V5：半文件 / 非容器文件只被拒绝，不污染状态也不阻断后续收敛', async () => {
  const directory: Directory = new Map()
  const first = newInstance('dev-a')
  const second = newInstance('dev-b')

  localEdit(first, 'account', 'acc-a', { name: '现金', balance: 1000 })
  localEdit(second, 'account', 'acc-b', { name: '银行卡', balance: 2000 })

  await publish(first, directory)
  await publish(second, directory)
  await applyDirectory(first, directory)
  await applyDirectory(second, directory)

  const validSecond = directory.get('dev-b.mbx')
  assert.ok(validSecond)
  directory.set('torn.mbx', validSecond.subarray(0, validSecond.length - 32))
  directory.set('junk.mbx', Buffer.from('这不是 MoneyBrain 容器'))

  const beforeFirst = snapshot(first)
  const beforeSecond = snapshot(second)
  await applyDirectory(first, directory)
  await applyDirectory(second, directory)

  assert.deepStrictEqual(snapshot(first), beforeFirst)
  assert.deepStrictEqual(snapshot(second), beforeSecond)
  assert.deepStrictEqual(first.rejectedFiles, ['junk.mbx', 'torn.mbx'])
  assert.deepStrictEqual(second.rejectedFiles, ['junk.mbx', 'torn.mbx'])

  directory.delete('torn.mbx')
  directory.delete('junk.mbx')
  await publish(first, directory)
  await publish(second, directory)
  await applyDirectory(first, directory)
  await applyDirectory(second, directory)

  assert.deepStrictEqual(snapshot(first), snapshot(second))
  assert.equal(snapshot(first).length, 2)
})
