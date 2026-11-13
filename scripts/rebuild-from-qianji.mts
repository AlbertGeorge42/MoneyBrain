/**
 * 用钱迹 CSV + Excel 月度锚点重建一本干净的账本。
 *
 * 数据源：
 *   - 交易：钱迹导出的 transactions.csv（3,291 行）
 *   - 账户期初：2025-01-01 Excel 资产负债表
 *   - 历史平帐：scripts/data/qianji-rebuild-adjustments.json（89 条，逐月账户级差额）
 *
 * 只写 --db 指定的文件，默认 apps/api/prisma/dev-rebuild.db；
 * 拒绝 dev.db / test.db，绝不打开或迁移真实账本。
 *
 * 用法：
 *   node --import tsx scripts/rebuild-from-qianji.mts --csv <transactions.csv>
 *   node --import tsx scripts/rebuild-from-qianji.mts --csv <...> --db apps/api/prisma/dev-rebuild.db
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import Papa from 'papaparse'
import { PrismaClient } from '@prisma/client'
import { balanceBefore, minor, type LedgerTransaction } from '../packages/domain/src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const prismaDir = resolve(repoRoot, 'apps/api/prisma')
const schemaPath = resolve(prismaDir, 'schema.prisma')
const prismaCli = resolve(repoRoot, 'node_modules/prisma/build/index.js')
const adjustmentsPath = resolve(here, 'data/qianji-rebuild-adjustments.json')

const argValue = (name: string): string | undefined => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const csvPath = argValue('--csv')
if (!csvPath) throw new Error('缺少 --csv <transactions.csv>')
const dbPath = resolve(repoRoot, argValue('--db') ?? 'apps/api/prisma/dev-rebuild.db')
const dbFileName = basename(dbPath)
if (dbFileName === 'dev.db' || dbFileName === 'test.db') {
  throw new Error(`拒绝写入真实账本：${dbPath}`)
}

const toPosix = (path: string) => path.replace(/\\/g, '/')
const toLocalDate = (value: Date): string => {
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const centsOf = (value: string, label: string): number => {
  const text = value.trim()
  if (!text) return 0
  // 钱迹导出会出现 9.969999999999999 这类浮点尾差，按分四舍五入而不是拒绝。
  if (!/^-?\d+(\.\d+)?$/.test(text) || !Number.isFinite(Number(text))) {
    throw new Error(`${label} 金额非法：${value}`)
  }
  return Math.round(Number(text) * 100)
}

const parseLocalDateTime = (value: string): Date => {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value.trim())
  if (!match) throw new Error(`日期非法：${value}`)
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0),
    Number(match[6] ?? 0),
  )
}

// ─── 账户与分类的最终形态 ───

const ACCOUNT_GROUPS = [
  { id: 'acg-liquid', name: '现金', type: 'asset', parentId: null, sort: 0, isCashEquivalent: true, isInvestment: false },
  { id: 'acg-provident', name: '长期', type: 'asset', parentId: null, sort: 1, isCashEquivalent: false, isInvestment: false },
  { id: 'acg-investment', name: '投资', type: 'asset', parentId: null, sort: 2, isCashEquivalent: false, isInvestment: true },
  { id: 'acg-credit', name: '短期负债', type: 'liability', parentId: null, sort: 3, isCashEquivalent: false, isInvestment: false },
] as const

const ACCOUNTS = [
  { id: 'acc-alipay', name: '支付宝', type: 'asset', group: 'acg-liquid', initial: 824695, sort: 0 },
  { id: 'acc-wechat', name: '微信', type: 'asset', group: 'acg-liquid', initial: 650501, sort: 1 },
  { id: 'acc-unionpay', name: '云闪付', type: 'asset', group: 'acg-liquid', initial: 2312400, sort: 2 },
  { id: 'acc-cash', name: '现金', type: 'asset', group: 'acg-liquid', initial: 0, sort: 3 },
  { id: 'acc-provident', name: '公积金', type: 'asset', group: 'acg-provident', initial: 9016938, sort: 4 },
  { id: 'acc-xueqiu', name: '雪球基金', type: 'asset', group: 'acg-investment', initial: 10062521, sort: 5 },
  { id: 'acc-alipay-fund', name: '支付宝基金', type: 'asset', group: 'acg-investment', initial: 12892253, sort: 6 },
  { id: 'acc-minsheng', name: '民生银行', type: 'liability', group: 'acg-credit', initial: -61794, sort: 7 },
  { id: 'acc-huabei', name: '花呗', type: 'liability', group: 'acg-credit', initial: -889487, sort: 8 },
  { id: 'acc-jd-baitiao', name: '京东白条', type: 'liability', group: 'acg-credit', initial: -699166, sort: 9 },
  { id: 'acc-meituan', name: '美团月付', type: 'liability', group: 'acg-credit', initial: -56320, sort: 10 },
  { id: 'acc-1688', name: '1688', type: 'liability', group: 'acg-credit', initial: -67680, sort: 11 },
  { id: 'acc-unreported', name: '未报账项', type: 'asset', group: 'acg-liquid', initial: 0, sort: 12 },
] as const

/** 支出树：10 个一级 / 39 个二级。 */
const EXPENSE_TREE: Record<string, string[]> = {
  餐饮: ['三餐', '饮品', '聚会', '零食'],
  交通: ['地铁', '打车', '公交', '火车', '停车费', '共享单车'],
  生活: ['会员', '电费', '话费', '水费', '医疗', '燃气', '理发', '物业费'],
  消费: ['日用品', '电子产品', '家具', '家电', '护肤品'],
  娱乐: ['游戏', '玩具', '装饰', '电影', '门票', 'K歌', '书籍', '旅行', '展览'],
  送礼: ['礼物', '礼金'],
  服饰: ['衣裤', '鞋子', '包包', '内衣'],
  恋爱: [],
  其它: [],
  投资亏损: ['基金'],
}

