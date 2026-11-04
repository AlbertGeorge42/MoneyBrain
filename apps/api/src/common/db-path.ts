// 「跟着数据库走」的本地文件（回滚点、自动备份配置、同步身份）都靠它定位。
//
// 库的真实路径由 SQLite 自己报告（PRAGMA database_list），
// 不靠拼 DATABASE_URL——相对路径的基准随调用方而变，拼出来会错。

import { dirname } from 'node:path'
import { prisma } from '../prisma.js'
import { ValidationError } from './error.js'

export async function resolveDbDirectory(): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<{ file: string }[]>('PRAGMA database_list')
  const main = rows.find((r) => r.file)
  if (!main?.file) {
    throw new ValidationError('无法确定数据库文件位置')
  }
  return dirname(main.file)
}
