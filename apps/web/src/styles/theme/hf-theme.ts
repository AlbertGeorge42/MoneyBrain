/**
 * HF 高保真预览的 Mantine 主题。
 * 色板与 docs/blueprint/ux/design-tokens.md §2.2 一致；语义色仍通过 --mb-* 注入业务 CSS。
 */
import { createTheme, type MantineColorsTuple } from '@mantine/core'

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
