/**
 * 应用唯一主题来源（Mantine）
 *
 * 三件事集中在这里，避免出现多套并行的主题系统：
 * 1. Mantine 主题（色阶 / 字号 / 间距 / 圆角 / 阴影），供 Mantine 组件消费；
 * 2. `cssVariablesResolver`：把设计资产映射成业务 CSS 使用的 `--mb-*` 变量，
 *    按 Mantine 的 colorScheme（light / dark / auto）在 `:root` 上切换；
 * 3. 颜色方案持久化（沿用旧键 `moneybrain-theme-mode`，值改用 Mantine 的 light/dark/auto）。
 *
 * 色值来源：docs/blueprint/ux/design-tokens.md。图表序列色、分类色、进度条语义色
 * 是对比度实测过的设计资产，保留为本地常量（无法由 10 档色阶无损表达）。
 */
import {
  createTheme,
  localStorageColorSchemeManager,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from '@mantine/core'

const brand: MantineColorsTuple = [
  '#F5FCE8',
  '#E9F7CE',
  '#D5F0A6',
  '#C0E878',
  '#B0E352',
  '#A3E635',
  '#8FCF26',
  '#6BA414',
  '#356B0C',
  '#244A06',
]

const gray: MantineColorsTuple = [
  '#FFFFFF',
  '#F7F7F5',
  '#EFEFEC',
  '#E4E5E1',
  '#D5D7D2',
  '#B9BDB6',
  '#8D938C',
  '#6A7069',
  '#404540',
  '#14161A',
]

const dark: MantineColorsTuple = [
  '#F3F4F4',
  '#E4E6E6',
  '#C7CBCB',
  '#A5AAAB',
  '#83898A',
  '#1D2226',
  '#16191B',
  '#0D0F10',
  '#08090A',
  '#050607',
]

const danger: MantineColorsTuple = [
  '#FFF1EF',
  '#FFE0DD',
  '#FFC5C1',
  '#FF9E9A',
  '#F2555A',
  '#E5484D',
  '#B42318',
  '#7A1220',
  '#6C1019',
  '#4E0F0F',
]

export const hfTheme = createTheme({
  colors: { brand, gray, dark, danger },
  primaryColor: 'brand',
  primaryShade: { light: 5, dark: 5 },
  autoContrast: true,
  fontFamily: 'var(--mb-font-ui)',
  headings: {
    fontFamily: 'var(--mb-font-display)',
    fontWeight: '600',
  },
  fontSizes: {
    xs: 'var(--mb-fs-0)',
    sm: 'var(--mb-fs-1)',
    md: 'var(--mb-fs-2)',
    lg: 'var(--mb-fs-3)',
    xl: 'var(--mb-fs-4)',
  },
  lineHeights: {
    xs: 'var(--mb-lh-body)',
    sm: 'var(--mb-lh-body)',
    md: 'var(--mb-lh-body)',
    lg: 'var(--mb-lh-tight)',
    xl: 'var(--mb-lh-tight)',
  },
  spacing: {
    xs: 'var(--mb-s-1)',
    sm: 'var(--mb-s-2)',
    md: 'var(--mb-s-3)',
    lg: 'var(--mb-s-4)',
    xl: 'var(--mb-s-5)',
  },
  radius: {
    xs: 'var(--mb-radius-xs)',
    sm: 'var(--mb-radius-sm)',
    md: 'var(--mb-radius-md)',
    lg: 'var(--mb-radius-lg)',
    xl: 'var(--mb-radius-lg)',
  },
  shadows: {
    xs: 'var(--mb-sh-1)',
    sm: 'var(--mb-sh-1)',
    md: 'var(--mb-sh-2)',
    lg: 'var(--mb-sh-2)',
    xl: 'var(--mb-sh-3)',
  },
  defaultRadius: 'md',
  cursorType: 'pointer',
  focusRing: 'auto',
})

/** 沿用旧存储键，老用户的选择不会丢；值为 Mantine 的 light / dark / auto。 */
export const mbColorSchemeManager = localStorageColorSchemeManager({
  key: 'moneybrain-theme-mode',
})

type MbColorVars = Record<string, string>

const LIGHT_COLOR_VARS: MbColorVars = {
  /* ===== 表面 / 文本 / 边框 ===== */
  '--mb-color-surface': '#f6f6f4',
  '--mb-color-surface-sunken': '#ededea',
  '--mb-color-surface-raised': '#ffffff',
  '--mb-color-surface-hover': '#efefec',
  '--mb-color-surface-overlay': 'rgba(20, 22, 26, 0.45)',
  '--mb-color-text-primary': '#14161a',
  '--mb-color-text-secondary': '#565a60',
  '--mb-color-text-tertiary': '#63686e',
  '--mb-color-text-inverse': '#f7fbef',
  '--mb-color-border': '#dfe1dd',
  '--mb-color-border-strong': '#cbcec8',

  /* ===== 强调色 ===== */
  '--mb-color-accent': '#356b0c',
  '--mb-color-accent-fill': '#a3e635',
  '--mb-color-on-accent-fill': '#0d1005',
  '--mb-color-accent-fill-hover': '#93d12a',
  '--mb-color-accent-fill-pressed': '#84be1f',
  '--mb-color-accent-soft': '#e4f0d7',
  '--mb-color-focus': '#356b0c',
  '--mb-color-skeleton': '#e7e8e3',

  /* ===== 财务语义色 ===== */
  '--mb-color-income': '#1b7a48',
  '--mb-color-income-bg': '#e7f3eb',
  '--mb-color-expense': '#a64d56',
  '--mb-color-expense-display': '#b65b62',
  '--mb-color-expense-bg': '#f9e7e3',
  '--mb-color-transfer': '#1d6d8e',
  '--mb-color-transfer-bg': '#e5f0f4',
  '--mb-color-danger-solid': '#6c1019',
  '--mb-color-danger-bg': '#fae8e6',
  '--mb-color-on-danger': '#ffe9e7',
  '--mb-color-warning': '#8a5a00',

  /* 进度条填充专属：只用于条面，不参与文字色；对卡片底 ≥4.0、
     对轨道 ≥1.6 明度比且 ΔE00 ≥20（实测见 design-tokens §2.7）。
     绿只表示「良好」：支出仍在计划内、收入已达成；收入进行中用中性钢色。 */
  '--mb-progress-normal': '#2e8a57',
  '--mb-progress-neutral': '#425b70',
  '--mb-progress-warning': '#c26600',
  '--mb-progress-over': '#ca4d40',
  '--mb-progress-track': '#a4a8a2',
  /* 超支宽度由组件内联覆盖；这里的默认值只给 CSS 变量守卫与兜底。 */
  '--mb-fill-width': '0%',
  '--mb-over-min': 'calc(76.9231% + 8px)',

  /* ===== 分类图标 / 图表序列（设计资产） ===== */
  '--mb-color-cat-1': '#3f7d0f',
  '--mb-color-cat-2': '#0f7d6a',
  '--mb-color-cat-3': '#1b6fa8',
  '--mb-color-cat-4': '#6d4fd6',
  '--mb-color-cat-5': '#c25383',
  '--mb-color-cat-6': '#b07a0b',
  /* 图表序列色只用于图表填充（环形 / 堆叠条 / 桑基），不用于分类图标；
     相邻槽按色盲 ΔE 排序，同一张图最多 7 个有色项，第 8 类并入「其余 N 类」。 */
  '--mb-chart-series-1': '#1b6fa8',
  '--mb-chart-series-2': '#c25e00',
  '--mb-chart-series-3': '#0c7a80',
  '--mb-chart-series-4': '#6b4fd1',
  '--mb-chart-series-5': '#8a7a0a',
  '--mb-chart-series-6': '#c24a8a',
  '--mb-chart-series-7': '#8c9188',
  /* 二级环（子分类）在父色相上做明度阶梯：浅色只向深调，整段区间不含 100%，
     任何子级都不等于父色（父色只作锚点），相邻子级跨 7 槽实测 ΔE00 ≥ 3.0、对白卡 ≥ 3.8。 */
  '--mb-chart-sub-from': '90%',
  '--mb-chart-sub-to': '40%',
  '--mb-chart-sub-tint': '#14161a',
  '--mb-color-chart-axis': '#63686e',
  '--mb-color-chart-grid': '#e3e5e0',
  '--mb-color-chart-tooltip-bg': '#14161a',
  '--mb-color-chart-tooltip-ink': '#f3f4f0',
  '--mb-color-chart-annot-pos': '#1b7a48',
  '--mb-color-chart-annot-neg': '#a64d56',

  /* 主卡随主题切换层级：浅色 = surface-raised 卡片（不常驻深底），靠尺寸与排版做焦点。
     涨跌色直接取文字档语义色，保证 12px chip 在白底 ≥ 4.5:1。 */
  '--mb-color-hero-bg': 'var(--mb-color-surface-raised)',
  '--mb-color-hero-ink': 'var(--mb-color-text-primary)',
  '--mb-color-hero-muted': 'var(--mb-color-text-secondary)',
  '--mb-color-hero-line': 'var(--mb-color-border)',
  '--mb-color-hero-pos': 'var(--mb-color-income)',
  '--mb-color-hero-neg': 'var(--mb-color-expense)',

  /* ===== 阴影 ===== */
  '--mb-sh-1': '0 1px 2px rgba(20, 22, 26, 0.05), 0 8px 24px rgba(20, 22, 26, 0.06)',
  '--mb-sh-2': '0 2px 6px rgba(20, 22, 26, 0.07), 0 16px 40px rgba(20, 22, 26, 0.09)',
  '--mb-sh-3': '0 4px 12px rgba(20, 22, 26, 0.09), 0 32px 64px rgba(20, 22, 26, 0.12)',
}

const DARK_COLOR_VARS: MbColorVars = {
  /* ===== 表面 / 文本 / 边框 ===== */
  '--mb-color-surface': '#0d0f10',
  '--mb-color-surface-sunken': '#08090a',
  '--mb-color-surface-raised': '#16191b',
  '--mb-color-surface-hover': '#1d2226',
  '--mb-color-surface-overlay': 'rgba(0, 0, 0, 0.65)',
  '--mb-color-text-primary': '#eceeef',
  '--mb-color-text-secondary': '#9ca3a8',
  '--mb-color-text-tertiary': '#7f878d',
  '--mb-color-text-inverse': '#14161a',
  '--mb-color-border': '#242a2e',
  '--mb-color-border-strong': '#333a3f',

  /* ===== 强调色 ===== */
  '--mb-color-accent': '#a3e635',
  '--mb-color-accent-fill': '#a3e635',
  '--mb-color-on-accent-fill': '#0d1005',
  '--mb-color-accent-fill-hover': '#b0e352',
  '--mb-color-accent-fill-pressed': '#93d12a',
  '--mb-color-accent-soft': '#1c2611',
  '--mb-color-focus': '#a3e635',
  '--mb-color-skeleton': '#1a1e20',

  /* ===== 财务语义色 ===== */
  '--mb-color-income': '#4ade80',
  '--mb-color-income-bg': '#0f2417',
  '--mb-color-expense': '#f0a4ab',
  '--mb-color-expense-display': '#f0a4ab',
  '--mb-color-expense-bg': '#2a1615',
  '--mb-color-transfer': '#4c9fc4',
  '--mb-color-transfer-bg': '#13252d',
  '--mb-color-danger-solid': '#6c1019',
  '--mb-color-danger-bg': '#241114',
  '--mb-color-on-danger': '#ffe9e7',
  '--mb-color-warning': '#e5b54a',

  /* 暗色提亮但保留彩度（不是浅色反相），口径同浅色 */
  '--mb-progress-normal': '#3fa572',
  '--mb-progress-neutral': '#8ea8bf',
  '--mb-progress-warning': '#c9822f',
  '--mb-progress-over': '#c9615f',
  '--mb-progress-track': '#4a5257',

  /* ===== 分类图标 / 图表序列（设计资产） ===== */
  '--mb-color-cat-1': '#a3e635',
  '--mb-color-cat-2': '#4cc9e8',
  '--mb-color-cat-3': '#a78bfa',
  '--mb-color-cat-4': '#d9a21b',
  '--mb-color-cat-5': '#34d399',
  '--mb-color-cat-6': '#ff7ab6',
  /* 图表序列色：暗色另调一套（沿用浅色档会失去对暗底对比），规则同浅色。 */
  '--mb-chart-series-1': '#6fa8dc',
  '--mb-chart-series-2': '#e08a3c',
  '--mb-chart-series-3': '#45c9c0',
  '--mb-chart-series-4': '#a78bfa',
  '--mb-chart-series-5': '#d6c24a',
  '--mb-chart-series-6': '#e86fb2',
  '--mb-chart-series-7': '#8a9196',
  /* 二级环：暗色只向浅调，整段区间不含 100%，子级全部比父色浅且互不相同；
     相邻子级跨 7 槽实测 ΔE00 ≥ 2.24（最差为亮青 #45C9C0），对暗卡 ≥ 6.9，对比度只增不减。 */
  '--mb-chart-sub-from': '84%',
  '--mb-chart-sub-to': '32%',
  '--mb-chart-sub-tint': '#ffffff',
  '--mb-color-chart-axis': '#7f878d',
  '--mb-color-chart-grid': '#242a2e',
  '--mb-color-chart-tooltip-bg': '#16191b',
  '--mb-color-chart-tooltip-ink': '#eceeef',
  '--mb-color-chart-annot-pos': '#4ade80',
  '--mb-color-chart-annot-neg': '#f0a4ab',

  /* 暗色主卡比普通卡片高一档（raised #16191B → #1D2226），靠底色与 1px 高光边分层 */
  '--mb-color-hero-bg': '#1d2226',
  '--mb-color-hero-ink': '#eceeef',
  '--mb-color-hero-muted': '#9ca3a8',
  '--mb-color-hero-line': 'rgba(255, 255, 255, 0.16)',
  /* 涨跌色取文字档语义色；暗色两者均已提亮，小字 chip 也 ≥ 4.5:1 */
  '--mb-color-hero-pos': 'var(--mb-color-income)',
  '--mb-color-hero-neg': 'var(--mb-color-expense-display)',

  /* ===== 阴影 — 深色：顶亮线 + 大黑晕 ===== */
  '--mb-sh-1': '0 1px 0 rgba(255, 255, 255, 0.03), 0 10px 28px rgba(0, 0, 0, 0.45)',
  '--mb-sh-2': '0 2px 0 rgba(255, 255, 255, 0.04), 0 20px 46px rgba(0, 0, 0, 0.55)',
  '--mb-sh-3': '0 8px 20px rgba(0, 0, 0, 0.55), 0 40px 80px rgba(0, 0, 0, 0.6)',
}

/**
 * `--mb-*` 颜色 / 阴影清单（纯函数）。
 * Mantine 的 `cssVariablesResolver` 与 CSS 变量守卫（tests/unit/css-vars-guard.test.ts）共用，
 * 避免「CSS 里引用了但没人定义」的静默回退。
 */
export function buildMbColorVars(isDark: boolean): MbColorVars {
  return isDark ? DARK_COLOR_VARS : LIGHT_COLOR_VARS
}

export function buildMbColorVarNames(isDark = false): string[] {
  return Object.keys(buildMbColorVars(isDark))
}

export const mbCssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: buildMbColorVars(false),
  dark: buildMbColorVars(true),
})
