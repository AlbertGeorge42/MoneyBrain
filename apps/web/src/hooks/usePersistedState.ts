import { useState, useEffect } from 'react'

export interface PersistedStateOptions<T> {
  serialize?: (value: T) => string
  deserialize?: (raw: string) => T | null
  storage?: 'sessionStorage' | 'localStorage'
}

const defaultSerialize = JSON.stringify
const defaultDeserialize = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * 带 storage 持久化的 useState 包装。
 * - storage 读取异常时静默回退到 defaultValue
 * - 组件卸载时不清理 storage（符合 sessionStorage 语义：标签页级生命周期）
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T,
  options?: PersistedStateOptions<T>,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const serialize = options?.serialize ?? defaultSerialize
  const deserialize = options?.deserialize ?? defaultDeserialize
  const storage = options?.storage === 'localStorage' ? localStorage : sessionStorage

  const [state, setState] = useState<T>(() => {
    try {
      const raw = storage.getItem(key)
      if (raw === null) return defaultValue as T
      const parsed = deserialize(raw)
      return parsed !== null ? (parsed as T) : defaultValue as T
    } catch {
      return defaultValue as T
    }
  })

  useEffect(() => {
    try {
      storage.setItem(key, serialize(state))
    } catch {
      // quota exceeded 或 private browsing — 静默忽略
    }
  }, [key, state, serialize, storage])

  return [state, setState]
}
