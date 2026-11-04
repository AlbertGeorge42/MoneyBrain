/**
 * HF 高保真主题 token（design-tokens.md 的唯一代码收口处）。
 * 42 个语义色 × 2 scheme；色值字面量只允许出现在本文件与 theme.css 的结构 token 中。
 */

import { createTheme, type MantineThemeOverride } from '@mantine/core'

export type ColorScheme = 'light' | 'dark'

type TokenPair = { light: string; dark: string }

/** 42 个 --mb-color-* 语义色，顺序与 design-tokens.md §2.1 一致。 */
export const COLOR_TOKENS = {
  surface: { light: '#F6F6F4', dark: '#0D0F10' },
  'surface-sunken': { light: '#EDEDEA', dark: '#08090A' },
  'surface-raised': { light: '#FFFFFF', dark: '#16191B' },
  'surface-hover': { light: '#EFEFEC', dark: '#1D2226' },
  'surface-overlay': { light: 'rgba(20,22,26,.45)', dark: 'rgba(0,0,0,.65)' },
  'text-primary': { light: '#14161A', dark: '#ECEEEF' },
  'text-secondary': { light: '#565A60', dark: '#9CA3A8' },
  'text-tertiary': { light: '#63686E', dark: '#7F878D' },
  'text-inverse': { light: '#F7FBEF', dark: '#14161A' },
  border: { light: '#DFE1DD', dark: '#242A2E' },
  'border-strong': { light: '#CBCEC8', dark: '#333A3F' },
  accent: { light: '#356B0C', dark: '#A3E635' },
  'accent-fill': { light: '#A3E635', dark: '#A3E635' },
  'on-accent-fill': { light: '#0D1005', dark: '#0D1005' },
  'accent-fill-hover': { light: '#93D12A', dark: '#B0E352' },
  'accent-fill-pressed': { light: '#84BE1F', dark: '#93D12A' },
  'accent-soft': { light: '#E4F0D7', dark: '#1C2611' },
  focus: { light: '#356B0C', dark: '#A3E635' },
  skeleton: { light: '#E7E8E3', dark: '#1A1E20' },
  income: { light: '#1B7A48', dark: '#4ADE80' },
  'income-bg': { light: '#E7F3EB', dark: '#0F2417' },
  expense: { light: '#A64D56', dark: '#F0A4AB' },
  'expense-display': { light: '#B65B62', dark: '#F0A4AB' },
  'expense-bg': { light: '#F9E7E3', dark: '#2A1615' },
  transfer: { light: '#1D6D8E', dark: '#4C9FC4' },
  'transfer-bg': { light: '#E5F0F4', dark: '#13252D' },
  danger: { light: '#7A1220', dark: '#E5484D' },
  'danger-solid': { light: '#6C1019', dark: '#6C1019' },
  'danger-bg': { light: '#FAE8E6', dark: '#241114' },
  'on-danger': { light: '#FFE9E7', dark: '#FFE9E7' },
  'cat-1': { light: '#3F7D0F', dark: '#A3E635' },
  'cat-2': { light: '#0F7D6A', dark: '#4CC9E8' },
  'cat-3': { light: '#1B6FA8', dark: '#A78BFA' },
  'cat-4': { light: '#6D4FD6', dark: '#D9A21B' },
  'cat-5': { light: '#C25383', dark: '#34D399' },
  'cat-6': { light: '#B07A0B', dark: '#FF7AB6' },
  'chart-axis': { light: '#63686E', dark: '#7F878D' },
  'chart-grid': { light: '#E3E5E0', dark: '#242A2E' },
  'chart-tooltip-bg': { light: '#14161A', dark: '#16191B' },
  'chart-tooltip-ink': { light: '#F3F4F0', dark: '#ECEEEF' },
  'chart-annot-pos': { light: '#1B7A48', dark: '#4ADE80' },
  'chart-annot-neg': { light: '#A64D56', dark: '#F0A4AB' },
} as const satisfies Record<string, TokenPair>

export const COLOR_TOKEN_NAMES = Object.keys(COLOR_TOKENS) as Array<keyof typeof COLOR_TOKENS>

const SHADOWS = {
  'sh-1': {
    light: '0 1px 2px rgba(20,22,26,.05), 0 8px 24px rgba(20,22,26,.06)',
    dark: '0 1px 0 rgba(255,255,255,.03), 0 10px 28px rgba(0,0,0,.45)',
  },
  'sh-2': {
    light: '0 2px 6px rgba(20,22,26,.07), 0 16px 40px rgba(20,22,26,.09)',
    dark: '0 2px 0 rgba(255,255,255,.04), 0 20px 46px rgba(0,0,0,.55)',
  },
  'sh-3': {
    light: '0 4px 12px rgba(20,22,26,.09), 0 32px 64px rgba(20,22,26,.12)',
    dark: '0 8px 20px rgba(0,0,0,.55), 0 40px 80px rgba(0,0,0,.6)',
  },
} as const

