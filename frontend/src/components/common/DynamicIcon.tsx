import React from 'react'
import * as LucideIcons from 'lucide-react'

interface DynamicIconProps {
  name: string | null | undefined
  size?: number
  className?: string
  style?: React.CSSProperties
  fallback?: string
}

const toPascalCase = (str: string): string => {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

const isEmoji = (str: string): boolean => {
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u
  return emojiRegex.test(str)
}

export const DynamicIcon: React.FC<DynamicIconProps> = ({ 
  name, 
  size = 16, 
  className, 
  style,
  fallback 
}) => {
  // 如果是 emoji，使用 fallback 或默认图标
  if (!name || isEmoji(name)) {
    const fallbackName = fallback || 'circle'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const FallbackIcon = (LucideIcons as any)[toPascalCase(fallbackName)]
    if (FallbackIcon) {
      return <FallbackIcon size={size} className={className} style={style} />
    }
    return null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComponent = (LucideIcons as any)[toPascalCase(name)]

  if (!IconComponent) {
    // 如果找不到图标，使用 fallback 或默认图标
    const fallbackName = fallback || 'circle'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const FallbackIcon = (LucideIcons as any)[toPascalCase(fallbackName)]
    if (FallbackIcon) {
      return <FallbackIcon size={size} className={className} style={style} />
    }
    return null
  }

  return <IconComponent size={size} className={className} style={style} />
}

export default DynamicIcon
