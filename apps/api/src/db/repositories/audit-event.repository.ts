import { prisma, type TransactionClient } from '../../prisma.js'

// 审计事件表数据访问入口：before / after 快照在此序列化（BigInt → string、Date → ISO），
// 撤销（反向写入）按快照还原，不另建撤销表。

const db = (tx?: TransactionClient) => tx ?? prisma

/** 行快照的 JSON 序列化：金额（BigInt 分）→ 字符串，Date → ISO 字符串。 */
export function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'bigint') {
      result[key] = value.toString()
    } else if (value instanceof Date) {
      result[key] = value.toISOString()
    } else {
      result[key] = value
    }
  }
  return result
}

export interface CreateAuditEventInput {
  entity: string
  entityId: string
  /** 'updated' | 'deleted' | 'restored' */
  action: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

export async function createAuditEvent(
  input: CreateAuditEventInput,
  tx?: TransactionClient,
): Promise<{ id: string }> {
  return db(tx).auditEvent.create({
    data: {
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      beforeJson:
        input.before === undefined || input.before === null
          ? null
          : JSON.stringify(serializeRow(input.before)),
      afterJson:
        input.after === undefined || input.after === null
          ? null
          : JSON.stringify(serializeRow(input.after)),
    },
    select: { id: true },
  })
}

export async function findAuditEventById(id: string) {
  return prisma.auditEvent.findUnique({ where: { id } })
}

/** 实体的变更历史（详情页修改历史），按时间倒序。 */
export async function listAuditEvents(
  entity: string,
  entityId: string,
): Promise<Array<{ id: string; action: string; beforeJson: string | null; afterJson: string | null; at: Date }>> {
  return prisma.auditEvent.findMany({
    where: { entity, entityId },
    orderBy: { at: 'desc' },
    select: { id: true, action: true, beforeJson: true, afterJson: true, at: true },
  })
}

/** 每个实体最近一条 deleted 事件 id（回收站的「恢复」= 撤销这条事件，走同一条反向写入路径）。 */
export async function findLatestDeleteEventIds(
  entity: string,
  entityIds: string[],
): Promise<Map<string, string>> {
  if (entityIds.length === 0) return new Map()
  const events = await prisma.auditEvent.findMany({
    where: { entity, entityId: { in: entityIds }, action: 'deleted' },
    orderBy: { at: 'desc' },
    select: { id: true, entityId: true },
  })
  const latest = new Map<string, string>()
  for (const event of events) {
    if (!latest.has(event.entityId)) {
      latest.set(event.entityId, event.id)
    }
  }
  return latest
}
