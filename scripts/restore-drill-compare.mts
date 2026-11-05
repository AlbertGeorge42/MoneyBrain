/**
 * 恢复演练的比较口径（纯函数，供脚本与单测共用）。
 *
 * 关键事实：导入流程按「名称 / 自然键」匹配并**重建 id**（账户、分类、交易都是新的 UUID），
 * 所以跨库直接比较 id 必然全部「缺失」。这里采取：
 * - **库内聚合按 id**：账户余额、同名分组都以 id 为单位计算，避免同名账户互相覆盖；
 * - **跨库匹配按稳定自然键**：账户名、分类路径（type+名称链）、交易内容指纹；
 * - 名称重复只作为数据卫生提示，不判定失败（重名账户的余额差异也不判失败）。
 *
 * 因此 `identical` 的含义是「备份还原出了相同的账本内容」，而不是「id 字节相等」。
 */

export interface NamedRow {
  id: string
  name: string
}

export interface AccountRow extends NamedRow {
  type: string
}

export interface CategoryRow extends NamedRow {
  type: string
  parentId: string | null
}

export interface TransactionRow {
  type: string
  date: string
  amount: number
  fee: number
  coupon: number
  accountName: string
  toAccountName: string | null
  categoryPath: string | null
  relatedType: string | null
  excludeFromIncomeExpense: boolean
}

export interface LedgerTotals {
  accounts: number
  accountCategories: number
  transactionCategories: number
  transactions: number
  budgets: number
  snapshots: number
  /** 账户 id → 余额（整数分）；库内按 id 聚合 */
  balances: Record<string, number>
  /** 账户 id → 名称（仅用于报告） */
  accountNames: Record<string, string>
  accountNamesList: string[]
  /** 分类稳定键（type|名称链），按树形展开 */
  accountCategoryKeys: string[]
  transactionCategoryKeys: string[]
  /** 交易内容指纹（不含 id） */
  transactionFingerprints: string[]
  netWorth: number
  duplicateNames: DuplicateNameGroup[]
}

export interface DuplicateNameGroup {
  table: '账户' | '账户分类' | '交易分类'
  name: string
  count: number
}

export interface DrillComparison {
  identical: boolean
  problems: string[]
  /** 人类可读的同名重复提示；没有重复时为空数组 */
  hygieneNotes: string[]
}

function formatList(values: readonly string[], limit = 3): string {
  if (values.length === 0) return ''
  const shown = values.slice(0, limit).join('、')
  return values.length > limit ? `${shown} 等 ${values.length} 项` : shown
}

/** 找出按名称重复的行；按数量降序，便于直接看出「钱包 ×16」这类问题。 */
export function findDuplicateNames(
  accounts: readonly NamedRow[],
  accountCategories: readonly NamedRow[],
  transactionCategories: readonly NamedRow[],
): DuplicateNameGroup[] {
  const groups: DuplicateNameGroup[] = []
  const collect = (table: DuplicateNameGroup['table'], rows: readonly NamedRow[]) => {
    const counts = new Map<string, number>()
    for (const row of rows) counts.set(row.name, (counts.get(row.name) ?? 0) + 1)
    for (const [name, count] of counts) {
      if (count > 1) groups.push({ table, name, count })
    }
  }
  collect('账户', accounts)
  collect('账户分类', accountCategories)
  collect('交易分类', transactionCategories)
  return groups.sort(
    (a, b) => b.count - a.count || a.table.localeCompare(b.table) || a.name.localeCompare(b.name),
  )
}

/** 分类树展开成稳定路径：根 → 子，避免跨库比较时依赖重建后的 parentId。 */
export function buildCategoryPaths(rows: readonly CategoryRow[]): string[] {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const pathOf = (row: CategoryRow, seen = new Set<string>()): string => {
    if (!row.parentId || seen.has(row.parentId)) return row.name
    const parent = byId.get(row.parentId)
    if (!parent) return row.name
    seen.add(row.parentId)
    return `${pathOf(parent, seen)}/${row.name}`
  }
  return rows.map((row) => `${row.type}|${pathOf(row)}`)
}

/** 交易内容指纹：用名称而不是 id，因为 id 在导入时会被重建。 */
export function buildTransactionFingerprint(
  transaction: TransactionRow,
): string {
  return [
    transaction.type,
    transaction.date,
    transaction.amount,
    transaction.fee,
    transaction.coupon,
    transaction.accountName,
    transaction.toAccountName ?? '',
    transaction.categoryPath ?? '',
    transaction.relatedType ?? '',
    transaction.excludeFromIncomeExpense ? '1' : '0',
  ].join('|')
}

function multisetDiff(live: readonly string[], restored: readonly string[]): { missing: string[]; extra: string[] } {
  const counts = new Map<string, number>()
  for (const key of restored) counts.set(key, (counts.get(key) ?? 0) + 1)
  const missing: string[] = []
  for (const key of live) {
    const remaining = counts.get(key) ?? 0
    if (remaining > 0) counts.set(key, remaining - 1)
    else missing.push(key)
  }
  const extra = [...counts.entries()].filter(([, count]) => count > 0).map(([key]) => key)
  return { missing, extra }
}

function setDiff(live: readonly string[], restored: readonly string[]): { missing: string[]; extra: string[] } {
  const left = new Set(live)
  const right = new Set(restored)
  return {
    missing: [...left].filter((key) => !right.has(key)).sort(),
    extra: [...right].filter((key) => !left.has(key)).sort(),
  }
}

