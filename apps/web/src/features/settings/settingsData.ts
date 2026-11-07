/**
 * 设置页「数据与备份」「账户期初」分区的共享模型。
 *
 * 只放跨页面与抽屉复用的纯函数 / 类型，不持有 React 状态：
 * - 期初补录的账户快照与净资产口径；
 * - 清空账本的确认文字与数据区忙碌态。
 */
import { accountApi } from '@/services/api'
import { unwrapApiData } from '@/services/apiResult'
import { todayLocal } from '@/features/overview/apiLedger'

/** 清空确认需要用户逐字输入的文字 */
export const CLEAR_WORD = '清空账本'

/** 数据区同一时间只允许一个写操作。 */
export type DataBusy = null | 'export' | 'preview' | 'import' | 'clear' | `rollback:${string}`

/** 账户快照：余额按 balance-at 当日口径取，避免用总数或流水倒推。 */
export interface AccountSnapshotRow {
  id: string
  name: string
  isLiability: boolean
  initialBalance: number
  initialBalanceDate: string | null
  balance: number
}

export interface NetSnapshot {
  assets: number
  liabilities: number
  net: number
}

export interface OpeningStep {
  accounts: AccountSnapshotRow[]
  before: NetSnapshot
}

export interface OpeningResult {
  before: NetSnapshot
  after: NetSnapshot
}

export type OpeningValues = Record<string, { amount: string; date: string }>

export function netSnapshotOf(rows: readonly AccountSnapshotRow[]): NetSnapshot {
  let assets = 0
  let liabilities = 0
  for (const row of rows) {
    if (row.isLiability) liabilities += row.balance
    else assets += row.balance
  }
  // 负债余额按「绝对欠款」口径展示，净资产 = 资产 − 负债（与报表页一致）。
  const debt = Math.abs(liabilities)
  return { assets, liabilities: debt, net: assets - debt }
}

export async function fetchAccountSnapshots(): Promise<AccountSnapshotRow[]> {
  const accounts = await accountApi.getAll().then(unwrapApiData)
  return Promise.all(
    accounts.map(async (account) => {
      const result = await accountApi.getBalanceAt(account.id, todayLocal()).then(unwrapApiData)
      return {
        id: account.id,
        name: account.name,
        isLiability: account.type === 'liability',
        initialBalance: Number(account.initialBalance),
        initialBalanceDate: account.initialBalanceDate,
        balance: result.balance,
      }
    }),
  )
}
