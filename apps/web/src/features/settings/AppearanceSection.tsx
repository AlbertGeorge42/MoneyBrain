/**
 * 设置 · 外观主题分区。
 *
 * 主题唯一来源仍是 Mantine 的 colorScheme；本组件只负责三档单选与「当前生效」文案。
 */
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { HfButton } from '@/features/shared/HfButton'
import type { ThemeMode } from '@/features/shared/types'

const THEME_OPTIONS: readonly { value: ThemeMode; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
]

interface AppearanceSectionProps {
  themeMode: ThemeMode
  currentTheme: 'light' | 'dark'
  onThemeChange: (mode: ThemeMode) => void
}

export function AppearanceSection({
  themeMode,
  currentTheme,
  onThemeChange,
}: AppearanceSectionProps) {
  const effectiveLabel =
    themeMode === 'system'
      ? `跟随系统（当前${currentTheme === 'dark' ? '深色' : '浅色'}）`
      : currentTheme === 'dark'
        ? '深色'
        : '浅色'
  return (
    <div className="mb-set-appearance">
      <div className="mb-set-subblock">
        <span className="mb-set-label" id="mb-set-theme-label">
          外观主题
        </span>
        <div
          className="mb-set-sort mb-set-theme-grid"
          role="radiogroup"
          aria-labelledby="mb-set-theme-label"
        >
          {THEME_OPTIONS.map((option) => {
            const active = themeMode === option.value
            const Icon = option.icon
            return (
              <HfButton
                key={option.value}
                role="radio"
                aria-checked={active}
                className={
                  active
                    ? 'mb-set-kind mb-set-theme-option is-active'
                    : 'mb-set-kind mb-set-theme-option'
                }
                onClick={() => onThemeChange(option.value)}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{option.label}</span>
              </HfButton>
            )
          })}
        </div>
      </div>
      <p className="mb-set-theme-status" role="status">
        当前生效：{effectiveLabel}
      </p>
      <p className="mb-set-hint">
        切换后立即作用于整个应用，并记住选择；「跟随系统」会随操作系统外观自动变化。
      </p>
    </div>
  )
}
