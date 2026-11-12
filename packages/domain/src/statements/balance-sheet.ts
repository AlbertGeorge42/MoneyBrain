import { abs, add, neg, ZERO_MINOR, type Minor } from '../money.js'
import { sumAssetsLiabilities } from './aggregates.js'
import type { AssetLiabilityTotals } from './types.js'

/**
 * 资产负债表的领域输入：API 把 Prisma 账户、分类名称 / 排序、批量余额与预测变化量
 * 映射成这个最小结构后传入。Domain 不认识 Prisma 模型，也不生成「未分类」这类展示文案。
 *
 * actualBalance 是数据库里的带符号余额（负债账户可能为正也可能为负）；
 * predictedChange 是该账户的预测**余额变化量**（不是期末绝对值），由 API 从预算点位累加得到。
 */
export interface BalanceSheetAccountInput {
  id: string
  name: string
  type: string
  categoryId: string
  categoryName: string
  categorySort: number
  actualBalance: Minor
  predictedChange: Minor
}

export interface BalanceSheetAccountNode {
  id: string
  name: string
  categoryId: string
  type: 'asset' | 'liability'
  actual: Minor
  predicted: Minor
}

export interface BalanceSheetCategoryNode {
  id: string
  name: string
  type: 'asset' | 'liability'
  sort: number
  actual: Minor
  predicted: Minor
  children: BalanceSheetAccountNode[]
}

export interface BalanceSheetResult {
  /** 实际值汇总：负债先按类型求和再取绝对值，净资产 = 资产 − 负债。 */
  actual: AssetLiabilityTotals
  assetNodes: BalanceSheetCategoryNode[]
  liabilityNodes: BalanceSheetCategoryNode[]
}

/**
 * 构造时点资产负债表的分类 → 账户树与汇总。
 *
 * 口径（与迁移前 API 实现逐行一致，不要「顺手统一」）：
 * - 账户节点：负债按「欠款金额」正数列示，用 `abs(balance)` 而非 `-balance`
 *   （真实库里负债余额也可能为正，取负会被展示层过滤掉）；预测值对负债取负。
 * - 分类节点：自身 + 子树逐级累加，首次遇到该分类时以第一个账户的 type / name / sort 为准。
 * - 顶层汇总走 `sumAssetsLiabilities`（负债先求和再 abs），因此分类节点 actual 之和
 *   与顶层 `liabilities` 在正负余额混合时不相等，这是既有口径。
 * - 排序按分类 sort 升序，稳定排序保留账户查询顺序。
 */
export function buildBalanceSheet(
  accounts: readonly BalanceSheetAccountInput[],
): BalanceSheetResult {
  const actual = sumAssetsLiabilities(accounts, (account) => account.actualBalance)

  const categoryNodeMap = new Map<string, BalanceSheetCategoryNode>()

  for (const account of accounts) {
    if (!categoryNodeMap.has(account.categoryId)) {
      categoryNodeMap.set(account.categoryId, {
        id: account.categoryId,
        name: account.categoryName,
        type: account.type as 'asset' | 'liability',
        sort: account.categorySort,
        actual: ZERO_MINOR,
        predicted: ZERO_MINOR,
        children: [],
      })
    }

    const categoryNode = categoryNodeMap.get(account.categoryId)!
    const isLiability = account.type === 'liability'
    const accountNode: BalanceSheetAccountNode = {
      id: account.id,
      name: account.name,
      categoryId: account.categoryId,
      type: account.type as 'asset' | 'liability',
      actual: isLiability ? abs(account.actualBalance) : account.actualBalance,
      predicted: isLiability ? neg(account.predictedChange) : account.predictedChange,
    }

    categoryNode.children.push(accountNode)
    categoryNode.actual = add(categoryNode.actual, accountNode.actual)
    categoryNode.predicted = add(categoryNode.predicted, accountNode.predicted)
  }

  const nodes = Array.from(categoryNodeMap.values())

  return {
    actual,
    assetNodes: nodes.filter((node) => node.type === 'asset').sort((a, b) => a.sort - b.sort),
    liabilityNodes: nodes.filter((node) => node.type === 'liability').sort((a, b) => a.sort - b.sort),
  }
}
