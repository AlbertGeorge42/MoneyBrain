import { prisma, type TransactionClient } from '../prisma.js'

/**
 * 事务边界的唯一入口（D10）：service 不再直接调 `prisma.$transaction`。
 *
 * 数据库访问统一收在 `db/repositories/`（它们内部允许直接开事务做批量写）；
 * service 只描述「一个事务里要按什么顺序做什么」，事务的创建/回滚策略集中在这里，
 * 将来换数据库、加超时或加事务日志只需改这一处。
 */
export function withTransaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn)
}
