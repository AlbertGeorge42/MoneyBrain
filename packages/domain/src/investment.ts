// 投资快照前链的**唯一**排序规则。
//
// previousSnapshotId 是派生值落库的唯一例外（原则 #2），写入后必须按日期重排。
// 本地 relinkSnapshots 与同步应用后的重算都调用这里，避免两处各写一份规则
// （同步只传快照本身，前链在每台设备上按同一规则重算，见 F-C）。

export interface SnapshotChainNode {
  id: string
  accountId: string
  /** 本地日历日 YYYY-MM-DD；字符串比较与时间比较等价。 */
  date: string
  /** 创建时间，用于同日快照的稳定次序；缺失按最早处理。 */
  createdAt?: string | null
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function createdAtMillis(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

/** 账户内按日期升序；同日按创建时间、最后按 id，保证跨设备顺序确定。 */
export function sortSnapshotChain<T extends SnapshotChainNode>(nodes: readonly T[]): T[] {
  return [...nodes].sort((left, right) => {
    const account = compareText(left.accountId, right.accountId)
    if (account !== 0) return account
    const date = compareText(left.date, right.date)
    if (date !== 0) return date
    const createdAt = createdAtMillis(left.createdAt) - createdAtMillis(right.createdAt)
    if (createdAt !== 0) return createdAt
    return compareText(left.id, right.id)
  })
}

/** 每个快照应指向前一条；账户的第一条为 null。 */
export function resolvePreviousSnapshotIds(
  nodes: readonly SnapshotChainNode[],
): Map<string, string | null> {
  const links = new Map<string, string | null>()
  let accountId: string | null = null
  let previousId: string | null = null
  for (const node of sortSnapshotChain(nodes)) {
    if (node.accountId !== accountId) {
      accountId = node.accountId
      previousId = null
    }
    links.set(node.id, previousId)
    previousId = node.id
  }
  return links
}
