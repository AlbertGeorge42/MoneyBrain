/**
 * 前端金额输入边界。
 *
 * 「元 → 分」的唯一解析内核是 `packages/domain` 的 `parseAmount`：按小数点
 * 做字符串解析，绝不经过浮点（`8.115 * 100` 会得到 `811.4999…`）。
 * 本文件只负责 UI 归一化、「无效 → null」的错误策略与展示格式，
 * 不写第二套 `* 100` 换算。
 *
 * 注意：CSV / 钱迹等**文件边界**允许浮点尾差并按分四舍五入
 * （见 `scripts/rebuild-from-qianji.mts` 与导入端 `parseCsvMoney`），
 * 与用户输入框的「最多两位小数、超出即拒绝」是两种口径，不要合并。
 */

import { formatAmount, minor, parseAmount, toMajor, type Minor } from '@domain/index'

/** 解析前统一半角数字与小数点，并剥离货币符号、千分位逗号与空白。 */
export function normalizeAmountInput(raw: string): string {
  return raw
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/．/g, '.')
    .replace(/－/g, '-')
    .replace(/[¥￥$]/g, '')
    .replace(/[,，\s\u3000]/g, '')
}

export interface ParseMoneyOptions {
  /** 允许负数：调整金额、账户期初余额可为负。默认 false。 */
  allowNegative?: boolean
  /** 允许 0：筛选边界、手续费等。默认 false。 */
  allowZero?: boolean
}

/**
 * UI 金额文本 → 整数分。
 *
 * 空串、非法格式、超过两位小数、非安全整数一律返回 null（由调用方决定提示文案）；
 * 归一化先于解析，保证 `¥1,234.56` / `１２３４` 都能进同一个解析内核。
 */
export function parseMoneyInput(raw: string, options: ParseMoneyOptions = {}): Minor | null {
  const { allowNegative = false, allowZero = false } = options
  const normalized = normalizeAmountInput(raw).trim()
  if (!normalized) return null
  // 用户敲到一半的「8.」在旧实现里等价于 8；Domain 正则要求小数点后至少一位，这里补齐。
  const canonical = normalized.endsWith('.') ? normalized.slice(0, -1) : normalized
  let cents: Minor
  try {
    cents = parseAmount(canonical)
  } catch {
    return null
  }
  // 负数与 0 分开判定：允许负数（期初余额 / 调整）时不能把负数当成「非正」一并拒绝。
  if (!allowNegative && cents < 0) return null
  if (!allowZero && cents === 0) return null
  return cents
}

/** 失焦时按千分位格式化；解析失败时保持用户原文，方便继续修改。 */
export function formatAmountInput(raw: string): string {
  const cents = parseMoneyInput(raw)
  if (cents === null) return raw
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toMajor(cents))
}

/** 分 → 可编辑的元文本：整数去掉 `.00`，非整数保留两位小数。 */
export function editableAmount(value: number): string {
  return formatAmount(minor(value)).replace(/\.00$/, '')
}
