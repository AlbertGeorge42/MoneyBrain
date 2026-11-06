/**
 * 账户展示名
 *
 * 真实账本里可能存在多个同名账户（例如导入后 16 个「钱包」）。只显示名称时，
 * 筛选器 / 设置页无法区分。同名时追加 id 尾号；名称唯一时保持原样，避免无意义噪声。
 */
export function accountDisplayName(
  account: { id: string; name: string },
  accounts: readonly { id: string; name: string }[],
): string {
  const sameName = accounts.filter((item) => item.name === account.name)
  if (sameName.length <= 1) return account.name
  return `${account.name} · #${account.id.slice(-6)}`
}