export function buildHygieneNotes(duplicateNames: readonly DuplicateNameGroup[]): string[] {
  const notes: string[] = []
  const accountGroups = duplicateNames.filter((group) => group.table === '账户')
  if (accountGroups.length > 0) {
    const total = accountGroups.reduce((sum, group) => sum + group.count, 0)
    notes.push(
      `同名账户 ${accountGroups.length} 组（${total} 个）：` +
        accountGroups.map((group) => `「${group.name}」×${group.count}`).join('、'),
    )
  }
  for (const table of ['账户分类', '交易分类'] as const) {
    const categoryGroups = duplicateNames.filter((group) => group.table === table)
    if (categoryGroups.length === 0) continue
    const total = categoryGroups.reduce((sum, group) => sum + group.count, 0)
    const unique = new Set(categoryGroups.map((group) => group.name)).size
    notes.push(
      `${table} ${total} 条，仅 ${unique} 个唯一名：` +
        categoryGroups.map((group) => `「${group.name}」×${group.count}`).join('、'),
    )
  }
  return notes
}

export function compareTotals(live: LedgerTotals, restored: LedgerTotals): DrillComparison {
  const problems: string[] = []

  // 账户：稳定键是名称。重名组在导入时会被去重，因此只要求「至少存在一个同名账户」。
  const liveNameCounts = new Map<string, number>()
  for (const name of live.accountNamesList) liveNameCounts.set(name, (liveNameCounts.get(name) ?? 0) + 1)
  const restoredNameCounts = new Map<string, number>()
  for (const name of restored.accountNamesList) {
    restoredNameCounts.set(name, (restoredNameCounts.get(name) ?? 0) + 1)
  }
  for (const [name, count] of liveNameCounts) {
    const restoredCount = restoredNameCounts.get(name) ?? 0
    if (restoredCount === 0) {
      problems.push(`账户「${name}」在恢复库中缺失`)
    } else if (count === 1 && restoredCount !== 1) {
      problems.push(`账户「${name}」数量: 原库 1 ≠ 恢复库 ${restoredCount}`)
    }
  }
  for (const [name, count] of restoredNameCounts) {
    if (!liveNameCounts.has(name)) {
      problems.push(`账户「${name}」只出现在恢复库（${count} 个）`)
    }
  }

  // 余额：库内按 id 聚合，跨库按名称汇总；重名账户的差异降级为提示（导入会去重）。
  const liveBalancesByName = new Map<string, number>()
  for (const [id, balance] of Object.entries(live.balances)) {
    const name = live.accountNames[id] ?? id
    liveBalancesByName.set(name, (liveBalancesByName.get(name) ?? 0) + balance)
  }
  const restoredBalancesByName = new Map<string, number>()
  for (const [id, balance] of Object.entries(restored.balances)) {
    const name = restored.accountNames[id] ?? id
    restoredBalancesByName.set(name, (restoredBalancesByName.get(name) ?? 0) + balance)
  }
  for (const [name, balance] of liveBalancesByName) {
    const restoredBalance = restoredBalancesByName.get(name)
    if (restoredBalance === undefined) continue // 缺失已在上面报告
    if (restoredBalance !== balance && (liveNameCounts.get(name) ?? 0) === 1) {
      problems.push(`账户「${name}」余额: 原库 ${balance} ≠ 恢复库 ${restoredBalance}`)
    }
  }

  // 分类：按 type + 名称路径的集合比较（重名分类在导入时合并，数量差异不算失败）。
  const accountCategoryDiff = setDiff(live.accountCategoryKeys, restored.accountCategoryKeys)
  if (accountCategoryDiff.missing.length > 0) {
    problems.push(`账户分类缺失：${formatList(accountCategoryDiff.missing)}`)
  }
  if (accountCategoryDiff.extra.length > 0) {
    problems.push(`账户分类多出：${formatList(accountCategoryDiff.extra)}`)
  }
  const transactionCategoryDiff = setDiff(live.transactionCategoryKeys, restored.transactionCategoryKeys)
  if (transactionCategoryDiff.missing.length > 0) {
    problems.push(`交易分类缺失：${formatList(transactionCategoryDiff.missing)}`)
  }
  if (transactionCategoryDiff.extra.length > 0) {
    problems.push(`交易分类多出：${formatList(transactionCategoryDiff.extra)}`)
  }

  // 交易：内容指纹多重集比较（id 由导入重建，不作为身份）。
  const transactionDiff = multisetDiff(live.transactionFingerprints, restored.transactionFingerprints)
  if (transactionDiff.missing.length > 0) {
    problems.push(`交易内容缺失 ${transactionDiff.missing.length} 笔：${formatList(transactionDiff.missing)}`)
  }
  if (transactionDiff.extra.length > 0) {
    problems.push(`交易内容多出 ${transactionDiff.extra.length} 笔：${formatList(transactionDiff.extra)}`)
  }

  if (live.netWorth !== restored.netWorth) {
    problems.push(`净资产: 原库 ${live.netWorth} ≠ 恢复库 ${restored.netWorth}`)
  }

  const counts = [
    ['budgets', '预算数量'],
    ['snapshots', '快照数量'],
  ] as const
  for (const [key, label] of counts) {
    if (live[key] !== restored[key]) {
      problems.push(`${label}: 原库 ${live[key]} ≠ 恢复库 ${restored[key]}`)
    }
  }

  return {
    identical: problems.length === 0,
    problems,
    hygieneNotes: buildHygieneNotes(live.duplicateNames),
  }
}
