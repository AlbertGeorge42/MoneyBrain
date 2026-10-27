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

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const prismaDir = resolve(repoRoot, 'apps/api/prisma')
const schemaPath = resolve(prismaDir, 'schema.prisma')
const tempSchemaPath = resolve(prismaDir, 'restore-drill-schema.prisma')
const tempDbPath = resolve(prismaDir, 'restore-drill.db')
const tempZipPath = resolve(prismaDir, 'restore-drill-backup.zip')
const prismaCli = resolve(repoRoot, 'node_modules/prisma/build/index.js')

const keepTemp = process.argv.includes('--keep')

type Totals = {
  accounts: number
  accountCategories: number
  transactionCategories: number
  transactions: number
  budgets: number
  snapshots: number
  /** 账户名 → 余额（整数分） */
  balances: Record<string, number>
  netWorth: number
}

const toLocalDate = (value: Date): string => {
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 库里的金额已经是整数分（BigInt），这里只做 minor 标注。 */
const toMinor = (value: bigint | number | null | undefined): Minor => minor(Number(value ?? 0))

/** 用领域层从原始交易重算每个账户的余额（不依赖任何缓存列）。 */
async function computeTotals(db: PrismaClient): Promise<Totals> {
  const [accounts, accountCategories, transactionCategories, transactions, budgets, snapshots] =
    await Promise.all([
      db.account.findMany(),
      db.accountCategory.count(),
      db.transactionCategory.count(),
      db.transaction.findMany(),
      db.budget.count(),
      db.investmentAllocationSnapshot.count(),
    ])

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
  let netWorth = 0

  for (const account of accounts) {
    const opening = {
      date: account.initialBalanceDate ? toLocalDate(account.initialBalanceDate) : null,
      amount: toMinor(account.initialBalance),
    }
    const balance = balanceBefore(account.id, opening, ledger, toLocalDate(new Date()))
    balances[account.name] = balance
    if (account.type === 'asset') netWorth += balance
    if (account.type === 'liability') netWorth -= balance
  }

  return {
    accounts: accounts.length,
    accountCategories,
    transactionCategories,
    transactions: transactions.length,
    budgets,
    snapshots,
    balances,
    netWorth,
  }
}

function diff(a: Totals, b: Totals): string[] {
  const problems: string[] = []
  const counts = [
    'accounts',
    'accountCategories',
    'transactionCategories',
    'transactions',
    'budgets',
    'snapshots',
  ] as const

  for (const key of counts) {
    if (a[key] !== b[key]) {
      problems.push(`${key}: 原库 ${a[key]} ≠ 恢复库 ${b[key]}`)
    }
  }
  if (a.netWorth !== b.netWorth) {
    problems.push(`netWorth: 原库 ${a.netWorth} ≠ 恢复库 ${b.netWorth}`)
  }
  for (const [name, value] of Object.entries(a.balances)) {
    const restored = b.balances[name]
    if (restored !== value) {
      problems.push(`账户「${name}」余额: 原库 ${value} ≠ 恢复库 ${restored ?? '缺失'}`)
    }
  }
  for (const name of Object.keys(b.balances)) {
    if (!(name in a.balances)) {
      problems.push(`账户「${name}」只出现在恢复库`)
    }
  }
  return problems
}

const toPosix = (path: string) => path.replace(/\\/g, '/')

async function main() {
  console.log('▶ 1/4 导出当前账本…')
  const { exportFullBackup } = await import('../apps/api/src/services/export/index.js')
  const zip = await exportFullBackup()
  writeFileSync(tempZipPath, zip)
  console.log(`  备份大小 ${(zip.length / 1024).toFixed(1)} KB`)

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
      tempZipPath,
    ],
    { stdio: 'inherit', env: { ...process.env, DATABASE_URL: tempUrl } },
  )

  console.log('▶ 4/4 重新计算两边的余额并对比')
  const live = new PrismaClient()
  const restored = new PrismaClient({ datasources: { db: { url: tempUrl } } })
  try {
    const liveTotals = await computeTotals(live)
    const restoredTotals = await computeTotals(restored)

    const problems = diff(liveTotals, restoredTotals)
    if (problems.length === 0) {
      console.log('✅ 恢复演练通过：备份能还原出完全相同的账户余额与数据量')
      console.log(
        `   账户 ${liveTotals.accounts} 个 · 交易 ${liveTotals.transactions} 笔 · 净资产 ${liveTotals.netWorth} 分`,
      )
    } else {
      console.error('❌ 恢复演练失败，备份与原库不一致：')
      for (const problem of problems) console.error(`   - ${problem}`)
      process.exitCode = 1
    }
  } finally {
    await live.$disconnect()
    await restored.$disconnect()
    if (!keepTemp) {
      if (existsSync(tempDbPath)) rmSync(tempDbPath)
      if (existsSync(tempZipPath)) rmSync(tempZipPath)
    } else {
      console.log(`临时库保留在 ${tempDbPath}`)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
