/**
 * 数据库连接串的唯一入口。
 *
 * 为什么必须显式提供：`schema.prisma` 的 datasource 用 `env("DATABASE_URL")`，
 * 任何入口（API、seed、脚本）都不再回落到 `apps/api/prisma/dev.db`——
 * 过去正因为隐式回落，造数脚本和测试曾直接写进真实账本。
 */
export const DATABASE_URL_MISSING_MESSAGE =
  '请显式指定 DATABASE_URL（例如 file:<仓库绝对路径>/apps/api/prisma/dev.db）；已不再隐式回落 dev.db。'

export function requireDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.DATABASE_URL?.trim()
  if (!value) throw new Error(DATABASE_URL_MISSING_MESSAGE)
  return value
}
