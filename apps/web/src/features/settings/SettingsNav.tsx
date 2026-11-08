/**
 * 设置页导航：桌面左侧分区导航 + 移动端入口列表。
 *
 * 只负责分区元数据与选中态；分区摘要由页面按当前账本计算后传入。
 */
import {
  ChevronRight,
  Database,
  HardDriveDownload,
  Sun,
  Tag,
  Trash2,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { HfButton } from '@/features/shared/HfButton'
import {
  CONFIG_SECTIONS,
  GENERAL_SECTIONS,
  type SectionId,
} from './settingsModel'

const GROUPS = [
  { title: '配置中心', items: CONFIG_SECTIONS },
  { title: '通用', items: GENERAL_SECTIONS },
] as const

function sectionIcon(id: SectionId): LucideIcon {
  switch (id) {
    case 'accounts':
      return Wallet
    case 'categories':
      return Tag
    case 'cashflow':
      return TrendingUp
    case 'appearance':
      return Sun
    case 'backup':
      return HardDriveDownload
    case 'display':
      return Tag
    case 'data':
      return Database
    default:
      return Trash2
  }
}

interface SettingsDesktopNavProps {
  active: SectionId
  onSelect: (id: SectionId) => void
  apiMode: boolean
  trashCount: number
}

export function SettingsDesktopNav({
  active,
  onSelect,
  apiMode,
  trashCount,
}: SettingsDesktopNavProps) {
  return (
    <nav className="mb-set-nav" aria-label="设置分区">
      {GROUPS.map((group) => (
        <div key={group.title} className="mb-set-nav-group">
          <h2 className="mb-set-group-title">{group.title}</h2>
          {group.items.map((item) => (
            <HfButton
              key={item.id}
              className={active === item.id ? 'mb-set-nav-item is-active' : 'mb-set-nav-item'}
              aria-current={active === item.id ? 'page' : undefined}
              onClick={() => onSelect(item.id)}
            >
              <span>{item.label}</span>
              <span className="mb-set-nav-count">
                {item.id === 'trash' ? (apiMode ? String(trashCount) : '0') : ''}
              </span>
            </HfButton>
          ))}
        </div>
      ))}
    </nav>
  )
}

interface SettingsMobileListProps {
  onOpen: (id: SectionId) => void
  summaries: Record<SectionId, string>
}

export function SettingsMobileList({ onOpen, summaries }: SettingsMobileListProps) {
  return (
    <div className="mb-set-mobile">
      {GROUPS.map((group) => (
        <section key={group.title} className="mb-set-mobile-group">
          <h2 className="mb-set-group-title">{group.title}</h2>
          <div className="mb-set-list">
            {group.items.map((item) => {
              const Icon = sectionIcon(item.id)
              return (
                <HfButton key={item.id} className="mb-set-entry" onClick={() => onOpen(item.id)}>
                  <span className="mb-set-icon">
                    <Icon size={17} />
                  </span>
                  <span className="mb-set-name">{item.label}</span>
                  <span className="mb-set-meta">{summaries[item.id]}</span>
                  <ChevronRight size={16} className="mb-set-chevron" />
                </HfButton>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
