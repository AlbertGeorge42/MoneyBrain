// ===== 通用响应类型 =====

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
  timestamp: string
}

export interface PaginatedResponse<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

// ===== 账户分类 =====

export interface AccountCategory {
  id: string
  name: string
  type: string
  icon: string | null
  parentId: string | null
  sort: number
  parent: AccountCategory | null
  children: AccountCategory[]
  isCashEquivalent: boolean
  createdAt: string
  updatedAt: string
}

// ===== 账户 =====

export interface Account {
  id: string
  name: string
  type: string
  balance: number
  initialBalance: number
  initialBalanceDate: string | null
  icon: string | null
  categoryId: string | null
  sort: number
  category: AccountCategory | null
  createdAt: string
  updatedAt: string
}

// ===== 交易分类 =====

export interface TransactionCategory {
  id: string
  name: string
  type: string
  icon: string | null
  parentId: string | null
  sort: number
  parent: TransactionCategory | null
  children: TransactionCategory[]
  cashFlowType: 'operating' | 'investing' | 'financing' | null
  createdAt: string
  updatedAt: string
}

// ===== 交易 =====

export interface Transaction {
  id: string
  type: string // 'income' | 'expense' | 'transfer' | 'refund' | 'adjustment'
  amount: number
  fee: number
  coupon: number
  date: string
  note: string | null
  isAdjustment: boolean
  accountId: string
  categoryId: string | null
  toAccountId: string | null
  relatedTransactionId: string | null
  account: Account
  category: TransactionCategory | null
  toAccount: Account | null
  relatedTransaction: Transaction | null
  createdAt: string
}

// ===== 预算 =====

export interface Budget {
  id: string
  name: string
  amount: number
  period: string
  startDate: string
  endDate: string | null
  categoryId: string | null
  category: TransactionCategory | null
  createdAt: string
  updatedAt: string
}
