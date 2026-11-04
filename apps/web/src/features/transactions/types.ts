export type TxType = 'expense' | 'income' | 'transfer' | 'refund' | 'adjust'
export type DeviceMode = 'pc' | 'mobile'
export type DataState = 'ready' | 'loading' | 'empty' | 'error'
export type TypeFilter = 'all' | TxType

export type CategoryIcon =
  | 'utensils'
  | 'train'
  | 'shopping'
  | 'house'
  | 'gamepad'
  | 'heart'
  | 'graduation'
  | 'more'
  | 'wallet'
  | 'gift'
  | 'chart'
  | 'receipt'
  | 'transfer'
  | 'credit'
  | 'plus'
  | 'banknote'
  | 'rotate'
  | 'sliders'
  | 'wrench'

export interface Account {
  id: string
  name: string
  group: string
  lastUsed?: boolean
}

export interface Category {
  id: string
  name: string
  types: TxType[]
  colorIndex: 1 | 2 | 3 | 4 | 5 | 6
  icon: CategoryIcon
}

export interface Transaction {
  id: string
  type: TxType
  /** 有符号金额：支出 / 转出为负，收入 / 退款为正。 */
  amount: number
  categoryId: string
  subcategory: string
  accountId: string
  toAccountId?: string
  date: string
  note: string
  fee?: number
  coupon?: number
}

export interface TransactionFilters {
  query: string
  type: TypeFilter
  accountId: string | null
  categoryId: string | null
  min: number | null
  max: number | null
  from: string | null
  to: string | null
}

/** 从报表下钻到流水时携带的一次性筛选请求。 */
export type TransactionFocus = {
  key: number
  filters: Partial<TransactionFilters>
}

export const EMPTY_FILTERS: TransactionFilters = {
  query: '',
  type: 'all',
  accountId: null,
  categoryId: null,
  min: null,
  max: null,
  from: null,
  to: null,
}
