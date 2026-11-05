/**
 * 记账金额输入的解析规则（与 QuickEntry 拆分，避免 fast-refresh 警告）。
 *
 * 银行 App 复制来的文本常带千分位与空格：`1,234.56` 必须解析为 1234.56，
 * 不能因为分隔符被判「格式有误」。
 */

/** 解析前剥离千分位逗号与空格。 */
export function normalizeAmountInput(raw: string): string {
  return raw.replace(/[,\s，]/g, '')
}

/** 失焦时按千分位格式化；解析失败时保持用户原文，方便继续修改。 */
export function formatAmountInput(raw: string): string {
  const cents = toCents(raw)
  if (cents === null) return raw
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

/** 返回分值；非法、非正数或超过两位小数时返回 null。 */
export function toCents(raw: string): number | null {
  const normalized = normalizeAmountInput(raw).trim()
  if (!normalized) return null
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null
  const numeric = Number(normalized)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return Math.round(numeric * 100)
}
