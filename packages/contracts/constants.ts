// ===== 破坏性操作的确认值 =====
//
// 清空数据这类不可逆操作必须由调用方显式带上确认值。
// 前后端共用同一份常量，避免两边各写一个字面量而悄悄漂移。

export const CLEAR_CONFIRM = {
  /** 清空全部数据 */
  all: 'clear-all',
  /** 仅清空交易数据 */
  transactions: 'clear-transactions',
} as const

export type ClearConfirmTarget = keyof typeof CLEAR_CONFIRM
