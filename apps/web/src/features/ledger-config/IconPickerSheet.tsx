/**
 * 图标选择器：独立抽屉，按分组浏览 + 搜索。
 *
 * 编辑抽屉只留一个「选择图标」入口，图标网格全部收在这里——
 * 网格是随图标数量增长的界面，全展开会把编辑表单挤到屏外，
 * 也让「加一个图标」变成改多处布局的事。
 */
import { useState } from 'react'
import { Search, Tag, X } from 'lucide-react'
import { HfButton } from '@/features/shared/HfButton'
import { HfSheet } from '@/features/shared/HfSheet'
import type { DeviceMode } from '@/features/shared/types'
import {
  CATEGORY_ICON_GROUPS,
  searchCategoryIcons,
  type CategoryIconGroupId,
  type CategoryIconOption,
} from '@/features/overview/categoryIcons'

export function IconPickerSheet({
  opened,
  device,
  value,
  recommendedGroup,
  onSelect,
  onClose,
}: {
  opened: boolean
  device: DeviceMode
  /** 当前选中的图标 key；空串表示「自动」。 */
  value: string
  /** 推荐分组：排在最前并标注「推荐」，不预选任何值。 */
  recommendedGroup?: CategoryIconGroupId | null
  onSelect: (iconKey: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')

  const matches = searchCategoryIcons(query)
  const groups = CATEGORY_ICON_GROUPS.map((group) => ({
    ...group,
    recommended: group.id === recommendedGroup,
    options: matches.filter((option) => option.group === group.id),
  }))
    .filter((group) => group.options.length > 0)
    .sort((a, b) => Number(b.recommended) - Number(a.recommended))

  const iconChoice = (option: CategoryIconOption) => {
    const Icon = option.icon
    const active = value === option.key
    return (
      <HfButton
        key={option.key}
        className={active ? 'mb-set-kind mb-set-icon-choice is-active' : 'mb-set-kind mb-set-icon-choice'}
        aria-pressed={active}
        aria-label={option.label}
        title={option.label}
        onClick={() => {
          onSelect(option.key)
          onClose()
        }}
      >
        <Icon size={18} strokeWidth={1.8} />
      </HfButton>
    )
  }

  return (
    <HfSheet
      variant="settings"
      device={device}
      opened={opened}
      onClose={onClose}
      desktopSize={380}
      contentClassName="mb-set-sheet"
    >
      <div className="mb-set-sheet-head">
        <h2 className="mb-set-sheet-title">选择图标</h2>
        <HfButton className="mb-set-icon-btn" aria-label="关闭" onClick={onClose}>
          <X size={18} />
        </HfButton>
      </div>
      <div className="mb-set-sheet-body">
        <label className="mb-set-field">
          <span className="mb-set-label">搜索</span>
          <input
            className="mb-set-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="中文 / 英文，如 咖啡、coffee"
            aria-label="搜索图标"
          />
        </label>

        <div className="mb-set-icon-sections">
          <div className="mb-set-icon-grid">
            <HfButton
              className={
                value === '' ? 'mb-set-kind mb-set-icon-choice is-active' : 'mb-set-kind mb-set-icon-choice'
              }
              aria-pressed={value === ''}
              aria-label="自动（按分类名称）"
              title="自动（按分类名称）"
              onClick={() => {
                onSelect('')
                onClose()
              }}
            >
              <Tag size={18} strokeWidth={1.8} />
            </HfButton>
          </div>
          {groups.map((group) => (
            <section className="mb-set-icon-section" key={group.id} aria-label={group.label}>
              <h3 className="mb-set-icon-section-title">
                {group.label}
                {group.recommended ? ' · 推荐' : ''}
              </h3>
              <div className="mb-set-icon-grid">
                {group.options.map((option) => iconChoice(option))}
              </div>
            </section>
          ))}
          {groups.length === 0 && (
            <p className="mb-set-hint">
              <Search size={14} />
              没有匹配的图标，换个关键词试试。
            </p>
          )}
        </div>
        <p className="mb-set-hint">
          图标会显示在流水与分类详情中；选「自动」时按分类名称匹配，匹配不到则使用通用标签。
        </p>
      </div>
    </HfSheet>
  )
}