/** 收入树：5 个一级 / 2 个二级。 */
const INCOME_TREE: Record<string, string[]> = {
  工资: [],
  红包: [],
  公积金: [],
  投资: ['利息', '基金'],
  其它: [],
}

const accountIdByName = new Map(ACCOUNTS.map((account) => [account.name, account.id]))
const categoryIdByKey = new Map<string, string>()
const categoryRoots: Array<{
  id: string
  name: string
  type: 'income' | 'expense'
  sort: number
  parentId: null
}> = []
const categoryChildren: Array<{
  id: string
  name: string
  type: 'income' | 'expense'
  sort: number
  parentId: string
}> = []

for (const [type, tree] of [
  ['expense', EXPENSE_TREE],
  ['income', INCOME_TREE],
] as const) {
  Object.entries(tree).forEach(([root, children], rootIndex) => {
    const rootId = `tcat-${type}-${root}`
    categoryRoots.push({ id: rootId, name: root, type, sort: rootIndex, parentId: null })
    categoryIdByKey.set(`${type}|${root}|`, rootId)
    children.forEach((child, childIndex) => {
      const childId = `tcat-${type}-${root}-${child}`
      categoryChildren.push({ id: childId, name: child, type, sort: childIndex, parentId: rootId })
      categoryIdByKey.set(`${type}|${root}|${child}`, childId)
    })
  })
}

const pickCategory = (
  type: 'income' | 'expense',
  root: string,
  child: string | undefined,
): string | null => {
  const tree = type === 'expense' ? EXPENSE_TREE : INCOME_TREE
  const canonicalRoot =
    type === 'expense' && root === '投资'
      ? '投资亏损'
      : root === '报销'
        ? '其它'
        : type === 'income' && root === '转账'
          ? '其它'
          : root
  if (!(canonicalRoot in tree)) return null
  if (child && tree[canonicalRoot]!.includes(child)) {
    return categoryIdByKey.get(`${type}|${canonicalRoot}|${child}`) ?? null
  }
  return categoryIdByKey.get(`${type}|${canonicalRoot}|`) ?? null
}

// ─── CSV ───

type SourceType = '支出' | '收入' | '转账' | '还款' | '退款' | '报销记录' | '报销'

interface ParsedRow {
  csvId: string
  date: Date
  sourceType: SourceType
  category1: string
  category2: string
  amount: number
  fee: number
  coupon: number
  account1: string
  account2: string | null
  note: string | null
  excluded: boolean
  relatedCsvId: string | null
}

