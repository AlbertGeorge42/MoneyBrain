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
