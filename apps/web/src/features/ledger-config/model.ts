/**
 * 设置页数据派生与账本修改（纯函数）
 *
 * 五类配置统一口径：
 * - 账户分类：按账户性质（储蓄 / 现金 / 投资 / 信用）分组，组行 = 分类，子行 = 账户；
 * - 收支分类：按类型（收入 / 支出 / 转账）分 Tab，两级树；
 * - 现金流分类：资产按现金等价 / 投资 / 其它标记分组，收入 / 支出 / 转账按活动分组；
 * - 投资资产类型：HF 演示数据，目标占比与报表页同一套；
 * - 列表显示：列显隐 + 排序，与流水页共用 displaySettings。
 */
import type {
  AccountKind,
  CashFlowActivity,
  Ledger,
  LedgerAccount,
  LedgerCategory,
  TxType,
} from '@/features/overview/model'

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  deposit: '储蓄',
  cash: '现金',
  investment: '投资',
  credit: '信用',
}

export type CategoryTab = 'income' | 'expense' | 'transfer'

export const CATEGORY_TABS: readonly { type: CategoryTab; label: string }[] = [
  { type: 'income', label: '收入' },
  { type: 'expense', label: '支出' },
  { type: 'transfer', label: '转账' },
]

export interface AccountRow {
  id: string
  name: string
  balance: number
  /** 期初余额（分）；未设期初时为 undefined。 */
  initialBalance?: number
  initialBalanceDate?: string | null
  txCount: number
}

export interface AccountGroup {
  id: string
  name: string
  type: 'asset' | 'liability'
  sort: number
  /** 直接挂在该一级分类下的账户。 */
  rows: AccountRow[]
  /** 未分组占位（账户 categoryId 为空或指向不存在的分组）。 */
  ungrouped?: boolean
  /** 种子账本按性质合成的只读分组，不能增删改。 */
  seeded?: boolean
}

export function accountGroupCount(group: AccountGroup): number {
  return group.rows.length
}

export function accountGroupBalance(group: AccountGroup): number {
  return group.rows.reduce((sum, account) => sum + account.balance, 0)
}

/**
 * 账户分组列表（只用于展示与组织，不参与任何合计）。
 *
 * API 模式直接投影后端的 AccountCategory（一级）；种子账本没有分组表，
 * 按性质合成只读分组，保证预览不空。
 */
export function accountGroupsForType(ledger: Ledger, type: 'asset' | 'liability'): AccountGroup[] {
  const counts = new Map<string, number>()
  for (const tx of ledger.transactions) {
    counts.set(tx.accountId, (counts.get(tx.accountId) ?? 0) + 1)
    if (tx.toAccountId) counts.set(tx.toAccountId, (counts.get(tx.toAccountId) ?? 0) + 1)
  }
  const toRow = (account: Ledger['accounts'][number]): AccountRow => ({
    id: account.id,
    name: account.name,
    balance: account.balance,
    initialBalance: account.initialBalance,
    initialBalanceDate: account.initialBalanceDate,
    txCount: counts.get(account.id) ?? 0,
  })

  if (!ledger.accountCategories) {
    const kinds: readonly AccountKind[] =
      type === 'asset' ? ['cash', 'deposit', 'investment'] : ['credit']
    return kinds.map((kind, index) => ({
      id: `seed-${kind}`,
      name: ACCOUNT_KIND_LABEL[kind],
      type,
      sort: index,
      seeded: true,
      rows: ledger.accounts.filter((account) => account.kind === kind).map(toRow),
    }))
  }

  const accountCategories = ledger.accountCategories
  const known = new Set(accountCategories.map((category) => category.id))
  // 资产 / 负债归属由账户本身决定，分组只决定它排在哪个抽屉里。
  const accountType = (account: Ledger['accounts'][number]): 'asset' | 'liability' =>
    account.kind === 'credit' ? 'liability' : 'asset'
  const ofType = (account: Ledger['accounts'][number]) => accountType(account) === type
  const rowsOf = (categoryId: string) =>
    ledger.accounts
      .filter((account) => account.categoryId === categoryId && ofType(account))
      .map(toRow)
  const groups: AccountGroup[] = accountCategories
    .filter((category) => category.type === type)
    .map((category) => ({
      id: category.id,
      name: category.name,
      type,
      sort: category.sort,
      seeded: category.seeded,
      rows: rowsOf(category.id),
    }))

  const ungrouped = ledger.accounts.filter(
    (account) => ofType(account) && (!account.categoryId || !known.has(account.categoryId)),
  )
  if (ungrouped.length > 0) {
    groups.push({
      id: '__ungrouped',
      name: '未分组',
      type,
      sort: Number.MAX_SAFE_INTEGER,
      ungrouped: true,
      rows: ungrouped.map(toRow),
    })
  }
  return groups
}

