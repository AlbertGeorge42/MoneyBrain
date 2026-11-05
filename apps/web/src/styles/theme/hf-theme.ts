/**
 * HF 高保真预览的 Mantine 主题。
 * 色板与 docs/blueprint/ux/design-tokens.md §2.2 一致；语义色仍通过 --mb-* 注入业务 CSS。
 */
import { createTheme, type MantineColorsTuple } from '@mantine/core'

const brand: MantineColorsTuple = [
  '#F5FCE8',
  '#E7F7C8',
  '#D2F0A3',
  '#BCE87E',
  '#A3E635',
  '#93D12A',
  '#84BE1F',
  '#6FA417',
  '#356B0C',
  '#244A08',
]

const gray: MantineColorsTuple = [
  '#F6F6F4',
  '#EDEDEA',
  '#DFE1DD',
  '#CBCEC8',
  '#B9BDB6',
  '#9CA3A8',
  '#63686E',
  '#565A60',
  '#2A2E33',
  '#14161A',
]

const dark: MantineColorsTuple = [
  '#ECEEEF',
  '#D5D7D2',
  '#9CA3A8',
  '#7F878D',
  '#3A4247',
  '#333A3F',
  '#242A2E',
  '#16191B',
  '#0D0F10',
  '#08090A',
]

const danger: MantineColorsTuple = [
  '#FFE9E7',
  '#FAE8E6',
  '#F5D1CE',
  '#F0A4AB',
  '#E5484D',
  '#C9363F',
  '#A64D56',
  '#7A1220',
  '#6C1019',
  '#4A0A11',
]

export const hfTheme = createTheme({
  colors: { brand, gray, dark, danger },
  primaryColor: 'brand',
  primaryShade: { light: 4, dark: 4 },
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
