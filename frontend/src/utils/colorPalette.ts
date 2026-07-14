/**
 * 颜色调色板工具
 * 基于 @ant-design/colors generate()，根据当前主题（明/暗）返回匹配背景/前景。
 *
 * 注意：generate() 只识别 11 个英文色名（red/orange/gold/yellow/lime/green/cyan/blue/purple/magenta/pink），
 * volcano 和 geekblue 必须用 hex seed 才能正确生成色板（否则返回灰阶）。
 */

import { generate } from '@ant-design/colors'

// Ant Design 13 个官方色（preset colors）— 按色相顺序排列
export const ANTD_PRESET_COLORS = [
  'red',
  'volcano',
  'orange',
  'gold',
  'yellow',
  'lime',
  'green',
  'cyan',
  'blue',
  'geekblue',
  'purple',
  'magenta',
  'pink',
] as const

export type AntDPresetColor = (typeof ANTD_PRESET_COLORS)[number]

// 13 个色名对应的 hex seed（AntD 内部 Tag preset 使用的实际值）
const PRESET_SEEDS: Record<AntDPresetColor, string> = {
  red: '#f5222d',
  volcano: '#fa541c',
  orange: '#fa8c16',
  gold: '#faad14',
  yellow: '#fadb14',
  lime: '#a0d911',
  green: '#52c41a',
  cyan: '#13c2c2',
  blue: '#1890ff',
  geekblue: '#2f54eb',
  purple: '#722ed1',
  magenta: '#eb2f96',
  pink: '#eb2f96',
}

export function isAntDPresetColor(value: string | null | undefined): value is AntDPresetColor {
  if (!value) return false
  return (ANTD_PRESET_COLORS as readonly string[]).includes(value)
}

export interface ColorTokens {
  /** 背景色（实心色块：浅色下深、深色下亮） */
  bg: string
  /** 前景色（图标：浅色下淡、深色下深） */
  fg: string
}

/**
 * 根据色名（AntD 官方色）和当前主题返回 { 背景, 前景 } 颜色对。
 * 浅色/深色主题下 fg/bg 互换，保证每个主题下"默认"与"非默认"图标视觉一致：
 * - 浅色：bg = palette[7]（深色块）+ fg = palette[1]（淡色图标）— 实心色块风格
 * - 深色：bg = palette[1]（深色淡块）+ fg = palette[7]（亮色图标）— 淡色色块风格
 * 两种风格都保持 ≥7:1 高对比，适合 32×32 小图标容器。
 */
export function getColorTokens(name: string, isDark: boolean): ColorTokens | null {
  if (!isAntDPresetColor(name)) return null
  const palette = generate(PRESET_SEEDS[name], isDark ? { theme: 'dark' } : { theme: 'default' })
  return isDark
    ? { bg: palette[1], fg: palette[7] }
    : { bg: palette[7], fg: palette[1] }
}

/**
 * 默认（无颜色）状态的图标色对。
 * 与 getColorTokens 保持相同的"浅色=bold / 深色=pale"策略：
 * - 浅色：实心深灰块 + 白色图标（与彩色块视觉一致）
 * - 深色：淡灰底 + 亮色图标（与彩色淡块视觉一致）
 */
export function getNeutralTokens(isDark: boolean): { bg: string; fg: string } {
  return isDark
    ? { bg: 'var(--mb-color-bg-neutral-pale)', fg: 'var(--mb-color-fg-neutral-pale)' }
    : { bg: 'var(--mb-color-bg-neutral-bold)', fg: 'var(--mb-color-fg-neutral-bold)' }
}

/**
 * 统一入口：默认 / 非默认图标色对都走这一条路径。
 * 有 color → getColorTokens 派生色板；无 color → getNeutralTokens 走 CSS 变量。
 */
export function getIconColorTokens(
  color: string | null | undefined,
  isDark: boolean
): { bg: string; fg: string } {
  if (color && isAntDPresetColor(color)) {
    return getColorTokens(color, isDark)!
  }
  return getNeutralTokens(isDark)
}
