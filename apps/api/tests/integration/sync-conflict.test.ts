import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testDbPath = path.resolve(__dirname, '../../prisma/test.db')

// 必须在导入 src/prisma.ts 之前指向测试库
process.env.DATABASE_URL = `file:${testDbPath}`

const { prisma } = await import('../../src/prisma.js')
const { mergeRecords } = await import('../../../../packages/sync/src/index.js')
const repository = await import('../../src/db/repositories/sync-conflict.repository.js')

// F-B：不可比时输的一版必须落 `sync_conflicts` 本地表；
// 重复应用同一批记录不产生重复行，解决的冲突行保留。

const left = {
  entityType: 'transaction',
  entityId: 'conflict-tx-1',
  rev: 2,
  vv: JSON.stringify({ 'dev-a': 2 }),
  deletedAt: null,
  data: { amount: 100, accountId: 'conflict-acct-1' },
}

const right = {
  entityType: 'transaction',
  entityId: 'conflict-tx-1',
  rev: 1,
  vv: JSON.stringify({ 'dev-b': 1 }),
  deletedAt: null,
  data: { amount: 200, accountId: 'conflict-acct-1' },
}

describe('F-B 同步冲突表', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.syncConflict.deleteMany()
  })

  it('输的版本落库，重复检出不堆重复行', async () => {
    const merged = mergeRecords([left], [right])
    expect(merged.records).toEqual([left])
    expect(merged.conflicts).toHaveLength(1)

    const saved = await repository.recordConflict(merged.conflicts[0])
    expect(saved.entityType).toBe('transaction')
    expect(saved.entityId).toBe('conflict-tx-1')
    expect(JSON.parse(saved.versionA).rev).toBe(2)
    expect(JSON.parse(saved.versionB)).toEqual(right)

    // 再次应用同一批（模拟重复导出/导入）：行数不增加，输家内容不变。
    const again = mergeRecords(merged.records, [left, right])
    expect(again.conflicts).toHaveLength(1)
    const duplicate = await repository.recordConflict(again.conflicts[0])
    expect(duplicate.id).toBe(saved.id)
    expect(await prisma.syncConflict.count()).toBe(1)

    const rows = await repository.listUnresolvedConflicts()
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0].versionB)).toEqual(right)
  })

  it('解决冲突后行保留但不再是待处理', async () => {
    const merged = mergeRecords([left], [right])
    const saved = await repository.recordConflict(merged.conflicts[0])
    await repository.markConflictResolved(saved.id)

    expect(await repository.listUnresolvedConflicts()).toHaveLength(0)
    const row = await prisma.syncConflict.findUnique({ where: { id: saved.id } })
    expect(row?.resolvedAt).not.toBeNull()
  })
})
