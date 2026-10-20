import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

export interface SearchParamsStateOptions<T> {
  /** 从 URLSearchParams 解析出完整状态对象。未出现的参数应返回 defaultValue 中的对应字段。 */
  parse: (params: URLSearchParams) => T
  /** 将状态序列化为 URLSearchParams。只写入非默认值，返回的 params 中不要包含默认值。 */
  serialize: (value: T) => URLSearchParams
  /**
   * 默认值。与当前值相同时不写入 URL，保持 URL 干净。
   * 由调用方提供，hook 不感知业务默认值。
   * serialize 内部负责与 defaultValue 比较以决定是否写入 URL。
   */
  defaultValue: T
  /**
   * 可选的 sessionStorage key。提供时：
   * - 挂载时若 URL 为空，从 sessionStorage 恢复上次状态
   * - 每次 set 时同步写入 sessionStorage
   * - 关闭应用（标签页关闭）→ sessionStorage 自动清除 → 恢复默认
   */
  storageKey?: string
}

/**
 * 将组件状态同步到 URL search params。
 *
 * - 筛选变更默认 replace（不污染浏览器历史）
 * - 只写入非默认值，URL 保持干净
 * - 支持批量更新，避免多次 render
 * - 可选 sessionStorage 回退：页面切换后从 sessionStorage 恢复
 *
 * 用法：
 * ```ts
 * const [filters, setFilters, setMultipleFilters] = useSearchParamsState({
 *   defaultValue: { type: [], accountId: [], categoryId: [], dateRange: null },
 *   parse: (params) => ({ ... }),
 *   serialize: (value) => { ... },
 *   storageKey: 'moneybrain:transactions:filters',
 * })
 * ```
 */
export function useSearchParamsState<T>(
  options: SearchParamsStateOptions<T>,
): [T, (updater: T | ((prev: T) => T)) => void, (partial: Partial<T>) => void] {
  const { parse, serialize, storageKey } = options
  const [searchParams, setSearchParams] = useSearchParams()

  // 挂载时：URL 为空且有 storageKey → 从 sessionStorage 恢复
  useEffect(() => {
    if (!storageKey) return
    const hasUrlParams = searchParams.toString().length > 0
    if (hasUrlParams) return
    try {
      const stored = sessionStorage.getItem(storageKey)
      if (stored) {
        const restored = new URLSearchParams(stored)
        setSearchParams(restored, { replace: true })
      }
    } catch {
      // 静默忽略
    }
    // 仅在挂载时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const state = useMemo(() => parse(searchParams), [searchParams, parse])

  const set = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setSearchParams((prev) => {
        const current = parse(prev)
        const next = typeof updater === 'function' ? (updater as (p: T) => T)(current) : updater
        const serialized = serialize(next)
        // 同步写入 sessionStorage
        if (storageKey) {
          try {
            const str = serialized.toString()
            if (str.length > 0) {
              sessionStorage.setItem(storageKey, str)
            } else {
              sessionStorage.removeItem(storageKey)
            }
          } catch { /* 静默忽略 */ }
        }
        return serialized
      }, { replace: true })
    },
    [setSearchParams, parse, serialize, storageKey],
  )

  /** 批量更新：传入部分字段，与当前状态合并后写入 URL。 */
  const setMultiple = useCallback(
    (partial: Partial<T>) => {
      setSearchParams((prev) => {
        const current = parse(prev)
        const next = { ...current, ...partial }
        const serialized = serialize(next)
        if (storageKey) {
          try {
            const str = serialized.toString()
            if (str.length > 0) {
              sessionStorage.setItem(storageKey, str)
            } else {
              sessionStorage.removeItem(storageKey)
            }
          } catch { /* 静默忽略 */ }
        }
        return serialized
      }, { replace: true })
    },
    [setSearchParams, parse, serialize, storageKey],
  )

  return [state, set, setMultiple]
}
