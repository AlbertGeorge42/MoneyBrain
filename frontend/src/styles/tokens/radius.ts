/**
 * 圆角设计令牌
 * 用于 borderRadius 属性
 */

/** 小圆角 4px - 标签 */
export const radiusSm = 'var(--mb-radius-sm)'

/** 中圆角 6px - 按钮、输入框 */
export const radiusMd = 'var(--mb-radius-md)'

/** 大圆角 8px - 卡片、面板 */
export const radiusLg = 'var(--mb-radius-lg)'

/** 超大圆角 12px - 大卡片、模态框 */
export const radiusXl = 'var(--mb-radius-xl)'

export const radiusVars = {
  radiusSm: '--mb-radius-sm',
  radiusMd: '--mb-radius-md',
  radiusLg: '--mb-radius-lg',
  radiusXl: '--mb-radius-xl',
} as const
