import { abs, max, sub, sum, ZERO_MINOR, type Minor } from '../money.js'
import type { AccountTypeRef, AssetLiabilityTotals } from './types.js'

function sumByType<T extends AccountTypeRef>(
  accounts: T[],
  type: 'asset' | 'liability',
  getValue: (account: T) => Minor,
): Minor {
  return sum(accounts.filter((account) => account.type === type).map(getValue))
}

/**
 * 按账户类型汇总资产、负债与净资产。
 *
 * 负债账户余额可能为正（欠款）也可能为负（多还），先按类型求和再取绝对值，
 * 因此多个负债账户之间可以互相抵消；净资产 = 资产 − 负债。
 */
export function sumAssetsLiabilities<T extends AccountTypeRef>(
  accounts: T[],
  getValue: (account: T) => Minor,
): AssetLiabilityTotals {
  const assets = sumByType(accounts, 'asset', getValue)
  const liabilities = abs(sumByType(accounts, 'liability', getValue))
  return { assets, liabilities, netWorth: sub(assets, liabilities) }
}

/**
 * 投资占比的分母：只取正余额资产。
 * 负余额资产不是可配置资产，计入分母会把占比推过 100%；负债账户不进入分母。
 */
export function sumPositiveAssets<T extends AccountTypeRef>(
  accounts: T[],
  getValue: (account: T) => Minor,
): Minor {
  return sum(
    accounts
      .filter((account) => account.type === 'asset')
      .map((account) => max(ZERO_MINOR, getValue(account))),
  )
}
