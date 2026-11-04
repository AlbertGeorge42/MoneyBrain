/** 流水列表「显示」面板的长期设置（列显隐 / 密度），PC 与移动共用同一数据源。 */
export type ListDisplay = {
  account: boolean
  type: boolean
  note: boolean
  density: 'standard' | 'compact'
}

export const DEFAULT_LIST_DISPLAY: ListDisplay = {
  account: true,
  type: true,
  note: true,
  density: 'standard',
}

const STORAGE_KEY = 'moneybrain.hf.list-display'

export function readListDisplay(): ListDisplay {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_LIST_DISPLAY
    const parsed = JSON.parse(raw) as Partial<ListDisplay>
    return {
      ...DEFAULT_LIST_DISPLAY,
      ...parsed,
      density: parsed.density === 'compact' ? 'compact' : 'standard',
    }
  } catch {
    return DEFAULT_LIST_DISPLAY
  }
}

export function writeListDisplay(value: ListDisplay): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // 隐私模式等写不进去时只影响下次启动，不阻塞本次操作
  }
}
