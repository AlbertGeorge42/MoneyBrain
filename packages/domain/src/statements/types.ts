import type { Minor } from '../money.js'

/**
 * 报表侧对账户的最小领域视图：只按 type 区分资产 / 负债。
 * 不复用 Prisma 的 Account，也不引用 packages/contracts 的 DTO；
 * 调用方传入的对象只要带有 type 字段即可，无需额外适配。
 */
export interface AccountTypeRef {
  type: string
}

/**
 * 资产 / 负债 / 净资产汇总结果。
 * liabilities 恒为正数欠款，netWorth = assets − liabilities，可为负。
 */
export interface AssetLiabilityTotals {
  assets: Minor
  liabilities: Minor
  netWorth: Minor
}
