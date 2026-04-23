/**
 * 阴影设计令牌
 * 用于 boxShadow 属性
 */

/** 轻微阴影 - 卡片默认 */
export const shadowSm = 'var(--mb-shadow-sm)'

/** 中等阴影 - 下拉面板、浮层 */
export const shadowMd = 'var(--mb-shadow-md)'

/** 大阴影 - 模态框、抽屉 */
export const shadowLg = 'var(--mb-shadow-lg)'

export const shadowVars = {
  shadowSm: '--mb-shadow-sm',
  shadowMd: '--mb-shadow-md',
  shadowLg: '--mb-shadow-lg',
} as const
