/**
 * 浮层打开状态：任意 HfSheet（抽屉/弹窗）打开时登记，全部关闭后清除。
 *
 * 为什么需要它：桌面侧栏「记一笔」与移动端 FAB 都 portal 到 body 级宿主，
 * 而抽屉渲染在带 transform 的画布层叠上下文内——两者 z-index 不在同一上下文，
 * 无法靠层级让遮罩盖住按钮。改为让按钮在任意浮层打开时真正禁用，
 * 不依赖 Drawer 的内部 DOM 或 Mantine 的 z-index。
 *
 * 用 useSyncExternalStore + 计数（抽屉可能嵌套）：HfSheet 挂载打开时 +1、
 * 关闭/卸载时 −1；AppShell 的记一笔按钮订阅 `open > 0` 自动禁用。
 * 无 provider，所有入口共用同一份状态。
 */
import { useSyncExternalStore } from 'react'

let openCount = 0
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

/** HfSheet 打开时调用，返回关闭时执行的注销函数。 */
export function registerOverlay(): () => void {
  openCount += 1
  emit()
  let released = false
  return () => {
    if (released) return
    released = true
    openCount = Math.max(0, openCount - 1)
    emit()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): boolean {
  return openCount > 0
}

/** 当前是否有任意浮层打开（含嵌套）。SSR 下恒为 false。 */
export function useOverlayOpen(): boolean {
  // useSyncExternalStore 的第三参只在 SSR 用到；浏览器走 getSnapshot。
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
