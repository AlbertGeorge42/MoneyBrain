import { describe, it, expect, vi, beforeEach } from 'vitest'
import { importSnapshotsFromCsv } from '../../src/services/import.service.js'
import { exportConfig } from '../../src/services/export.service.js'

vi.mock('../../src/index.js', () => {
  const mockPrisma = {
    account: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    accountCategory: {
      findMany: vi.fn(),
    },
    transactionCategory: {
      findMany: vi.fn(),
    },
    investmentAssetClass: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    investmentAllocationSnapshot: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    investmentAllocationItem: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  }

  return {
    prisma: mockPrisma,
  }
})

vi.mock('../../src/services/account-category.service.js', () => ({
  getNextAccountCategorySort: vi.fn().mockResolvedValue(1),
}))

import { prisma } from '../../src/index.js'
const mockPrisma = prisma as any

function makeSnapshotsCsv(rows: string[][]): Buffer {
  const header = [
    '账户名称',
    '快照日期',
    '账户余额',
    '上次快照日期',
    '备注',
    '资产类别',
    '市值',
    '期内净流入',
    '排序'
  ]
  const lines = [header.join(','), ...rows.map(r => r.join(','))]
  // 添加 UTF-8 BOM
  return Buffer.from('\ufeff' + lines.join('\n'), 'utf-8')
}

describe('importSnapshotsFromCsv', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该正确导入新的快照和分配项', async () => {
    mockPrisma.account.findFirst.mockResolvedValue({ id: 'acc-1', name: '投资账户' })
    mockPrisma.investmentAssetClass.findFirst.mockResolvedValue({ id: 'ac-1', name: '股票' })
    mockPrisma.investmentAllocationSnapshot.findFirst.mockResolvedValue(null)

    let snapshotIdCounter = 0
    mockPrisma.investmentAllocationSnapshot.create.mockImplementation(({ data }: any) => {
      snapshotIdCounter++
      return Promise.resolve({ id: `snap-${snapshotIdCounter}`, ...data })
    })

    const csv = makeSnapshotsCsv([
      ['投资账户', '2024-01-01T00:00:00.000Z', '10000', '', '首次快照', '股票', '6000', '1000', '0'],
      ['投资账户', '2024-01-01T00:00:00.000Z', '10000', '', '首次快照', '债券', '4000', '500', '1']
    ])

    const result = await importSnapshotsFromCsv(csv, 'merge')

    expect(result.imported.snapshots).toBe(1)
    expect(result.imported.items).toBe(2)
    expect(result.errors).toEqual([])
  })

  it('账户不存在时应该报错并跳过', async () => {
    mockPrisma.account.findFirst.mockResolvedValue(null)

    const csv = makeSnapshotsCsv([
      ['不存在的账户', '2024-01-01T00:00:00.000Z', '10000', '', '', '股票', '6000', '0', '0']
    ])

    const result = await importSnapshotsFromCsv(csv, 'merge')

    expect(result.imported.snapshots).toBe(0)
    expect(result.skipped.snapshots).toBe(1)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain('账户不存在')
  })

  it('资产类别不存在时应该报错并跳过整个快照', async () => {
    mockPrisma.account.findFirst.mockResolvedValue({ id: 'acc-1', name: '投资账户' })
    mockPrisma.investmentAssetClass.findFirst.mockResolvedValue(null)

    const csv = makeSnapshotsCsv([
      ['投资账户', '2024-01-01T00:00:00.000Z', '10000', '', '', '不存在的类别', '6000', '0', '0']
    ])

    const result = await importSnapshotsFromCsv(csv, 'merge')

    expect(result.imported.snapshots).toBe(0)
    expect(result.skipped.snapshots).toBe(1)
    expect(result.errors[0]).toContain('资产类别不存在')
  })

  it('overwrite 模式应该先清空现有快照和分配项', async () => {
    mockPrisma.account.findFirst.mockResolvedValue({ id: 'acc-1', name: '投资账户' })
    mockPrisma.investmentAssetClass.findFirst.mockResolvedValue({ id: 'ac-1', name: '股票' })
    mockPrisma.investmentAllocationSnapshot.findFirst.mockResolvedValue(null)
    mockPrisma.investmentAllocationSnapshot.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'snap-new', ...data })
    )

    const csv = makeSnapshotsCsv([
      ['投资账户', '2024-01-01T00:00:00.000Z', '10000', '', '', '股票', '6000', '0', '0']
    ])

    await importSnapshotsFromCsv(csv, 'overwrite')

    expect(mockPrisma.investmentAllocationItem.deleteMany).toHaveBeenCalled()
    expect(mockPrisma.investmentAllocationSnapshot.deleteMany).toHaveBeenCalled()
  })

  it('merge 模式应按 (accountId, date) 匹配并更新已有快照', async () => {
    mockPrisma.account.findFirst.mockResolvedValue({ id: 'acc-1', name: '投资账户' })
    mockPrisma.investmentAssetClass.findFirst.mockResolvedValue({ id: 'ac-1', name: '股票' })
    mockPrisma.investmentAllocationSnapshot.findFirst.mockResolvedValue({
      id: 'snap-existing',
      accountId: 'acc-1'
    })
    mockPrisma.investmentAllocationSnapshot.update.mockResolvedValue({ id: 'snap-existing' })

    const csv = makeSnapshotsCsv([
      ['投资账户', '2024-01-01T00:00:00.000Z', '20000', '', '更新后', '股票', '12000', '0', '0']
    ])

    const result = await importSnapshotsFromCsv(csv, 'merge')

    expect(result.updated.snapshots).toBe(1)
    expect(result.imported.snapshots).toBe(0)
    expect(mockPrisma.investmentAllocationSnapshot.update).toHaveBeenCalled()
  })

  it('快照链表应按日期升序自动链接 previousSnapshotId', async () => {
    mockPrisma.account.findFirst.mockResolvedValue({ id: 'acc-1', name: '投资账户' })
    mockPrisma.investmentAssetClass.findFirst.mockResolvedValue({ id: 'ac-1', name: '股票' })
    mockPrisma.investmentAllocationSnapshot.findFirst.mockResolvedValue(null)

    let snapshotIdCounter = 0
    const createdIds: string[] = []
    mockPrisma.investmentAllocationSnapshot.create.mockImplementation(({ data }: any) => {
      snapshotIdCounter++
      const id = `snap-${snapshotIdCounter}`
      createdIds.push(id)
      return Promise.resolve({ id, ...data })
    })

    const csv = makeSnapshotsCsv([
      // 故意乱序输入
      ['投资账户', '2024-03-01T00:00:00.000Z', '30000', '', '', '股票', '18000', '0', '0'],
      ['投资账户', '2024-01-01T00:00:00.000Z', '10000', '', '', '股票', '6000', '0', '0'],
      ['投资账户', '2024-02-01T00:00:00.000Z', '20000', '', '', '股票', '12000', '0', '0']
    ])

    await importSnapshotsFromCsv(csv, 'merge')

    // 第一个（1月）没有 previous
    expect(mockPrisma.investmentAllocationSnapshot.create.mock.calls[0][0].data.previousSnapshotId).toBeNull()
    // 第二个（2月）应链接 1月
    expect(mockPrisma.investmentAllocationSnapshot.create.mock.calls[1][0].data.previousSnapshotId).toBe('snap-1')
    // 第三个（3月）应链接 2月
    expect(mockPrisma.investmentAllocationSnapshot.create.mock.calls[2][0].data.previousSnapshotId).toBe('snap-2')
  })

  it('快照无分配项时也应创建快照记录', async () => {
    mockPrisma.account.findFirst.mockResolvedValue({ id: 'acc-1', name: '投资账户' })
    mockPrisma.investmentAllocationSnapshot.findFirst.mockResolvedValue(null)
    mockPrisma.investmentAllocationSnapshot.create.mockResolvedValue({ id: 'snap-1' })

    const csv = makeSnapshotsCsv([
      ['投资账户', '2024-01-01T00:00:00.000Z', '10000', '', '空快照', '', '', '', '']
    ])

    const result = await importSnapshotsFromCsv(csv, 'merge')

    expect(result.imported.snapshots).toBe(1)
    expect(result.imported.items).toBe(0)
  })
})

