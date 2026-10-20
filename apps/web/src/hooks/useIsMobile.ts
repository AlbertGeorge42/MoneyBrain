import { useEffect, useState } from 'react'

const DEFAULT_BREAKPOINT = 860

/**
 * 响应式判断当前视口是否小于指定断点（移动端）。
 * 内部使用 `matchMedia` 由浏览器自动去重并优化，比监听 `resize` 性能更优。
 *
 * @param breakpoint 断点宽度（px），默认 860
 * @returns 是否处于移动端视口
 */
export function useIsMobile(breakpoint: number = DEFAULT_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < breakpoint
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches)
    }
    setIsMobile(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [breakpoint])

  return isMobile
}

export const MOBILE_BREAKPOINT = DEFAULT_BREAKPOINT
