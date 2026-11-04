import { useLayoutEffect, useRef, useState } from 'react'
import { Tooltip } from '@mantine/core'

type TruncateCellProps = {
  text: string
  className: string
}

/**
 * 截断单元格：只有真的溢出时才进 tab 序列并提供 tooltip。
 * 行高固定，不允许行内展开；tooltip 向上展开，避开表尾合计行。
 */
export function TruncateCell({ text, className }: TruncateCellProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [truncated, setTruncated] = useState(false)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return

    const measure = () => {
      setTruncated(node.scrollWidth > node.clientWidth + 1)
    }

    measure()
    window.addEventListener('resize', measure)
    // 设备/列宽切换会改变单元格宽度，重新判定是否需要 tooltip。
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(node)

    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [text])

  return (
    <Tooltip
      label={text}
      disabled={!truncated}
      openDelay={300}
      withinPortal
      position="top"
      events={{ hover: true, focus: true, touch: true }}
    >
      <span
        ref={ref}
        className={className}
        tabIndex={truncated ? 0 : undefined}
        aria-label={truncated ? text : undefined}
      >
        {text}
      </span>
    </Tooltip>
  )
}