/** 分组展示名：同名时追加 id 尾号，避免「现金 × 5」无法区分。 */
export function accountGroupDisplayName(
  group: AccountGroup,
  groups: readonly AccountGroup[],
): string {
  const sameName = groups.filter((item) => item.name === group.name)
  if (sameName.length <= 1) return group.name
  return `${group.name} · #${group.id.slice(-4)}`
}

export function accountTxCount(ledger: Ledger, accountId: string): number {
  return ledger.transactions.filter(
    (tx) => tx.accountId === accountId || tx.toAccountId === accountId,
  ).length
}

export interface CategoryRow {
  id: string
  name: string
  txCount: number
  childCount: number
  children: CategoryRow[]
}

export function categoryRows(ledger: Ledger, type: TxType): CategoryRow[] {
  const countByCategory = new Map<string, number>()
  for (const tx of ledger.transactions) {
    countByCategory.set(tx.categoryId, (countByCategory.get(tx.categoryId) ?? 0) + 1)
  }

  const build = (parentId?: string): CategoryRow[] =>
    ledger.categories
      .filter((category) => category.type === type && category.parentId === parentId)
      .map((category) => {
        const children = build(category.id)
        const self = countByCategory.get(category.id) ?? 0
        const childTx = children.reduce((sum, child) => sum + child.txCount, 0)
        return {
          id: category.id,
          name: category.name,
          txCount: self + childTx,
          childCount: children.length,
          children,
        }
      })

  return build(undefined)
}

export function categoryDescendantIds(ledger: Ledger, categoryId: string): string[] {
  const ids: string[] = []
  let frontier = [categoryId]
  while (frontier.length > 0) {
    const next: string[] = []
    for (const id of frontier) {
      for (const category of ledger.categories) {
        if (category.parentId === id) {
          ids.push(category.id)
          next.push(category.id)
        }
      }
    }
    frontier = next
  }
  return ids
}

/* ===== 现金流分组 ===== */

export type ActivityGroupId = 'operating' | 'investing' | 'financing' | 'unassigned'

export const ACTIVITY_GROUPS: readonly { id: ActivityGroupId; label: string }[] = [
  { id: 'operating', label: '经营' },
  { id: 'investing', label: '投资' },
  { id: 'financing', label: '筹资' },
  { id: 'unassigned', label: '未分配' },
]

export function defaultActivity(category: LedgerCategory): ActivityGroupId {
  return category.cashFlowType ?? 'unassigned'
}

export const ASSET_MARK_GROUPS: readonly {
  id: 'cash' | 'investment' | 'other'
  label: string
  kinds: readonly AccountKind[]
}[] = [
  { id: 'cash', label: '现金及等价物', kinds: ['cash'] },
  { id: 'investment', label: '投资资产', kinds: ['investment'] },
  { id: 'other', label: '其他资产', kinds: ['deposit'] },
]

/* ===== 投资资产类型（与报表页同一套目标占比） ===== */

export interface InvestmentTypeRow {
  id: string
  name: string
  current: number
  target: number
  rebalance: string
}

export const INVESTMENT_TYPES: readonly InvestmentTypeRow[] = [
  { id: 'stock', name: '股票', current: 53, target: 55, rebalance: '低配 2%' },
  { id: 'fund', name: '基金', current: 30, target: 30, rebalance: '持平' },
  { id: 'bond', name: '债券', current: 17, target: 15, rebalance: '超配 2%' },
]

/* ===== 账本修改 ===== */

let idSeed = 0
function nextId(prefix: string): string {
  idSeed += 1
  return `${prefix}-${Date.now().toString(36)}-${idSeed}`
}

export function addAccount(
  ledger: Ledger,
  input: {
    name: string
    kind: AccountKind
    balance: number
    initialBalance?: number
    initialBalanceDate?: string
  },
): Ledger {
  const account: LedgerAccount = {
    id: nextId('acc'),
    name: input.name,
    kind: input.kind,
    balance: input.balance,
    initialBalance: input.initialBalance,
    initialBalanceDate: input.initialBalanceDate ?? null,
  }
  return { ...ledger, accounts: [...ledger.accounts, account] }
}

export function updateAccount(
  ledger: Ledger,
  accountId: string,
  patch: {
    name: string
    kind: AccountKind
    balance: number
    /** 省略表示保持原期初；显式传入 undefined 也不会清空。 */
    initialBalance?: number
    initialBalanceDate?: string
  },
): Ledger {
  return {
    ...ledger,
    accounts: ledger.accounts.map((account) => {
      if (account.id !== accountId) return account
      const next: LedgerAccount = { ...account, name: patch.name, kind: patch.kind, balance: patch.balance }
      if (patch.initialBalance !== undefined) next.initialBalance = patch.initialBalance
      if (patch.initialBalanceDate !== undefined) next.initialBalanceDate = patch.initialBalanceDate
      return next
    }),
  }
}

