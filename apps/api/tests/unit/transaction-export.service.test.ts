import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    transaction: { findMany: vi.fn() },
  },
}))

vi.mock('../../src/prisma.js', () => ({ prisma: mockPrisma }))

import { exportTransactionsCSV } from '../../src/services/export/transaction-export.service.js'

describe('transaction-export.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('导出固定时间格式、账单标记与调整方向，并复用导入源 ID', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        importKey: 'csv:exp-1',
        type: 'expense',
        amount: 5000n,
        fee: 0n,
        coupon: 0n,
        date: new Date(2025, 0, 15, 10, 0, 0),
        note: '午饭',
        excludeFromIncomeExpense: true,
        account: { name: '现金' },
        toAccount: null,
        category: { name: '午餐', parentId: 'food', parent: { name: '餐饮' } },
        relatedTransactionId: null,
        relatedTransaction: null,
      },
      {
        id: 'tx-2',
        importKey: null,
        type: 'adjustment',
        amount: -10000n,
        fee: 0n,
        coupon: 0n,
        date: new Date(2025, 0, 16, 0, 30, 0),
        note: null,
        excludeFromIncomeExpense: false,
        account: { name: '现金' },
        toAccount: null,
        category: null,
        relatedTransactionId: null,
        relatedTransaction: null,
      },
    ])

    const csv = await exportTransactionsCSV()
    const lines = csv.replace(/^\uFEFF/, '').split('\n')

    expect(lines[1]).toContain('exp-1,2025-01-15 10:00:00,餐饮,午餐,支出,50.00,CNY,现金')
    expect(lines[1]).toContain('不计收支')
    expect(lines[2]).toContain('tx-2,2025-01-16 00:30:00,未分类,,调整,-100.00,CNY,现金')
  })
})
