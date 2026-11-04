/**
 * 报表数据修复（D11）：账户分类补「现金等价 / 投资」标记，并回填账户的 categoryId。
 *
 * 为什么用 data script 而不是 schema 默认值：
 * - `Account.categoryId` 是关系字段，默认值只能是常量，无法按账户在当前库里的类型解析到分类行；
 * - 标记（isCashEquivalent / isInvestment）与回填都要作用于**已有行**，schema 默认值只影响新行；
 * - 这是一次性的存量修复，脚本可重复执行（已修复的行不会再次变动），迁移只运行一次且无法覆盖
 *   后续人工调整。
 *
 * 分类语义（对齐 UX 原型的账户分类树）：
 * - 顶层「资产」下补两个子分类：现金等价（isCashEquivalent）、投资（isInvestment）；
 * - 现金类账户挂「现金等价」，基金类挂「投资」，其余资产挂「资产」顶层（其他资产）；
 * - 负债账户挂「负债」顶层。
 *
 * 用法：npm run db:repair-report-data
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/** 现金等价账户（按现有账本命名；未命中的资产按顶层「资产」兜底） */
const CASH_ACCOUNTS = ['微信', '云闪付', '支付宝', '现金']
/** 投资账户 */
const INVEST_ACCOUNTS = ['雪球基金', '支付宝基金']

async function main() {
  const assetRoot = await prisma.accountCategory.findFirst({
    where: { name: '资产', type: 'asset', parentId: null },
  })
  const liabilityRoot = await prisma.accountCategory.findFirst({
    where: { name: '负债', type: 'liability', parentId: null },
  })
  if (!assetRoot || !liabilityRoot) {
    throw new Error('缺少顶层「资产 / 负债」账户分类，请先在账户分类中创建后再修数据')
  }

  const ensureChild = async (
    name: string,
    flags: { isCashEquivalent: boolean; isInvestment: boolean },
    sort: number
  ) => {
    const existing = await prisma.accountCategory.findFirst({
      where: { name, type: 'asset', parentId: assetRoot.id },
    })
    if (existing) {
      return prisma.accountCategory.update({
        where: { id: existing.id },
        data: flags,
      })
    }
    return prisma.accountCategory.create({
      data: {
        name,
        type: 'asset',
        parentId: assetRoot.id,
        sort,
        ...flags,
      },
    })
  }

  const cashCategory = await ensureChild(
    '现金等价',
    { isCashEquivalent: true, isInvestment: false },
    1
  )
  const investmentCategory = await ensureChild(
    '投资',
    { isCashEquivalent: false, isInvestment: true },
    2
  )

  const accounts = await prisma.account.findMany({ orderBy: { sort: 'asc' } })
  let updated = 0
  const mapped: Array<{ name: string; category: string }> = []

  for (const account of accounts) {
    if (account.categoryId) {
      continue
    }
    let target = account.type === 'liability' ? liabilityRoot : assetRoot
    if (account.type === 'asset') {
      if (CASH_ACCOUNTS.includes(account.name)) {
        target = cashCategory
      } else if (INVEST_ACCOUNTS.includes(account.name)) {
        target = investmentCategory
      }
    }
    await prisma.account.update({
      where: { id: account.id },
      data: { categoryId: target.id },
    })
    updated++
    mapped.push({ name: account.name, category: target.name })
  }

  console.log(
    JSON.stringify(
      {
        categories: [
          { name: cashCategory.name, isCashEquivalent: cashCategory.isCashEquivalent, isInvestment: cashCategory.isInvestment },
          { name: investmentCategory.name, isCashEquivalent: investmentCategory.isCashEquivalent, isInvestment: investmentCategory.isInvestment },
        ],
        accountsTotal: accounts.length,
        backfilled: updated,
        mapped,
      },
      null,
      2
    )
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