export function removeAccount(ledger: Ledger, accountId: string): Ledger {
  return { ...ledger, accounts: ledger.accounts.filter((account) => account.id !== accountId) }
}

/** 同性质分组内的账户排序：与设置页展示顺序一致。 */
export function reorderAccount(
  ledger: Ledger,
  accountId: string,
  direction: 'up' | 'down',
): Ledger {
  const account = ledger.accounts.find((item) => item.id === accountId)
  if (!account) return ledger
  const siblings = ledger.accounts.filter((item) => item.kind === account.kind)
  const index = siblings.findIndex((item) => item.id === accountId)
  const target = index + (direction === 'up' ? -1 : 1)
  if (target < 0 || target >= siblings.length) return ledger
  const swapId = siblings[target].id
  const next = [...ledger.accounts]
  const a = next.findIndex((item) => item.id === accountId)
  const b = next.findIndex((item) => item.id === swapId)
  ;[next[a], next[b]] = [next[b], next[a]]
  return { ...ledger, accounts: next }
}

export function addCategory(
  ledger: Ledger,
  input: { name: string; type: TxType; parentId?: string; iconKey?: string | null },
): Ledger {
  const category: LedgerCategory = {
    id: nextId('cat'),
    name: input.name,
    type: input.type,
    parentId: input.parentId,
    iconKey: input.iconKey,
  }
  return { ...ledger, categories: [...ledger.categories, category] }
}

export function updateCategory(
  ledger: Ledger,
  categoryId: string,
  name: string,
  iconKey?: string | null,
): Ledger {
  return {
    ...ledger,
    categories: ledger.categories.map((category) =>
      category.id === categoryId
        ? { ...category, name, ...(iconKey !== undefined && { iconKey }) }
        : category,
    ),
  }
}

/** 种子模式的活动归属写入：子分类随父分类一起改，与 API 模式的级联写入口径一致。 */
export function setCategoryCashFlowInLedger(
  ledger: Ledger,
  categoryId: string,
  activity: CashFlowActivity | null,
): Ledger {
  const ids = new Set([categoryId, ...categoryDescendantIds(ledger, categoryId)])
  return {
    ...ledger,
    categories: ledger.categories.map((category) =>
      ids.has(category.id) ? { ...category, cashFlowType: activity } : category,
    ),
  }
}

export function moveCategory(
  ledger: Ledger,
  categoryId: string,
  parentId: string | null,
): Ledger {
  return {
    ...ledger,
    categories: ledger.categories.map((category) =>
      category.id === categoryId ? { ...category, parentId: parentId ?? undefined } : category,
    ),
  }
}

/** 删除前把该分类（含子分类）的引用交易转到目标分类，数字与删除弹窗同源。 */
export function transferCategoryTransactions(
  ledger: Ledger,
  sourceId: string,
  targetId: string,
): Ledger {
  const ids = new Set<string>([sourceId, ...categoryDescendantIds(ledger, sourceId)])
  return {
    ...ledger,
    transactions: ledger.transactions.map((transaction) =>
      ids.has(transaction.categoryId) ? { ...transaction, categoryId: targetId } : transaction,
    ),
  }
}

export function removeCategory(ledger: Ledger, categoryId: string): Ledger {
  return {
    ...ledger,
    categories: ledger.categories.filter((category) => category.id !== categoryId),
  }
}

/** 同类型、同父级下的兄弟分类（展示顺序）。 */
export function categorySiblings(ledger: Ledger, categoryId: string): LedgerCategory[] {
  const category = ledger.categories.find((item) => item.id === categoryId)
  if (!category) return []
  return ledger.categories.filter(
    (item) => item.type === category.type && item.parentId === category.parentId,
  )
}

/** 同级分类排序（不影响父子层级）。 */
export function reorderCategory(
  ledger: Ledger,
  categoryId: string,
  direction: 'up' | 'down',
): Ledger {
  const category = ledger.categories.find((item) => item.id === categoryId)
  if (!category) return ledger
  const siblings = categorySiblings(ledger, categoryId)
  const index = siblings.findIndex((item) => item.id === categoryId)
  const target = index + (direction === 'up' ? -1 : 1)
  if (target < 0 || target >= siblings.length) return ledger
  const swapId = siblings[target].id
  const next = [...ledger.categories]
  const a = next.findIndex((item) => item.id === categoryId)
  const b = next.findIndex((item) => item.id === swapId)
  ;[next[a], next[b]] = [next[b], next[a]]
  return { ...ledger, categories: next }
}

