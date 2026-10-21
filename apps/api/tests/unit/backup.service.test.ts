import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma：只用到 $queryRaw 读迁移表
vi.mock('../../src/prisma.js', () => {
  const mockPrisma = {
    $queryRaw: vi.fn(),
  }
  return {
    prisma: mockPrisma,
  }
})

import { assertBackupVersion, getSchemaVersion } from '../../src/services/backup.service.js'
import { prisma } from '../../src/prisma.js'

const mockPrisma = prisma as any

const manifest = (schemaVersion: string) => ({
  exportedAt: '2026-10-21T00:00:00.000Z',
  schemaVersion,
  includes: ['transactions'] as const,
  stats: {},
})

describe('备份版本', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('读不到迁移表时返回 unknown', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('no such table'))
    expect(await getSchemaVersion()).toBe('unknown')
  })

  it('返回最新一条已应用的迁移名', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ migration_name: '20261021000000_init' }])
    expect(await getSchemaVersion()).toBe('20261021000000_init')
  })

  it('备份版本比当前应用新时拒绝导入', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ migration_name: '20261021000000_init' }])

    await expect(assertBackupVersion(manifest('20261101000000_newer'))).rejects.toThrow(/更新版本/)
  })

  it('备份版本比当前应用旧时允许导入', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ migration_name: '20261021000000_init' }])

    await expect(assertBackupVersion(manifest('20260101000000_older'))).resolves.toBeUndefined()
  })

  it('没有版本号的老备份照常导入', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ migration_name: '20261021000000_init' }])

    await expect(assertBackupVersion(undefined)).resolves.toBeUndefined()
    await expect(assertBackupVersion(manifest('unknown'))).resolves.toBeUndefined()
  })
})
