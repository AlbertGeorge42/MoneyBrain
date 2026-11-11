/**
 * 折叠列表的唯一状态口径：默认收起。
 *
 * 报表树用 FoldState（按 id 记展开项），账本配置列表用 ExpandedKeys（集合里的是展开项），
 * 两者语义一致——没有任何记录时所有分组都是折叠的，只有显式展开过的才展开。
 * 不要在各视图里另写 `?? true` / `!== false` 这类默认展开判定。
 */
export type FoldState = Record<string, boolean>

export function isExpanded(folded: FoldState, key: string): boolean {
  return folded[key] === true
}

export function toggleFold(folded: FoldState, key: string): FoldState {
  return { ...folded, [key]: !isExpanded(folded, key) }
}

export type ExpandedKeys = ReadonlySet<string>

export function isKeyExpanded(keys: ExpandedKeys, key: string): boolean {
  return keys.has(key)
}

export function toggleExpandedKey(keys: ExpandedKeys, key: string): Set<string> {
  const next = new Set(keys)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

export function setExpandedKeys(
  keys: ExpandedKeys,
  targets: readonly string[],
  expanded: boolean,
): Set<string> {
  const next = new Set(keys)
  for (const key of targets) {
    if (expanded) next.add(key)
    else next.delete(key)
  }
  return next
}
