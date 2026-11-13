// 投资快照前链重算的**唯一**入口。
//
// 排序规则在 packages/domain 的 resolvePreviousSnapshotIds，这里只负责查库与写回，
// 不另写一份推导。调用方必须传外层事务的 tx，保证与写入同事务、同回滚边界。
//
// previousSnapshotId 是「只在本地成立」的派生字段（F-C）：
// - 不进同步容器，应用后按本地日期规则重算；
// - 写入不经过 investment-allocation-snapshot.repository.update，
//   因此不推进 rev / vv——纯派生值变更不该伪装成一次业务编辑；
// - 只写有差异的行，重复调用零写入、不抖动 updatedAt。

import { fromDate, resolvePreviousSnapshotIds } from '../../../../../packages/domain/src/index.js'
import type { TransactionClient } from '../../prisma.js'

/**
 * 重算投资快照前链。
 *
 * @param client 外层事务的 tx；禁止用全局 prisma。
 * @param accountIds 只重算这些账户；省略或空数组表示全库重算。
 * @returns 实际写回的行数（幂等调用应为 0）。
 */
export async function relinkSnapshots(
  client: TransactionClient,
  accountIds?: readonly string[],
): Promise<number> {
  const scoped = accountIds !== undefined && accountIds.length > 0
  const rows = await client.investmentAllocationSnapshot.findMany({
    where: scoped ? { accountId: { in: [...accountIds] } } : {},
    select: {
      id: true,
      accountId: true,
      date: true,
      createdAt: true,
      previousSnapshotId: true,
    },
  })

  const links = resolvePreviousSnapshotIds(rows.map(row => ({
    id: row.id,
    accountId: row.accountId,
    date: fromDate(row.date),
    createdAt: row.createdAt.toISOString(),
  })))

  const currentById = new Map(rows.map(row => [row.id, row.previousSnapshotId]))
  let updated = 0
  for (const [id, previousId] of links) {
    if (currentById.get(id) === previousId) continue
    await client.investmentAllocationSnapshot.update({
      where: { id },
      data: { previousSnapshotId: previousId },
    })
    updated++
  }
  return updated
}
