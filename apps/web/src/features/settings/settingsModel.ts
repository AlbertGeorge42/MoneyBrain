/**
 * 设置页分区元数据（仅设置页使用）。
 *
 * 账户 / 分类 / 现金流的纯派生与账本修改已拆到
 * `features/ledger-config/model`，报表页与设置页共用。
 */

export type SectionId =
  | 'accounts'
  | 'categories'
  | 'cashflow'
  | 'appearance'
  | 'backup'
  | 'display'
  | 'data'
  | 'trash'

export interface SectionMeta {
  id: SectionId
  label: string
}

export const CONFIG_SECTIONS: readonly SectionMeta[] = [
  { id: 'accounts', label: '账户分类' },
  { id: 'categories', label: '收支分类' },
  { id: 'cashflow', label: '现金流分类' },
]

export const GENERAL_SECTIONS: readonly SectionMeta[] = [
  { id: 'appearance', label: '外观主题' },
  { id: 'backup', label: '自动备份' },
  { id: 'display', label: '列表显示' },
  { id: 'data', label: '数据与备份' },
  { id: 'trash', label: '回收站' },
]

export function sectionMeta(id: SectionId): SectionMeta {
  return [...CONFIG_SECTIONS, ...GENERAL_SECTIONS].find((item) => item.id === id) ?? CONFIG_SECTIONS[0]
}