const MANTINE_COLORS = {
  gray: ['#FFFFFF', '#F7F7F5', '#EFEFEC', '#E4E5E1', '#D5D7D2', '#B9BDB6', '#8D938C', '#6A7069', '#404540', '#14161A'],
  dark: ['#F3F4F4', '#E4E6E6', '#C7CBCB', '#A5AAAB', '#83898A', '#1D2226', '#16191B', '#0D0F10', '#08090A', '#050607'],
  brand: ['#F5FCE8', '#E9F7CE', '#D5F0A6', '#C0E878', '#B0E352', '#A3E635', '#8FCF26', '#6BA414', '#356B0C', '#244A06'],
  danger: ['#FFF1EF', '#FFE0DD', '#FFC5C1', '#FF9E9A', '#F2555A', '#E5484D', '#B42318', '#7A1220', '#6C1019', '#4E0F0F'],
} as const

const RADIUS = {
  xs: '6px',
  sm: '10px',
  md: '14px',
  lg: '20px',
  xl: '20px',
} as const

const FONTS = {
  ui: '"Inter","PingFang SC","Microsoft YaHei",system-ui,sans-serif',
  display: '"Inter","PingFang SC","Microsoft YaHei",system-ui,sans-serif',
  num: '"JetBrains Mono","Cascadia Mono",Consolas,ui-monospace,monospace',
}

/** 42 个语义色 + 3 档阴影，输出给 CSS 变量注入与主题消费者。 */
export function buildCssVars(scheme: ColorScheme): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const name of COLOR_TOKEN_NAMES) {
    vars[`--mb-color-${name}`] = COLOR_TOKENS[name][scheme]
  }
  for (const [name, values] of Object.entries(SHADOWS)) {
    vars[`--mb-${name}`] = values[scheme]
  }
  return vars
}

function serializeVars(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([key, value]) => `${key}:${value};`)
    .join('')
}

/** 两套 scheme 的 CSS 变量块；由 ThemeRoot 以单一 <style> 注入。 */
export function buildThemeCss(): string {
  return ['body[data-hf-scheme="light"]{color-scheme:light;' + serializeVars(buildCssVars('light')) + '}', 'body[data-hf-scheme="dark"]{color-scheme:dark;' + serializeVars(buildCssVars('dark')) + '}'].join('\n')
}

export function buildMantineTheme(scheme: ColorScheme): MantineThemeOverride {
  return createTheme({
    colors: {
      gray: [...MANTINE_COLORS.gray],
      dark: [...MANTINE_COLORS.dark],
      brand: [...MANTINE_COLORS.brand],
      danger: [...MANTINE_COLORS.danger],
    },
    primaryColor: 'brand',
    primaryShade: { light: 5, dark: 5 },
    white: '#FFFFFF',
    black: COLOR_TOKENS['text-primary'].light,
    defaultRadius: 'md',
    radius: RADIUS,
    fontFamily: FONTS.ui,
    fontFamilyMonospace: FONTS.num,
    headings: { fontFamily: FONTS.display, fontWeight: '600' },
    other: {
      scheme,
      tokens: buildCssVars(scheme),
      chart: getChartTokens(scheme),
    },
    components: {
      Button: { defaultProps: { color: 'brand', autoContrast: true } },
      TextInput: { defaultProps: { radius: 'xs' } },
      NumberInput: { defaultProps: { radius: 'xs' } },
      Select: { defaultProps: { radius: 'xs' } },
      DatePickerInput: { defaultProps: { radius: 'xs' } },
      Checkbox: { defaultProps: { radius: 'xs' } },
      Modal: { defaultProps: { radius: 'lg' } },
      Drawer: { defaultProps: { radius: 'lg' } },
    },
  })
}

export type ChartTokens = {
  axis: string
  grid: string
  tooltipBg: string
  tooltipInk: string
  positive: string
  negative: string
  income: string
  expense: string
  transfer: string
  series: string[]
}

/** 图表配置只从这里取色；业务侧不写 hex。 */
export function getChartTokens(scheme: ColorScheme): ChartTokens {
  return {
    axis: COLOR_TOKENS['chart-axis'][scheme],
    grid: COLOR_TOKENS['chart-grid'][scheme],
    tooltipBg: COLOR_TOKENS['chart-tooltip-bg'][scheme],
    tooltipInk: COLOR_TOKENS['chart-tooltip-ink'][scheme],
    positive: COLOR_TOKENS['chart-annot-pos'][scheme],
    negative: COLOR_TOKENS['chart-annot-neg'][scheme],
    income: COLOR_TOKENS.income[scheme],
    expense: COLOR_TOKENS.expense[scheme],
    transfer: COLOR_TOKENS.transfer[scheme],
    series: [1, 2, 3, 4, 5, 6].map((index) => COLOR_TOKENS[`cat-${index}` as keyof typeof COLOR_TOKENS][scheme]),
  }
}
