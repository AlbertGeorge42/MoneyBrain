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
  Ledger,
  LedgerAccount,
  LedgerCategory,
  TxType,
} from '@/features/overview/model'

export type SectionId =
  | 'accounts'
  | 'categories'
  | 'cashflow'
  | 'invest'
  | 'display'
  | 'data'
  | 'trash'

export interface SectionMeta {
  id: SectionId
  label: string
}

export const CONFIG_SECTIONS: readonly SectionMeta[] = [
  { id: 'accounts', label: '账户分类' },
  { id: 'categories', label: '收支分类' },
  { id: 'cashflow', label: '现金流分类' },
  { id: 'invest', label: '投资资产类型' },
]

export const GENERAL_SECTIONS: readonly SectionMeta[] = [
  { id: 'display', label: '列表显示' },
  { id: 'data', label: '数据与备份' },
  { id: 'trash', label: '回收站' },
]

export const SECTION_GROUP_TITLES: Record<'config' | 'general', string> = {
  config: '配置中心',
  general: '通用',
}

export function sectionMeta(id: SectionId): SectionMeta {
  return [...CONFIG_SECTIONS, ...GENERAL_SECTIONS].find((item) => item.id === id) ?? CONFIG_SECTIONS[0]
}

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  deposit: '储蓄',
  cash: '现金',
  investment: '投资',
  credit: '信用',
}

export const ASSET_KINDS: readonly AccountKind[] = ['deposit', 'cash', 'investment']
export const LIABILITY_KINDS: readonly AccountKind[] = ['credit']

export interface AccountRow {
  id: string
  name: string
  balance: number
  txCount: number
}

export interface AccountGroup {
  kind: AccountKind
  label: string
  rows: AccountRow[]
}

export function accountGroups(ledger: Ledger, kinds: readonly AccountKind[]): AccountGroup[] {
  const counts = new Map<string, number>()
  for (const tx of ledger.transactions) {
    counts.set(tx.accountId, (counts.get(tx.accountId) ?? 0) + 1)
    if (tx.toAccountId) counts.set(tx.toAccountId, (counts.get(tx.toAccountId) ?? 0) + 1)
  }

  return kinds.map((kind) => ({
    kind,
    label: ACCOUNT_KIND_LABEL[kind],
    rows: ledger.accounts
      .filter((account) => account.kind === kind)
      .map((account) => ({
        id: account.id,
        name: account.name,
        balance: account.balance,
        txCount: counts.get(account.id) ?? 0,
      })),
  }))
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

export function categoryTxCount(ledger: Ledger, categoryId: string): number {
  const ids = new Set<string>([categoryId])
  let grew = true
  while (grew) {
    grew = false
    for (const category of ledger.categories) {
      if (category.parentId && ids.has(category.parentId) && !ids.has(category.id)) {
        ids.add(category.id)
        grew = true
      }
    }
  }
  return ledger.transactions.filter((tx) => ids.has(tx.categoryId)).length
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
  if (category.type === 'transfer') return 'financing'
  if (category.type === 'income' && category.id === 'inv') return 'investing'
  return 'operating'
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
  input: { name: string; kind: AccountKind; balance: number },
): Ledger {
  const account: LedgerAccount = {
    id: nextId('acc'),
    name: input.name,
    kind: input.kind,
    balance: input.balance,
  }
  return { ...ledger, accounts: [...ledger.accounts, account] }
}

export function updateAccount(
  ledger: Ledger,
  accountId: string,
  patch: { name: string; kind: AccountKind; balance: number },
): Ledger {
  return {
    ...ledger,
    accounts: ledger.accounts.map((account) =>
      account.id === accountId ? { ...account, ...patch } : account,
    ),
  }
}

export function removeAccount(ledger: Ledger, accountId: string): Ledger {
  return { ...ledger, accounts: ledger.accounts.filter((account) => account.id !== accountId) }
}

export function addCategory(
  ledger: Ledger,
  input: { name: string; type: TxType; parentId?: string },
): Ledger {
  const category: LedgerCategory = {
    id: nextId('cat'),
    name: input.name,
    type: input.type,
    parentId: input.parentId,
  }
  return { ...ledger, categories: [...ledger.categories, category] }
}

export function updateCategory(ledger: Ledger, categoryId: string, name: string): Ledger {
  return {
    ...ledger,
    categories: ledger.categories.map((category) =>
      category.id === categoryId ? { ...category, name } : category,
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

/* ===== 展示用格式化 ===== */

export function accountCountLabel(rows: AccountRow[]): string {
  return `${rows.length} 个账户`
}

export function txCountLabel(count: number): string {
  return `${count} 笔`
}
