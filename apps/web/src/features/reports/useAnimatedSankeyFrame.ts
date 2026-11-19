import { useCallback, useLayoutEffect, useRef, useState } from 'react'

/**
 * 桑基动画帧：几何只动 y / h、ribbon 端点 y1 / y2 / height 与 viewBox height，
 * x 由三列固定不参与插值。每帧自携带展示数据（render），因此退出元素也能在
 * 动画期间继续渲染，实现组↔成员的散开 / 聚拢形变。
 */
export interface FrameNode {
  id: string
  /** 折叠组身份：组节点 id 即 groupId；成员节点指向所属组。用于展开 / 收起桥接。 */
  groupId?: string
  isGroup: boolean
  x: number
  y: number
  h: number
  opacity: number
  /** 不透明展示数据（渲染层 cast 回 PlacedNode）。 */
  render: unknown
}

export interface FrameLink {
  id: string
  x1: number
  x2: number
  y1: number
  y2: number
  height: number
  opacity: number
  transfer: boolean
  render: unknown
}

export interface SankeyFrame {
  nodes: Map<string, FrameNode>
  links: Map<string, FrameLink>
  height: number
}

const DURATION = 420
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * rAF 帧进度：start 为 0 时用首帧 now 初始化；t 严格钳制在 [0,1]。
 * 用帧时间戳而非 performance.now() 作起点，避免首帧 now<start 导致 t<0 外插跳变。
 */
export function frameProgress(now: number, start: number, duration = DURATION): { t: number; start: number } {
  const origin = start === 0 ? now : start
  return { t: Math.max(0, Math.min(1, (now - origin) / duration)), start: origin }
}

function sameFrame(a: SankeyFrame, b: SankeyFrame): boolean {
  if (a.height !== b.height || a.nodes.size !== b.nodes.size || a.links.size !== b.links.size) return false
  for (const [id, value] of a.nodes) {
    const other = b.nodes.get(id)
    if (!other || value.y !== other.y || value.h !== other.h) return false
  }
  for (const [id, value] of a.links) {
    const other = b.links.get(id)
    if (!other || value.y1 !== other.y1 || value.y2 !== other.y2 || value.height !== other.height) return false
  }
  return true
}

/**
 * 纯插值，不修改入参。
 * - 共有 key：几何 lerp，opacity=1，展示取目标。
 * - 新 key：以同 groupId 的旧节点为起点（组节点 → 成员「散开」），opacity 0→1；
 *   无桥接则原地淡入。
 * - 退出 key：保留在帧中，几何 lerp 到同 groupId 的新节点（成员 → 组「聚拢」），
 *   opacity 1→0；无桥接则原地淡出。
 */
export function interpolateSankeyFrame(from: SankeyFrame, to: SankeyFrame, t: number): SankeyFrame {
  const nodes = new Map<string, FrameNode>()
  for (const [id, target] of to.nodes) {
    const src = from.nodes.get(id)
    if (src) {
      nodes.set(id, {
        ...target,
        x: lerp(src.x, target.x, t),
        y: lerp(src.y, target.y, t),
        h: lerp(src.h, target.h, t),
        // 从当前 opacity 过渡，支持连点时半途元素继续平滑变化而非瞬间闪到 1。
        opacity: lerp(src.opacity, 1, t),
      })
      continue
    }
    // 进入成员：以同 groupId 的旧组节点几何为起点（组 → 成员「散开」）。
    const anchor = target.groupId ? from.nodes.get(target.groupId) : undefined
    const startY = anchor ? anchor.y : target.y
    const startH = anchor ? anchor.h : target.h
    nodes.set(id, {
      ...target,
      y: lerp(startY, target.y, t),
      h: lerp(startH, target.h, t),
      opacity: lerp(0, 1, t),
    })
  }
  for (const [id, src] of from.nodes) {
    if (to.nodes.has(id)) continue
    const anchor = src.groupId ? to.nodes.get(src.groupId) : undefined
    const endY = anchor ? anchor.y : src.y
    const endH = anchor ? anchor.h : src.h
    nodes.set(id, {
      ...src,
      y: lerp(src.y, endY, t),
      h: lerp(src.h, endH, t),
      opacity: lerp(src.opacity, 0, t),
    })
  }

  const links = new Map<string, FrameLink>()
  for (const [id, target] of to.links) {
    const src = from.links.get(id)
    if (src) {
      links.set(id, {
        ...target,
        y1: lerp(src.y1, target.y1, t),
        y2: lerp(src.y2, target.y2, t),
        height: lerp(src.height, target.height, t),
        opacity: lerp(src.opacity, 1, t),
      })
      continue
    }
    links.set(id, { ...target, opacity: lerp(0, 1, t) })
  }
  for (const [id, src] of from.links) {
    if (to.links.has(id)) continue
    links.set(id, { ...src, opacity: lerp(src.opacity, 0, t) })
  }

  return { nodes, links, height: lerp(from.height, to.height, t) }
}

/**
 * 把目标几何平滑过渡成当前帧。
 * - animate=false / 无 rAF：直接返回目标，零动画（测试与 reduced-motion 走这条）。
 * - 动画中再次改变目标：从当前帧续接，支持连点。
 */
export function useAnimatedSankeyFrame(target: SankeyFrame | null, animate: boolean): SankeyFrame | null {
  const [frame, setFrame] = useState<SankeyFrame | null>(target)
  const frameRef = useRef<SankeyFrame | null>(frame)
  const apply = useCallback((next: SankeyFrame | null) => {
    frameRef.current = next
    setFrame(next)
  }, [])

  useLayoutEffect(() => {
    if (!target || !animate || typeof requestAnimationFrame === 'undefined') {
      apply(target)
      return
    }
    const from = frameRef.current
    if (!from || sameFrame(from, target)) {
      apply(target)
      return
    }
    // 先同步落地首帧（t=0），避免布局先跳到终态再被 rAF 拽回来的闪烁。
    apply(interpolateSankeyFrame(from, target, 0))
    let raf = 0
    let start = 0
    const tick = (now: number) => {
      const progress = frameProgress(now, start)
      start = progress.start
      if (progress.t >= 1) {
        // 关键：末帧直接落到纯净 target，清掉动画期保留的 opacity=0 退出元素。
        // 否则它们残留在 frame 中，下一轮变成「共有元素」被设回 opacity=1 而闪现
        // （表现为第一次动画正确、后续都错）。
        apply(target)
        return
      }
      apply(interpolateSankeyFrame(from, target, easeInOutCubic(progress.t)))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, animate, apply])

  return frame
}
