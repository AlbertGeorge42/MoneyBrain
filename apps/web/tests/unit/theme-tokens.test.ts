/**
 * HF 主题 token 契约：design-tokens.md 规定的 42 个语义色 × 2 scheme。
 * 色板必须完整、两套 scheme 键名一致，避免高保真页面取到未定义变量。
 */
import { describe, it, expect } from 'vitest'
import {
  COLOR_TOKENS,
  COLOR_TOKEN_NAMES,
  buildCssVars,
  buildMantineTheme,
  getChartTokens,
} from '../../src/styles/theme/tokens'

describe('HF 主题 token', () => {
  it('42 个语义色，light / dark 都有值', () => {
    expect(COLOR_TOKEN_NAMES).toHaveLength(42)
    for (const name of COLOR_TOKEN_NAMES) {
      expect(COLOR_TOKENS[name].light, `${name} light`).toBeTruthy()
      expect(COLOR_TOKENS[name].dark, `${name} dark`).toBeTruthy()
    }
  })

  it('两套 scheme 的 CSS 变量键名一致（42 色 + 3 档阴影）', () => {
    const light = buildCssVars('light')
    const dark = buildCssVars('dark')
    expect(Object.keys(light)).toHaveLength(45)
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort())
    for (const [key, value] of Object.entries(light)) {
      expect(value, `${key} light`).toBeTruthy()
    }
    for (const [key, value] of Object.entries(dark)) {
      expect(value, `${key} dark`).toBeTruthy()
    }
  })

  it('buildMantineTheme 使用品牌色与两套主色阶索引', () => {
    expect(() => buildMantineTheme('light')).not.toThrow()
    const theme = buildMantineTheme('light')
    expect(theme.primaryColor).toBe('brand')
    expect(theme.primaryShade).toEqual({ light: 5, dark: 5 })
    expect(theme.colors?.brand).toHaveLength(10)
    expect(theme.colors?.danger).toHaveLength(10)
  })

  it('getChartTokens 的系列色为 6 个分类色，并随 scheme 切换', () => {
    const light = getChartTokens('light')
    const dark = getChartTokens('dark')
    expect(light.series).toHaveLength(6)
    expect(light.income).toBe(COLOR_TOKENS.income.light)
    expect(dark.income).toBe(COLOR_TOKENS.income.dark)
    expect(light).not.toEqual(dark)
  })
})
