/**
 * 恢复演练：把当前账本导出成备份，再导入到一个临时库，
 * 最后对比两边的账户余额与各项数量。
 *
 * 目的不是「跑通导入」，而是证明**备份真的能还原出同样的钱**。
 * 有差异就说明导出会丢信息或导入会算错——这正是备份最该被验证的时刻。
 *
 * 用法：
 *   npm run db:drill            # 演练（自动清理临时库）
 *   npm run db:drill -- --keep  # 保留临时库以便排查
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { balanceBefore, minor } from '../packages/domain/src/index.js'
import type { LedgerTransaction, Minor } from '../packages/domain/src/index.js'
import {
  buildCategoryPaths,
  buildTransactionFingerprint,
  compareTotals,
  findDuplicateNames,
  type LedgerTotals,
} from './restore-drill-compare.mts'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const prismaDir = resolve(repoRoot, 'apps/api/prisma')
const schemaPath = resolve(prismaDir, 'schema.prisma')
const tempSchemaPath = resolve(prismaDir, 'restore-drill-schema.prisma')
const tempDbPath = resolve(prismaDir, 'restore-drill.db')
const tempContainerPath = resolve(prismaDir, 'restore-drill-backup.mbx')
const prismaCli = resolve(repoRoot, 'node_modules/prisma/build/index.js')

const keepTemp = process.argv.includes('--keep')

const toLocalDate = (value: Date): string => {
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 库里的金额已经是整数分（BigInt），这里只做 minor 标注。 */
const toMinor = (value: bigint | number | null | undefined): Minor => minor(Number(value ?? 0))

/** 用领域层从原始交易重算每个账户的余额（不依赖任何缓存列）。 */
async function computeTotals(db: PrismaClient): Promise<LedgerTotals> {
  const [accounts, accountCategories, transactionCategories, transactions, budgets, snapshots] =
    await Promise.all([
      db.account.findMany(),
      db.accountCategory.findMany({
        select: { id: true, name: true, type: true, parentId: true },
      }),
      db.transactionCategory.findMany({
        select: { id: true, name: true, type: true, parentId: true },
      }),
      // 导出只含未删除交易；对比口径以原库的未删除交易为准（B2）
      db.transaction.findMany({ where: { deletedAt: null } }),
      db.budget.count(),
      db.investmentAllocationSnapshot.count(),
    ])

  const accountNameById = new Map(accounts.map((account) => [account.id, account.name]))
  const transactionCategoryPaths = buildCategoryPaths(transactionCategories)
  const transactionCategoryPathById = new Map(
    transactionCategories.map((category, index) => [category.id, transactionCategoryPaths[index]!]),
  )

  const ledger: LedgerTransaction[] = transactions.map((t) => ({
    id: t.id,
    kind: t.type as LedgerTransaction['kind'],
    // 写入时的账务口径版本：历史数字按当时的规则解释
    ruleVersion: t.ruleVersion,
    date: toLocalDate(t.date),
    amount: toMinor(t.amount),
    fee: toMinor(t.fee),
    coupon: toMinor(t.coupon),
    accountId: t.accountId,
    toAccountId: t.toAccountId,
    categoryId: t.categoryId,
    relatedTransactionId: t.relatedTransactionId,
    relatedType: t.relatedType === 'income' || t.relatedType === 'expense' ? t.relatedType : null,
    excludeFromIncomeExpense: t.excludeFromIncomeExpense,
  }))

  const balances: Record<string, number> = {}
  const accountNames: Record<string, string> = {}
  let netWorth = 0

  for (const account of accounts) {
    const opening = {
      date: account.initialBalanceDate ? toLocalDate(account.initialBalanceDate) : null,
      amount: toMinor(account.initialBalance),
    }
    // 余额按 id 聚合：同名账户不会互相覆盖
    balances[account.id] = balanceBefore(account.id, opening, ledger, toLocalDate(new Date()))
    accountNames[account.id] = account.name
    if (account.type === 'asset') netWorth += balances[account.id]
    if (account.type === 'liability') netWorth -= balances[account.id]
  }

  const transactionFingerprints = transactions.map((t) =>
    buildTransactionFingerprint({
      type: t.type,
      date: toLocalDate(t.date),
      amount: Number(t.amount),
      fee: Number(t.fee),
      coupon: Number(t.coupon),
      accountName: accountNameById.get(t.accountId) ?? t.accountId,
      toAccountName: t.toAccountId ? accountNameById.get(t.toAccountId) ?? t.toAccountId : null,
      categoryPath: t.categoryId ? transactionCategoryPathById.get(t.categoryId) ?? null : null,
      relatedType: t.relatedType === 'income' || t.relatedType === 'expense' ? t.relatedType : null,
      excludeFromIncomeExpense: t.excludeFromIncomeExpense,
    }),
  )

  return {
    accounts: accounts.length,
    accountCategories: accountCategories.length,
    transactionCategories: transactionCategories.length,
    transactions: transactions.length,
    budgets,
    snapshots,
    balances,
    accountNames,
    accountNamesList: accounts.map((account) => account.name),
    accountCategoryKeys: buildCategoryPaths(accountCategories),
    transactionCategoryKeys: buildCategoryPaths(transactionCategories),
    transactionFingerprints,
    netWorth,
    duplicateNames: findDuplicateNames(accounts, accountCategories, transactionCategories),
  }
}

