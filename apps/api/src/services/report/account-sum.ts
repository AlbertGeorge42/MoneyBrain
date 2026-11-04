import { minor, type Minor } from '../../../../../packages/domain/src/index.js'

// ===== 资产/负债/净资产求和 =====

interface AccountWithType {
  type: string
}

/**
 * 按账户类型求和
 * @param getValue 获取账户余额的函数
 */
function sumByType<T extends AccountWithType>(
  accounts: T[],
  type: 'asset' | 'liability',
  getValue: (account: T) => Minor
): Minor {
  return minor(
    accounts
      .filter(a => a.type === type)
      .reduce((sum, a) => sum + getValue(a), 0),
  )
}

/**
 * 汇总资产、负债、净资产
 *
 * 数据约定（API 层契约）：
 * - `assets`    正数：当前资产总额
 * - `liabilities` 正数：当前负债金额（"你欠多少"），不再保留数据库中"余额为负"的旧约定
 * - `netWorth`  资产 - 负债，可正可负
 *
 * 数据库中负债账户的余额通常为负（-1000 表示欠 1000），这里取绝对值再相减。
 * 历史调用方若依赖旧约定（`liabilities` 为负、`netWorth = assets + liabilities`），
 * 请改为读 `liabilities` 后自行处理符号，或调用方直接用 `assets - Math.abs(liabilities)` 计算净资产。
 */
export function sumAssetsLiabilities<T extends AccountWithType>(
  accounts: T[],
  getValue: (account: T) => Minor
): { assets: Minor; liabilities: Minor; netWorth: Minor } {
  const assets = sumByType(accounts, 'asset', getValue)
  const liabilities = minor(Math.abs(sumByType(accounts, 'liability', getValue)))
  return { assets, liabilities, netWorth: minor(assets - liabilities) }
}
