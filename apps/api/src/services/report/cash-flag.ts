/**
 * 判断一笔交易是否涉及现金账户。
 * 供现金流量表的收集与构建逻辑复用。
 */
export function getCashFlags(
  accountId: string,
  toAccountId: string | null | undefined,
  cashAccountIds: string[]
): { isFromCash: boolean; isToCash: boolean } {
  const isFromCash = cashAccountIds.includes(accountId)
  const isToCash = !!toAccountId && cashAccountIds.includes(toAccountId)
  return { isFromCash, isToCash }
}
