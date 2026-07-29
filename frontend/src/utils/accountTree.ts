/**
 * 账户树形数据构建工具
 * 产出 Ant Design TreeSelect 使用的 DataNode 结构
 *
 * 结构：
 *   资产 (根节点，可点击选中，antd 级联勾选所有子分类)
 *     ├ 账户分类A (asset)
 *     │  ├ 账户1
 *     │  └ 账户2
 *     └ 账户分类B (asset)
 *        └ 账户3
 *   负债 (根节点，可点击选中，antd 级联勾选所有子分类)
 *     └ 账户分类C (liability)
 *        └ 账户4
 */

import type { Account, AccountCategory } from '../services/api'

/** TreeSelect DataNode — 字段名直接匹配 Ant Design 默认映射 */
export interface AccountTreeDataNode {
  title: React.ReactNode
  value: string
  key: string
  selectable?: boolean
  children?: AccountTreeDataNode[]
}

export function buildAccountTreeData(
  accounts: Account[],
  categories: AccountCategory[]
): AccountTreeDataNode[] {
  const topLevels: { key: string; title: string; type: string }[] = [
    { key: 'asset_root', title: '资产', type: 'asset' },
    { key: 'liability_root', title: '负债', type: 'liability' },
  ]

  return topLevels.map(top => ({
    title: top.title,
    value: top.key,
    key: top.key,
    children: categories
      .filter(c => c.type === top.type)
      .sort((a, b) => a.sort - b.sort)
      .map(cat => ({
        title: cat.name,
        value: `category_${cat.id}`,
        key: `category_${cat.id}`,
        children: accounts
          .filter(a => a.categoryId === cat.id)
          .sort((a, b) => a.sort - b.sort)
          .map(acc => ({
            title: acc.name,
            value: acc.id,
            key: acc.id,
          })),
      })),
  }))
}