const toPosix = (path: string) => path.replace(/\\/g, '/')

async function main() {
  console.log('▶ 1/4 导出当前账本…')
  const { exportFullBackup } = await import('../apps/api/src/services/export/index.js')
  const container = await exportFullBackup()
  writeFileSync(tempContainerPath, container)
  console.log(`  加密备份大小 ${(container.length / 1024).toFixed(1)} KB`)

  console.log('▶ 2/4 建立临时库…')
  if (existsSync(tempDbPath)) rmSync(tempDbPath)
  const schema = readFileSync(schemaPath, 'utf8')
  const tempSchema = schema.replace(
    /url\s*=\s*"file:\.\/dev\.db"/,
    'url      = "file:./restore-drill.db"',
  )
  if (tempSchema === schema) {
    throw new Error('无法生成临时 schema：schema.prisma 的 datasource url 不是 file:./dev.db')
  }
  writeFileSync(tempSchemaPath, tempSchema, 'utf8')
  try {
    execFileSync(
      process.execPath,
      [prismaCli, 'migrate', 'deploy', '--schema', tempSchemaPath],
      { stdio: 'inherit', env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' } },
    )
  } finally {
    if (existsSync(tempSchemaPath)) rmSync(tempSchemaPath)
  }

  console.log('▶ 3/4 把备份导入临时库…')
  const tempUrl = `file:${toPosix(tempDbPath)}`
  execFileSync(
    process.execPath,
    [
      '--import',
      'tsx',
      resolve(repoRoot, 'scripts/restore-drill-import.mts'),
      tempUrl,
      tempContainerPath,
    ],
    { stdio: 'inherit', env: { ...process.env, DATABASE_URL: tempUrl } },
  )

  console.log('▶ 4/4 重新计算两边的余额并对比')
  const live = new PrismaClient()
  const restored = new PrismaClient({ datasources: { db: { url: tempUrl } } })
  try {
    const liveTotals = await computeTotals(live)
    const restoredTotals = await computeTotals(restored)

    const comparison = compareTotals(liveTotals, restoredTotals)
    if (comparison.identical) {
      console.log(
        '✅ 恢复演练通过：identical: true（库内按 id 聚合；跨库按名称/内容匹配——导入会重建 id）',
      )
      console.log(
        `   账户 ${liveTotals.accounts} 个 · 交易 ${liveTotals.transactions} 笔 · 净资产 ${liveTotals.netWorth} 分`,
      )
    } else {
      console.error('❌ 恢复演练失败：identical: false（还原内容与名称/内容口径不一致）')
      for (const problem of comparison.problems) console.error(`   - ${problem}`)
      process.exitCode = 1
    }
    if (comparison.hygieneNotes.length === 0) {
      console.log('ℹ️ 数据卫生提示：未发现同名重复（不影响 identical）')
    } else {
      console.log('ℹ️ 数据卫生提示（不影响 identical，未做任何清洗）：')
      for (const note of comparison.hygieneNotes) console.log(`   - ${note}`)
    }
  } finally {
    await live.$disconnect()
    await restored.$disconnect()
    if (!keepTemp) {
      if (existsSync(tempDbPath)) rmSync(tempDbPath)
      if (existsSync(tempContainerPath)) rmSync(tempContainerPath)
    } else {
      console.log(`临时库保留在 ${tempDbPath}`)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
