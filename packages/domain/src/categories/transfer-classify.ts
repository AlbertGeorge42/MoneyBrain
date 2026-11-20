/**
 * 转账五类：系统内部按账户性质自动判定的分类，不开放用户配置。
 *
 * 判定口径只有这一份：导入器与手工记账都调用本函数，再按返回的 name 落到
 * 对应的 TransactionCategory（分类行由调用方按需创建/查找）。活动归属在此固定，
 * 不写进分类表让用户在设置页改。
 */
export type TransferCategoryName = '转账' | '买入' | '卖出' | '还款' | '借贷'
export type TransferActivity = 'operating' | 'investing' | 'financing'

export interface TransferAccountMark {
  /** 账户类型：负债账户参与还款 / 借款判定。 */
  type: string
  /** 账户（或其继承的根分类）是否被标记为投资资产。 */
  isInvestment: boolean
}

/** 五类固定活动归属：转账经营、买卖投资、还款借款筹资。 */
export const TRANSFER_ACTIVITY: Record<TransferCategoryName, TransferActivity> = {
  转账: 'operating',
  买入: 'investing',
  卖出: 'investing',
  还款: 'financing',
  借贷: 'financing',
}

/** 历史名称别名：规范名 → 旧名。老库的「借款」等同「借贷」，找到即复用其 id。 */
export const TRANSFER_CATEGORY_LEGACY_NAMES: Partial<Record<TransferCategoryName, string>> = {
  借贷: '借款',
}

/**
 * 按转出 / 转入账户性质判定转账内部分类。
 * 优先级与既有导入口径一致：负债 > 投资 > 普通转账。
 * 老数据里「借款」等同「借贷」。
 */
export function classifyTransferCategory(
  fromAccount: TransferAccountMark | null,
  toAccount: TransferAccountMark | null,
): TransferCategoryName {
  if (toAccount?.type === 'liability') return '还款'
  if (fromAccount?.type === 'liability') return '借贷'
  if (toAccount?.isInvestment) return '买入'
  if (fromAccount?.isInvestment) return '卖出'
  return '转账'
}
