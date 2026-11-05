export type SortMode = 'date' | 'amount'

export interface DisplaySettings {
  showNote: boolean
  showAccount: boolean
  sort: SortMode
}

export const DEFAULT_DISPLAY: DisplaySettings = {
  showNote: true,
  showAccount: true,
  sort: 'date',
}

export const SORT_OPTIONS: readonly { value: SortMode; label: string }[] = [
  { value: 'date', label: '日期（新到旧）' },
  { value: 'amount', label: '金额（大到小）' },
]

const STORAGE_KEY = 'mb-hf-display'

/** 流水页与设置页共用同一份列表显示偏好（本地存储，跨页面即时生效）。 */
export function readDisplaySettings(): DisplaySettings {
  if (typeof window === 'undefined') return DEFAULT_DISPLAY
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_DISPLAY
    const parsed = JSON.parse(raw) as Partial<DisplaySettings>
    return {
      showNote: typeof parsed.showNote === 'boolean' ? parsed.showNote : DEFAULT_DISPLAY.showNote,
      showAccount:
        typeof parsed.showAccount === 'boolean' ? parsed.showAccount : DEFAULT_DISPLAY.showAccount,
      sort: parsed.sort === 'amount' ? 'amount' : 'date',
    }
  } catch {
    return DEFAULT_DISPLAY
  }
}

export function writeDisplaySettings(value: DisplaySettings): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // 隐私模式等场景写入失败时保持内存态即可
  }
}
