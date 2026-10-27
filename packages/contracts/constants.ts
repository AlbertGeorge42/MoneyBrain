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

// ===== 备份数据类型与显示名 =====
//
// 备份包含哪几类数据由后端决定，显示名必须前后端一致，
// 否则用户会看到「导出时叫配置信息、导入结果里叫配置」这种漂移。

export const BACKUP_DATA_TYPES = ['transactions', 'config', 'budgets', 'snapshots'] as const

export type BackupDataType = (typeof BACKUP_DATA_TYPES)[number]

export const BACKUP_DATA_TYPE_LABELS: Record<BackupDataType, string> = {
  transactions: '交易记录',
  config: '配置信息',
  budgets: '预算配置',
  snapshots: '投资快照',
}

// ===== 导入结果的条目名 =====
//
// 导入结果里各条目的显示名同样前后端共用，避免两边各写一份。

export const IMPORT_ENTRY_LABELS = {
  accountCategories: '账户分类',
  accounts: '账户',
  transactionCategories: '收支分类',
  transactions: '交易记录',
  budgets: '预算',
  investmentSnapshots: '投资快照',
  investmentItems: '投资持仓',
} as const

export type ImportEntryKey = keyof typeof IMPORT_ENTRY_LABELS
