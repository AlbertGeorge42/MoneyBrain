import request from 'supertest'

const { default: app } = await import('../../src/index.js')
const { prisma } = await import('../../src/prisma.js')

const accountCategoryId = 'a6-cat-asset'
const categoryId = 'a6-txcat-expense'

async function createExpense(date: Date, note: string) {
  const account = await prisma.account.findFirst({ where: { name: 'A6测试账户' } })
  return request(app)
    .post('/api/transactions')
    .send({ type: 'expense', amount: 100, date: date.toISOString(), accountId: account!.id, categoryId, note })
}

describe('A6 导出范围与最早日期（本地日历日）', () => {
  beforeAll(async () => {
    await prisma.$connect()
    await prisma.accountCategory
      .createMany({ data: [{ id: accountCategoryId, name: 'A6现金', type: 'asset', sort: 0 }] })
      .catch(() => {})
    await prisma.transactionCategory
      .createMany({ data: [{ id: categoryId, name: 'A6餐饮', type: 'expense', sort: 0 }] })
      .catch(() => {})
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.auditEvent.deleteMany()
    await prisma.transaction.deleteMany()
    await prisma.account.deleteMany()
    await prisma.account.create({
      data: { name: 'A6测试账户', type: 'asset', initialBalance: 0, categoryId: accountCategoryId },
    })
  })

  it('date-only 导出范围包含本地首日 00:30 与末日 23:30 的交易', async () => {
    await createExpense(new Date(2026, 2, 1, 0, 30, 0), '凌晨单')
    await createExpense(new Date(2026, 2, 1, 23, 30, 0), '深夜单')

    const res = await request(app)
      .get('/api/data/export')
      .query({ startDate: '2026-03-01', endDate: '2026-03-01' })

    expect(res.status).toBe(200)
    expect(res.text).toContain('凌晨单')
    expect(res.text).toContain('深夜单')
  })

  it('earliest 返回交易所在的本地日历日', async () => {
    await createExpense(new Date(2026, 2, 1, 0, 30, 0), '凌晨单')

    const res = await request(app).get('/api/transactions/earliest')

    expect(res.status).toBe(200)
    expect(res.body.data.date).toBe('2026-03-01')
  })
})
