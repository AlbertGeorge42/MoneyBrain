/**
 * 生产数据适配：API DTO → 流水页 props（元、有符号金额）。
 *
 * 金额在 API 侧一律是「分」，HF 组件按「元」渲染；换算只在这里发生。
 */

import dayjs from 'dayjs'
import type {
  Account as ApiAccount,
  Minor,
  Transaction as ApiTransaction,
  TransactionCategory as ApiCategory,
} from '@contracts/types'
import type {
  Account,
  Category,
  CategoryIcon,
  Transaction,
  TxType,
} from './types'

const TYPE_FROM_API: Record<string, TxType> = {
  expense: 'expense',
  income: 'income',
  transfer: 'transfer',
  refund: 'refund',
  adjustment: 'adjust',
}

const TYPE_TO_API: Record<TxType, string> = {
  expense: 'expense',
  income: 'income',
  transfer: 'transfer',
  refund: 'refund',
  adjust: 'adjustment',
}

const ICON_BY_NAME: Record<string, CategoryIcon> = {
  utensils: 'utensils',
  food: 'utensils',
  train: 'train',
  transport: 'train',
  shopping: 'shopping',
  house: 'house',
  home: 'house',
  gamepad: 'gamepad',
  fun: 'gamepad',
  heart: 'heart',
  health: 'heart',
  graduation: 'graduation',
  education: 'graduation',
  wallet: 'wallet',
  gift: 'gift',
  chart: 'chart',
  receipt: 'receipt',
  transfer: 'transfer',
  credit: 'credit',
  plus: 'plus',
  banknote: 'banknote',
  rotate: 'rotate',
  sliders: 'sliders',
  wrench: 'wrench',
}

export function minorToYuan(value: number | null | undefined): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.round(numeric) / 100 : 0
}

export function yuanToMinor(value: number | null | undefined): Minor {
  const numeric = Number(value)
  return Math.round(Number.isFinite(numeric) ? numeric * 100 : 0) as Minor
}

export function toHfType(type: string): TxType {
  return TYPE_FROM_API[type] ?? 'expense'
}

export function toApiType(type: TxType): string {
  return TYPE_TO_API[type]
}

function toDateKey(value: string): string {
  return dayjs(value).format('YYYY-MM-DD')
}

function colorIndexOf(value: string): 1 | 2 | 3 | 4 | 5 | 6 {
  let sum = 0
  for (const char of value) sum += char.charCodeAt(0)
  return ((sum % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6
}

function iconOf(value: string | null, type: TxType): CategoryIcon {
  if (value && ICON_BY_NAME[value]) return ICON_BY_NAME[value]
  if (type === 'transfer') return 'transfer'
  if (type === 'adjust') return 'sliders'
  return 'more'
}

export function toHfTransaction(tx: ApiTransaction): Transaction {
  const type = toHfType(tx.type)
  const amount = minorToYuan(tx.amount)
  // API 金额本身有符号；支出/转出为负，收入/退款为正。
  return {
    id: tx.id,
    type,
    amount,
    categoryId: tx.categoryId ?? '',
    subcategory: tx.note?.trim() || tx.category?.name || '未命名',
    accountId: tx.accountId,
    toAccountId: tx.toAccountId ?? undefined,
    date: toDateKey(tx.date),
    note: tx.note ?? '',
    fee: tx.fee ? minorToYuan(tx.fee) : undefined,
    coupon: tx.coupon ? minorToYuan(tx.coupon) : undefined,
  }
}

export function toHfTransactions(list: ApiTransaction[] | undefined): Transaction[] {
  return (list ?? []).map(toHfTransaction)
}

export function toHfAccount(account: ApiAccount): Account {
  return {
    id: account.id,
    name: account.name,
    group: account.category?.name ?? account.type,
  }
}

export function toHfAccounts(list: ApiAccount[] | undefined): Account[] {
  return (list ?? []).map(toHfAccount)
}

export function toHfCategory(category: ApiCategory): Category {
  const type = toHfType(category.type)
  const types: TxType[] =
    type === 'expense'
      ? ['expense', 'refund']
      : type === 'income'
        ? ['income']
        : type === 'transfer'
          ? ['transfer']
          : ['adjust']
  return {
    id: category.id,
    name: category.name,
    types,
    colorIndex: colorIndexOf(category.id),
    icon: iconOf(category.icon, type),
  }
}

/** 分类全部可用于记账：父分类同样是一级可选分类。 */
export function toHfCategories(list: ApiCategory[] | undefined): Category[] {
  return (list ?? []).map(toHfCategory)
}

/**
 * HF 表单（元、有符号）→ API 写入载荷（分、有符号）。
 * 调整类型不需要分类；退款必须挂原交易，生产录入暂不开放。
 */
export function toApiTransactionPayload(tx: Transaction): Partial<ApiTransaction> {
  const type = toApiType(tx.type)
  const payload: Partial<ApiTransaction> = {
    type: type as ApiTransaction['type'],
    amount: yuanToMinor(tx.amount),
    date: tx.date,
    note: tx.note || undefined,
    accountId: tx.accountId,
  }
  if (tx.fee !== undefined) payload.fee = yuanToMinor(tx.fee)
  if (tx.coupon !== undefined) payload.coupon = yuanToMinor(tx.coupon)
  if (type === 'expense' || type === 'income' || type === 'refund') payload.categoryId = tx.categoryId
  if (tx.type === 'transfer') payload.toAccountId = tx.toAccountId ?? null
  return payload
}

/** 明细编辑只覆盖可改字段，避免把关联对象一并提交。 */
export function toApiUpdatePayload(tx: Transaction): Partial<ApiTransaction> {
  const payload = toApiTransactionPayload(tx)
  delete payload.type
  return payload
}
