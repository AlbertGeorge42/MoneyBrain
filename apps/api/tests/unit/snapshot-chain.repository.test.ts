import { describe, it, expect, vi, beforeEach } from 'vitest'
import { relinkSnapshots } from '../../src/db/repositories/snapshot-chain.repository.js'

interface Row {
  id: string
  accountId: string
  date: Date
  createdAt: Date
  previousSnapshotId: string | null
}

function row(overrides: Partial<Row> & Pick<Row, 'id'>): Row {
  return {
    accountId: 'acc-1',
    date: new Date(2024, 0, 1),
    createdAt: new Date(2024, 0, 1),
    previousSnapshotId: null,
    ...overrides,
  }
}

function makeClient(rows: Row[]) {
  return {
    investmentAllocationSnapshot: {
      findMany: vi.fn().mockResolvedValue(rows),
      update: vi.fn().mockResolvedValue({}),
    },
  }
}

describe('relinkSnapshots', () => {
  let client: ReturnType<typeof makeClient>

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('按 Domain 唯一规则重链：账户分区、日期升序、同日按 createdAt → id', async () => {
    client = makeClient([
      row({ id: 'b-2', accountId: 'acc-2', date: new Date(2024, 1, 1) }),
      row({ id: 'a-3', date: new Date(2024, 2, 1) }),
      row({ id: 'a-1', date: new Date(2024, 0, 1) }),
      row({ id: 'a-2', date: new Date(2024, 0, 1), createdAt: new Date(2024, 0, 2) }),
      row({ id: 'b-1', accountId: 'acc-2', date: new Date(2024, 0, 1) }),
    ])

    const updated = await relinkSnapshots(client as any)

    expect(updated).toBe(3)
    const calls = client.investmentAllocationSnapshot.update.mock.calls.map((call: any) => call[0])
    expect(calls).toEqual(expect.arrayContaining([
      { where: { id: 'a-2' }, data: { previousSnapshotId: 'a-1' } },
      { where: { id: 'a-3' }, data: { previousSnapshotId: 'a-2' } },
      { where: { id: 'b-2' }, data: { previousSnapshotId: 'b-1' } },
    ]))
    // 每个账户的第一条保持 null，不跨账户串链
    expect(calls).not.toEqual(expect.arrayContaining([
      { where: { id: 'a-1' }, data: { previousSnapshotId: expect.anything() } },
      { where: { id: 'b-1' }, data: { previousSnapshotId: expect.anything() } },
    ]))
  })

  it('只写派生字段，不推进 rev / vv；已正确的链零写入', async () => {
    client = makeClient([
      row({ id: 's1', date: new Date(2024, 0, 1), previousSnapshotId: null }),
      row({ id: 's2', date: new Date(2024, 1, 1), previousSnapshotId: 's1' }),
      row({ id: 's3', date: new Date(2024, 2, 1), previousSnapshotId: 's2' }),
    ])

    expect(await relinkSnapshots(client as any)).toBe(0)
    expect(client.investmentAllocationSnapshot.update).not.toHaveBeenCalled()

    client = makeClient([
      row({ id: 's1', date: new Date(2024, 0, 1), previousSnapshotId: null }),
      row({ id: 's2', date: new Date(2024, 1, 1), previousSnapshotId: null }),
    ])
    await relinkSnapshots(client as any)
    for (const call of client.investmentAllocationSnapshot.update.mock.calls as any[]) {
      expect(Object.keys(call[0].data)).toEqual(['previousSnapshotId'])
    }
  })

  it('accountIds 限定重算范围，省略时查全库', async () => {
    client = makeClient([])
    await relinkSnapshots(client as any, ['acc-9'])
    expect(client.investmentAllocationSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: { in: ['acc-9'] } } }),
    )

    client = makeClient([])
    await relinkSnapshots(client as any)
    expect(client.investmentAllocationSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    )
  })
})