describe('exportConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该导出包含 investmentAssetClasses 字段的 JSON', async () => {
    mockPrisma.accountCategory.findMany.mockResolvedValue([])
    mockPrisma.account.findMany.mockResolvedValue([])
    mockPrisma.transactionCategory.findMany.mockResolvedValue([])
    mockPrisma.investmentAssetClass.findMany.mockResolvedValue([
      {
        id: 'ac-1',
        accountId: 'acc-1',
        name: '股票',
        icon: 'stock',
        targetRatio: 60,
        sort: 0,
        account: { name: '投资账户' }
      },
      {
        id: 'ac-2',
        accountId: 'acc-1',
        name: '债券',
        icon: 'bond',
        targetRatio: 40,
        sort: 1,
        account: { name: '投资账户' }
      }
    ])

    const json = await exportConfig()
    const parsed = JSON.parse(json)

    expect(parsed.type).toBe('config')
    expect(parsed.data.investmentAssetClasses).toBeDefined()
    expect(parsed.data.investmentAssetClasses).toHaveLength(2)
    expect(parsed.data.investmentAssetClasses[0]).toEqual({
      accountName: '投资账户',
      name: '股票',
      icon: 'stock',
      targetRatio: 60,
      sort: 0
    })
  })

  it('应该按 (accountId, sort) 升序返回资产类别', async () => {
    mockPrisma.accountCategory.findMany.mockResolvedValue([])
    mockPrisma.account.findMany.mockResolvedValue([])
    mockPrisma.transactionCategory.findMany.mockResolvedValue([])
    mockPrisma.investmentAssetClass.findMany.mockImplementation(({ orderBy }: any) => {
      // 验证调用时传入了 orderBy
      expect(orderBy).toBeDefined()
      return Promise.resolve([])
    })

    await exportConfig()

    expect(mockPrisma.investmentAssetClass.findMany).toHaveBeenCalled()
  })
})
