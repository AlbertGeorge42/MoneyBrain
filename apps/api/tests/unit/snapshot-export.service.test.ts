import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFindMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
}))

vi.mock('../../src/db/repositories/investment-allocation-snapshot.repository.js', () => ({
  SNAPSHOT_ITEMS_RELATIONS: {},
  findMany: mockFindMany,
}))

import { exportInvestmentSnapshotsCSV } from '../../src/services/export/snapshot-export.service.js'

describe('snapshot-export.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('快照日期导出为本地日历日（YYYY-MM-DD）', async () => {
    mockFindMany.mockResolvedValue([
      {
        account: { name: '投资账户' },
        date: new Date(2026, 2, 1, 0, 30, 0),
        accountBalance: 10000n,
        previousSnapshot: { date: new Date(2026, 1, 1, 23, 30, 0) },
        note: null,
        items: [
          {
            assetClass: { name: '股票' },
            marketValue: 10000n,
            periodNetFlow: 0n,
            sort: 0,
          },
        ],
      },
    ])

    const csv = await exportInvestmentSnapshotsCSV()
    const lines = csv.replace(/^\uFEFF/, '').split('\n')

    expect(lines[1]).toContain('投资账户,2026-03-01,')
    expect(lines[1]).toContain('2026-02-01')
    expect(lines[1]).not.toContain('T00:00:00')
  })
})
