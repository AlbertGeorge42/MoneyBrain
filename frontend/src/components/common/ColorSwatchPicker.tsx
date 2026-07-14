/**
 * 颜色选择器（色卡）
 * - 仅展示 AntD 13 个官方预设色
 * - 选中态用环形边框 + 加粗描边表示
 * - swatch 双色（bg=色块 / fg=图标），与 CategoryIcon 实际显示一致
 * - 14 个色块（1 个无色 + 13 个色）单行排布
 */

import React, { useMemo } from 'react'
import { theme } from 'antd'
import { X } from 'lucide-react'
import {
  ANTD_PRESET_COLORS,
  getIconColorTokens,
  type AntDPresetColor,
} from '../../utils/colorPalette'
import { useTheme } from '../../styles/ThemeContext'

interface ColorSwatchPickerProps {
  value?: string | null
  onChange?: (value: string | null) => void
  /** 触发器尺寸（像素），默认 22 */
  size?: number
  /** 是否允许清空（不选色），默认 true */
  allowClear?: boolean
  /** 是否禁用 */
  disabled?: boolean
}

const ColorSwatchPicker: React.FC<ColorSwatchPickerProps> = ({
  value,
  onChange,
  size = 22,
  allowClear = true,
  disabled = false,
}) => {
  const { token } = theme.useToken()
  const { isDark } = useTheme()
  const selected = value ?? null

  // 预计算每个预设色的 bg/fg（用于 swatch 双色显示）
  const paletteMap = useMemo(() => {
    const map: Record<AntDPresetColor, { bg: string; fg: string }> = {} as Record<
      AntDPresetColor,
      { bg: string; fg: string }
    >
    for (const name of ANTD_PRESET_COLORS) {
      map[name] = getIconColorTokens(name, isDark)
    }
    return map
  }, [isDark])

  // 无色按钮的色对（与 CategoryIcon 走同一函数）
  const neutralTokens = useMemo(() => getIconColorTokens(null, isDark), [isDark])

  const handleClick = (next: AntDPresetColor | null) => {
    if (disabled) return
    if (selected === next) {
      onChange?.(null)
      return
    }
    onChange?.(next)
  }

  const dotSize = Math.round(size * 0.5)
  const iconSize = Math.round(size * 0.5)

  return (
    <div
      className="color-swatch-picker"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        alignItems: 'center',
        padding: 5,
        borderRadius: token.borderRadius,
        background: 'var(--mb-color-bg-panel)',
        border: '1px solid var(--mb-color-border-subtle)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {allowClear && (
        <button
          type="button"
          className="color-swatch-picker__swatch"
          aria-label="不使用颜色"
          aria-pressed={selected === null}
          title="不使用颜色"
          onClick={() => handleClick(null)}
          style={{
            width: size,
            height: size,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            border: `2px solid ${selected === null ? token.colorPrimary : 'var(--mb-color-border-subtle)'}`,
            background: neutralTokens.bg,
            color: neutralTokens.fg,
            cursor: disabled ? 'not-allowed' : 'pointer',
            padding: 0,
            transition: 'transform 0.15s',
            flexShrink: 0,
          }}
        >
          <X size={iconSize} />
        </button>
      )}
      {ANTD_PRESET_COLORS.map((name) => {
        const isSelected = selected === name
        const tokens = paletteMap[name]
        return (
          <button
            key={name}
            type="button"
            className="color-swatch-picker__swatch"
            aria-label={name}
            aria-pressed={isSelected}
            title={name}
            onClick={() => handleClick(name)}
            style={{
              width: size,
              height: size,
              borderRadius: '50%',
              border: `2px solid ${isSelected ? token.colorPrimary : 'transparent'}`,
              background: tokens.bg,
              boxShadow: isSelected ? `0 0 0 2px var(--mb-color-bg-panel)` : 'none',
              cursor: disabled ? 'not-allowed' : 'pointer',
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              if (!disabled) e.currentTarget.style.transform = 'scale(1.08)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)'
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-block',
                width: dotSize,
                height: dotSize,
                borderRadius: '50%',
                background: tokens.fg,
              }}
            />
          </button>
        )
      })}
    </div>
  )
}

export default ColorSwatchPicker
