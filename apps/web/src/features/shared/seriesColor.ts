/**
 * 图表与账户圆点的稳定取色。
 *
 * 颜色只由实体身份决定：身份键做 FNV-1a 哈希取首选槽位，再在同一张图内
 * 按身份字典序做一次线性探查消解碰撞。金额排名与数组下标不参与取色，
 * 因此同一实体在排序变化、跨页面时保持同一颜色。
 *
 * 两个色板都来自 hf-theme.ts 的既有 token，不在组件里写死色值：
 * - SERIES_COLORS：图表填充（环形 / 构成条 / 桑基），10 槽；
 * - CATEGORY_COLORS：分类图标与账户圆点，6 槽。
 */

export const SERIES_COLORS = [
  'var(--mb-chart-series-1)',
  'var(--mb-chart-series-2)',
  'var(--mb-chart-series-3)',
  'var(--mb-chart-series-4)',
  'var(--mb-chart-series-5)',
  'var(--mb-chart-series-6)',
  'var(--mb-chart-series-7)',
  'var(--mb-chart-series-8)',
  'var(--mb-chart-series-9)',
  'var(--mb-chart-series-10)',
] as const

export const CATEGORY_COLORS = [
  'var(--mb-color-cat-1)',
  'var(--mb-color-cat-2)',
  'var(--mb-color-cat-3)',
  'var(--mb-color-cat-4)',
  'var(--mb-color-cat-5)',
  'var(--mb-color-cat-6)',
] as const

/** FNV-1a 32 位；只用于稳定分槽，不追求密码学强度。 */
function hashOf(key: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * 身份键 → 色板槽位。同一张图内按「首选槽位 + 身份优先级 + 字典序」处理，
 * 碰撞时向后线性探查；槽位耗尽（实体数 > 色板数）时按次哈希回绕，
 * 不新增颜色。排序键全部来自身份，传入顺序（金额排名）不参与，
 * 所以乱序不改变结果；只有撞到同一首选槽的实体才可能被顺延。
 */
export function stableSlotMap(
  identities: readonly string[],
  slotCount: number,
): Map<string, number> {
  const keys = [...new Set(identities.filter((identity) => identity.length > 0))]
  const preferred = new Map(keys.map((key) => [key, hashOf(key) % slotCount]))
  // 次哈希只用于同槽时决定谁保留首选槽，避免用名称字典序偏好某些分类。
  const priority = new Map(keys.map((key) => [key, hashOf(`:${key}`)]))
  const ordered = [...keys].sort((left, right) => {
    const slotOfLeft = preferred.get(left) ?? 0
    const slotOfRight = preferred.get(right) ?? 0
    if (slotOfLeft !== slotOfRight) return slotOfLeft - slotOfRight
    const priorityOfLeft = priority.get(left) ?? 0
    const priorityOfRight = priority.get(right) ?? 0
    if (priorityOfLeft !== priorityOfRight) return priorityOfLeft - priorityOfRight
    return left < right ? -1 : left > right ? 1 : 0
  })

  const used = new Set<number>()
  const slots = new Map<string, number>()
  for (const key of ordered) {
    const start = preferred.get(key) ?? 0
    let slot = hashOf(`#${key}`) % slotCount
    for (let step = 0; step < slotCount; step += 1) {
      const candidate = (start + step) % slotCount
      if (!used.has(candidate)) {
        slot = candidate
        break
      }
    }
    used.add(slot)
    slots.set(key, slot)
  }
  return slots
}

/** 稳定的颜色映射：槽位 → 色板 token。 */
export function stableColorMap(
  identities: readonly string[],
  palette: readonly string[],
): Map<string, string> {
  const slots = stableSlotMap(identities, palette.length)
  return new Map([...slots].map(([key, slot]) => [key, palette[slot]]))
}
