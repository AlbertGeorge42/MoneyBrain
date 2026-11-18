import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAccountCategory, updateAccountCategory } from '../../src/services/account-category.service.js'
import { ValidationError } from '../../src/common/error.js'

vi.mock('../../src/prisma.js', () => {
  const mockPrisma = {
    accountCategory: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      aggregate: vi.fn().mockResolvedValue({ _max: { sort: null } }),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    account: { count: vi.fn().mockResolvedValue(0) },
    auditEvent: { create: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(mockPrisma)),
  }
  return { prisma: mockPrisma, default: mockPrisma }
})

import { prisma } from '../../src/prisma.js'
const mockPrisma = prisma as any

describe('account-category.service 层级约束', () => {
  beforeEach(() => vi.clearAllMocks())

  it('创建账户分类时拒绝非空 parentId', async () => {
    await expect(
      createAccountCategory({ name: '现金', type: 'asset', parentId: 'parent-1' })
    ).rejects.toBeInstanceOf(ValidationError)
    expect(mockPrisma.accountCategory.create).not.toHaveBeenCalled()
  })

  it('创建账户分类时 parentId 恒写 null', async () => {
    mockPrisma.accountCategory.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'acat-1', ...data })
    )
    await createAccountCategory({ name: '现金', type: 'asset', isCashEquivalent: true })
    const data = mockPrisma.accountCategory.create.mock.calls[0][0].data
    expect(data.parentId).toBeNull()
    expect(data.isCashEquivalent).toBe(true)
  })

  it('更新账户分类时拒绝迁入子级', async () => {
    mockPrisma.accountCategory.findUnique.mockResolvedValue({ id: 'acat-1', name: '现金', type: 'asset', parentId: null })
    await expect(
      updateAccountCategory('acat-1', { name: '现金', parentId: 'parent-1' } as any)
    ).rejects.toBeInstanceOf(ValidationError)
    expect(mockPrisma.accountCategory.update).not.toHaveBeenCalled()
  })
})