const csvText = readFileSync(csvPath, 'utf8')
const parsed = Papa.parse<Record<string, string>>(csvText, {
  header: true,
  skipEmptyLines: true,
  transformHeader: (header) => header.replace(/^\uFEFF/, ''),
})
if (parsed.errors.length > 0) {
  throw new Error(`CSV 解析失败：${parsed.errors.map((e) => e.message).join('; ')}`)
}

const rawRows = parsed.data
const rows: ParsedRow[] = rawRows.map((raw, index) => {
  const csvId = raw.ID?.trim()
  if (!csvId) throw new Error(`第 ${index + 2} 行缺少 ID`)
  const sourceType = raw.类型?.trim() as SourceType
  const allowed: SourceType[] = ['支出', '收入', '转账', '还款', '退款', '报销记录', '报销']
  if (!allowed.includes(sourceType)) throw new Error(`第 ${index + 2} 行类型未知：${raw.类型}`)
  const account1 = raw.账户1?.trim() ?? ''
  if (!accountIdByName.has(account1)) throw new Error(`第 ${index + 2} 行账户未知：${account1}`)
  const account2 = raw.账户2?.trim() || null
  if (sourceType === '转账' || sourceType === '还款') {
    if (!account2 || !accountIdByName.has(account2)) {
      throw new Error(`第 ${index + 2} 行${sourceType}缺少有效转入账户：${raw.账户2}`)
    }
  }
  return {
    csvId,
    date: parseLocalDateTime(raw.时间 ?? ''),
    sourceType,
    category1: (raw.分类 ?? '').trim(),
    category2: (raw.二级分类 ?? '').trim(),
    amount: centsOf(raw.金额 ?? '', `第 ${index + 2} 行金额`),
    fee: centsOf(raw.手续费 ?? '', `第 ${index + 2} 行手续费`),
    coupon: centsOf(raw.优惠券 ?? '', `第 ${index + 2} 行优惠券`),
    account1,
    account2,
    note: raw.备注?.trim() || null,
    excluded: (raw.账单标记 ?? '').includes('不计收支'),
    relatedCsvId: raw.关联账单?.trim() || null,
  }
})

const byCsvId = new Map(rows.map((row) => [row.csvId, row]))
const dbTypeOf = (row: ParsedRow): LedgerTransaction['kind'] => {
  switch (row.sourceType) {
    case '支出':
    case '报销':
      return 'expense'
    case '收入':
      return 'income'
    case '转账':
    case '还款':
      return 'transfer'
    case '退款':
    case '报销记录':
      return 'refund'
  }
}

const refundCategory = (row: ParsedRow): string | null => {
  const related = row.relatedCsvId ? byCsvId.get(row.relatedCsvId) : null
  const originalKind = related ? dbTypeOf(related) : null
  if (originalKind === 'income') {
    return pickCategory('income', row.category1, row.category2)
  }
  return pickCategory('expense', row.category1, row.category2)
}

const normalCategory = (row: ParsedRow): string | null => {
  const kind = dbTypeOf(row)
  if (kind === 'transfer') return null
  if (kind === 'income') return pickCategory('income', row.category1, row.category2)
  return pickCategory('expense', row.category1, row.category2)
}

// ─── 迁移目标库 ───

if (existsSync(dbPath)) rmSync(dbPath, { force: true })
for (const sidecar of [`${dbPath}-wal`, `${dbPath}-shm`]) {
  if (existsSync(sidecar)) rmSync(sidecar, { force: true })
}

// schema 读取 env("DATABASE_URL")；用绝对 file: URL 指向 --db，避免迁移落到其它库。
execFileSync(
  process.execPath,
  [prismaCli, 'migrate', 'deploy', '--schema', schemaPath],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: `file:${toPosix(dbPath)}`,
      PRISMA_HIDE_UPDATE_MESSAGE: '1',
    },
  },
)

const prisma = new PrismaClient({ datasources: { db: { url: `file:${toPosix(dbPath)}` } } })

