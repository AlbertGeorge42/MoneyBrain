// 同步冲突本地表的数据访问（F-B）。
//
// 只落本地：`sync_conflicts` 不进容器、不参与同步。每条冲突保留两个完整记录版本，
// 用户解决前不删；解决后标 `resolvedAt`，行仍保留供界面回溯。

import type { SyncConflict } from '@prisma/client'
import type { MergeConflict } from '../../../../../packages/sync/src/index.js'
import { prisma, type TransactionClient } from '../../prisma.js'

const db = (tx?: TransactionClient) => tx ?? prisma

/** 整条记录入库：冲突表保留的是完整版本，不是字段 diff。 */
function serializeRecord(record: MergeConflict['winner']): string {
  return JSON.stringify(record)
}

/**
 * 记录一条冲突；同一「实体 + 输家版本」重复检出时幂等返回已有行，
 * 避免每次重新应用同一批记录都堆一行。
 */
export async function recordConflict(
  conflict: MergeConflict,
  tx?: TransactionClient,
): Promise<SyncConflict> {
  const versionA = serializeRecord(conflict.winner)
  const versionB = serializeRecord(conflict.loser)
  const existing = await db(tx).syncConflict.findFirst({
    where: {
      entityType: conflict.entityType,
      entityId: conflict.entityId,
      versionB,
      resolvedAt: null,
    },
  })
  if (existing) return existing

  return db(tx).syncConflict.create({
    data: {
      entityType: conflict.entityType,
      entityId: conflict.entityId,
      versionA,
      versionB,
    },
  })
}

/** 待用户处理的冲突，按检出时间正序。 */
export async function listUnresolvedConflicts(tx?: TransactionClient): Promise<SyncConflict[]> {
  return db(tx).syncConflict.findMany({
    where: { resolvedAt: null },
    orderBy: [{ detectedAt: 'asc' }, { id: 'asc' }],
  })
}

/** 用户解决冲突（选一方或手动合并）后调用；行保留，不随容器传播。 */
export async function markConflictResolved(
  id: string,
  tx?: TransactionClient,
): Promise<SyncConflict> {
  return db(tx).syncConflict.update({
    where: { id },
    data: { resolvedAt: new Date() },
  })
}
