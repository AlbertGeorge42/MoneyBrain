/**
 * 分类/账户图标容器（圆形）
 * - 有 color（AntD 13 官方色名）→ 走 getIconColorTokens，使用对应预设色
 * - 无 color → 走 getIconColorTokens，使用中性色（CSS 变量，按主题切换 bold/pale）
 */

import React, { useMemo } from 'react'
import { DynamicIcon } from './DynamicIcon'
import { getIconColorTokens } from '../../utils/colorPalette'
import { useTheme } from '../../styles/ThemeContext'

interface CategoryIconProps {
  /** 图标名（lucide） */
  name?: string | null
  /** 备选图标（找不到时使用） */
  fallback?: string
  /** 用户色（AntD 13 官方色名），无值时使用中性背景 */
  color?: string | null
  /** 容器尺寸，默认 32 */
  size?: number
  /** 图标尺寸，默认 18 */
  iconSize?: number
  className?: string
}

const CategoryIcon: React.FC<CategoryIconProps> = ({
  name,
  fallback,
  color,
  size = 32,
  iconSize = 18,
  className,
}) => {
  const { isDark } = useTheme()
  const tokens = useMemo(() => getIconColorTokens(color ?? null, isDark), [color, isDark])

  return (
    <span
      className={`category-icon ${className ?? ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: tokens.bg,
        color: tokens.fg,
        flexShrink: 0,
      }}
    >
      <DynamicIcon name={name} size={iconSize} fallback={fallback} />
    </span>
  )
}

export default CategoryIcon