async function main() {
  console.log('▶ 写入账户分组、账户与分类…')
  await prisma.accountCategory.createMany({ data: ACCOUNT_GROUPS.map((group) => ({ ...group })) })
  await prisma.account.createMany({
    data: ACCOUNTS.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      initialBalance: BigInt(account.initial),
      initialBalanceDate: new Date(2024, 11, 31, 0, 0, 0),
      categoryId: account.group,
      sort: account.sort,
    })),
  })
  await prisma.transactionCategory.createMany({
    data: [...categoryRoots, ...categoryChildren].map((category) => ({ ...category })),
  })

  console.log('▶ 写入 3,291 笔流水…')
  const normalRows = rows.filter((row) => dbTypeOf(row) !== 'refund')
  const refundRows = rows.filter((row) => dbTypeOf(row) === 'refund')

  const idByCsvId = new Map<string, string>()
  const normalData = normalRows.map((row) => {
    const id = randomUUID()
    idByCsvId.set(row.csvId, id)
    const kind = dbTypeOf(row)
    return {
      id,
      importKey: `csv:${row.csvId}`,
      type: kind,
      amount: BigInt(row.amount),
      fee: BigInt(row.fee),
      coupon: BigInt(row.coupon),
      date: row.date,
      note: row.note,
      accountId: accountIdByName.get(row.account1)!,
      toAccountId: kind === 'transfer' && row.account2 ? accountIdByName.get(row.account2)! : null,
      categoryId: normalCategory(row),
      relatedTransactionId: null,
      relatedType: null,
      excludeFromIncomeExpense: row.excluded,
    }
  })

  for (let index = 0; index < normalData.length; index += 500) {
    await prisma.transaction.createMany({ data: normalData.slice(index, index + 500) })
  }

  const refundData = refundRows.map((row) => {
    const related = row.relatedCsvId ? byCsvId.get(row.relatedCsvId) ?? null : null
    const relatedType = related ? dbTypeOf(related) : null
    return {
      id: randomUUID(),
      importKey: `csv:${row.csvId}`,
      type: 'refund' as const,
      amount: BigInt(row.amount),
      fee: BigInt(row.fee),
      coupon: BigInt(row.coupon),
      date: row.date,
      note: row.note,
      accountId: accountIdByName.get(row.account1)!,
      toAccountId: null,
      categoryId: refundCategory(row),
      relatedTransactionId: row.relatedCsvId ? idByCsvId.get(row.relatedCsvId) ?? null : null,
      relatedType: relatedType === 'income' || relatedType === 'expense' ? relatedType : null,
      excludeFromIncomeExpense: row.excluded,
    }
  })

  for (let index = 0; index < refundData.length; index += 500) {
    await prisma.transaction.createMany({ data: refundData.slice(index, index + 500) })
  }

  console.log('▶ 写入 89 条历史平帐…')
  const adjustmentFile = JSON.parse(readFileSync(adjustmentsPath, 'utf8')) as {
    adjustments: Array<{ month: string; date: string; account: string; amount: number; note: string }>
    monthly: Array<{ month: string; excelNet: number; derivedNet: number; diff: number; count: number }>
  }
  const adjustmentData = adjustmentFile.adjustments.map((adjustment) => {
    const accountId = accountIdByName.get(adjustment.account)
    if (!accountId) throw new Error(`平帐账户未知：${adjustment.account}`)
    return {
      id: randomUUID(),
      importKey: `rebuild:adj:${adjustment.date}:${adjustment.account}`,
      type: 'adjustment',
      amount: BigInt(adjustment.amount),
      fee: BigInt(0),
      coupon: BigInt(0),
      date: parseLocalDateTime(adjustment.date),
      note: adjustment.note,
      accountId,
      toAccountId: null,
      categoryId: null,
      relatedTransactionId: null,
      relatedType: null,
      excludeFromIncomeExpense: false,
    }
  })
  for (let index = 0; index < adjustmentData.length; index += 500) {
    await prisma.transaction.createMany({ data: adjustmentData.slice(index, index + 500) })
  }

  console.log('▶ 从新库读回并逐月复算…')
  const [accounts, transactions] = await Promise.all([
    prisma.account.findMany({ orderBy: { sort: 'asc' } }),
    prisma.transaction.findMany({ where: { deletedAt: null }, orderBy: { date: 'asc' } }),
  ])
  const ledger: LedgerTransaction[] = transactions.map((transaction) => ({
    id: transaction.id,
    kind: transaction.type as LedgerTransaction['kind'],
    date: toLocalDate(transaction.date),
    amount: minor(Number(transaction.amount)),
    fee: minor(Number(transaction.fee)),
    coupon: minor(Number(transaction.coupon)),
    accountId: transaction.accountId,
    toAccountId: transaction.toAccountId,
    categoryId: transaction.categoryId,
    relatedTransactionId: transaction.relatedTransactionId,
    relatedType:
      transaction.relatedType === 'income' || transaction.relatedType === 'expense'
        ? transaction.relatedType
        : null,
    excludeFromIncomeExpense: transaction.excludeFromIncomeExpense,
  }))

  const balanceOf = (account: (typeof accounts)[number], date: Date): number =>
    balanceBefore(
      account.id,
      {
        date: account.initialBalanceDate ? toLocalDate(account.initialBalanceDate) : null,
        amount: minor(Number(account.initialBalance)),
      },
      ledger,
      toLocalDate(date),
    )

  const netAt = (date: Date): number =>
    accounts.reduce((total, account) => total + balanceOf(account, date), 0)

  const nextMonthStart = (month: string): Date => {
    const [year, monthNumber] = month.split('-').map(Number)
    return new Date(year!, monthNumber!, 1)
  }

  const table: Array<{ month: string; excel: number; derived: number; diff: number }> = []
  for (const row of adjustmentFile.monthly) {
    const derived = netAt(nextMonthStart(row.month))
    table.push({ month: row.month, excel: row.excelNet, derived, diff: derived - row.excelNet })
  }

  const yuan = (cents: number) => (cents / 100).toFixed(2)
  const keyDate = new Date(2026, 10, 1)
  const assets = accounts
    .filter((account) => account.type === 'asset')
    .reduce((total, account) => total + balanceOf(account, keyDate), 0)
  const liabilities = -accounts
    .filter((account) => account.type === 'liability')
    .reduce((total, account) => total + balanceOf(account, keyDate), 0)

  console.log('\n| 流水月 | Excel 月末净资产 | 新库推导 | 差额 |')
  console.log('|---|---:|---:|---:|')
  for (const row of table) {
    console.log(`| ${row.month} | ${yuan(row.excel)} | ${yuan(row.derived)} | ${(row.diff / 100).toFixed(2)} |`)
  }

  const byType = new Map<string, number>()
  for (const transaction of transactions) {
    byType.set(transaction.type, (byType.get(transaction.type) ?? 0) + 1)
  }
  const adjustments = transactions.filter((transaction) => transaction.type === 'adjustment')
  const adjustmentAbs = adjustments.reduce((total, transaction) => total + Math.abs(Number(transaction.amount)), 0)
  const sourceCounts = new Map<string, number>()
  for (const row of rows) sourceCounts.set(row.sourceType, (sourceCounts.get(row.sourceType) ?? 0) + 1)

  console.log('\n关键时点 2026-11-01：')
  console.log(`  总资产 ${yuan(assets)} · 总负债 ${yuan(liabilities)} · 净资产 ${yuan(assets - liabilities)}`)
  console.log(
    `  账户 ${accounts.length} · 分类 ${categoryRoots.length} 一级 / ${categoryChildren.length} 二级 · 流水 ${transactions.length} 笔`,
  )
  console.log(`  库内类型：${[...byType].map(([type, count]) => `${type} ${count}`).join(' / ')}`)
  console.log(`  源类型：${[...sourceCounts].map(([type, count]) => `${type} ${count}`).join(' / ')}`)
  console.log(`  平帐 ${adjustments.length} 条 · 绝对值 ${yuan(adjustmentAbs)}`)

  const failed = table.filter((row) => row.diff !== 0)
  if (failed.length > 0) {
    throw new Error(`逐月复核未通过：${failed.map((row) => `${row.month} 差 ${yuan(row.diff)}`).join('；')}`)
  }
  if (accounts.length !== 13) throw new Error(`账户数应为 13，实际 ${accounts.length}`)
  if (categoryRoots.length !== 15 || categoryChildren.length !== 41) {
    throw new Error(`分类应为 15/41，实际 ${categoryRoots.length}/${categoryChildren.length}`)
  }
  if (transactions.length !== 3291 + 89) {
    throw new Error(`流水应为 3380，实际 ${transactions.length}`)
  }
  if (assets - liabilities !== 111555248) {
    throw new Error(`2026-11-01 净资产应为 1115552.48，实际 ${yuan(assets - liabilities)}`)
  }
  console.log('\n✅ 重建完成：22 个月逐月差额均为 0.00')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
