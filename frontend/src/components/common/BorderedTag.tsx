import React from 'react'
import { Tag } from 'antd'

interface BorderedTagProps {
  color: string
  children: React.ReactNode
  closable?: boolean
  onClose?: () => void
  className?: string
  style?: React.CSSProperties
}

/**
 * 通用带边框的 Tag：边框色与文本色取自同一颜色变量，背景透明。
 * 用于替代散落在各组件的内联 `<Tag style={{ color, borderColor, backgroundColor: 'transparent' }} />`。
 */
const BorderedTag: React.FC<BorderedTagProps> = ({
  color,
  children,
  closable,
  onClose,
  className,
  style,
}) => {
  return (
    <Tag
      closable={closable}
      onClose={onClose}
      className={className}
      style={{
        color,
        borderColor: color,
        backgroundColor: 'transparent',
        ...style,
      }}
    >
      {children}
    </Tag>
  )
}

export default BorderedTag
