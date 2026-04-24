/**
 * 设计令牌统一导出
 * 所有视觉属性的集中入口
 */

export * from './colors'
export * from './spacing'
export * from './typography'
export * from './borders'
export * from './shadows'
export * from './radius'

// 令牌变量名集合，用于主题生成器
import { colorVars } from './colors'
import { spacingVars } from './spacing'
import { typographyVars } from './typography'
import { borderVars } from './borders'
import { shadowVars } from './shadows'
import { radiusVars } from './radius'

export const allTokenVars = {
  ...colorVars,
  ...spacingVars,
  ...typographyVars,
  ...borderVars,
  ...shadowVars,
  ...radiusVars,
} as const

export type TokenVarName = keyof typeof allTokenVars
