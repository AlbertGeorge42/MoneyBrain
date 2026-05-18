import type { ThemeConfig } from 'antd'

export function getComponentTokens(): ThemeConfig['components'] {
  return {
    Button: {
      borderRadius: 8,
      paddingInline: 16,
      paddingInlineSM: 12,
      paddingInlineLG: 20,
      fontWeight: 500,
    },
    Input: {
      borderRadius: 6,
    },
    Select: {
      borderRadius: 6,
    },
    DatePicker: {
      borderRadius: 6,
    },
    Card: {
      paddingLG: 16,
      headerBg: 'transparent',
      borderRadiusLG: 8,
    },
    Menu: {
      itemBorderRadius: 14,
      itemMarginInline: 12,
      itemMarginBlock: 4,
    },
    Table: {
      headerBg: 'transparent',
    },
    Modal: {
      borderRadiusLG: 12,
    },
    Tag: {
      borderRadiusSM: 999,
      borderRadius: 999,
    },
    Segmented: {
      borderRadius: 8,
    },
  }
}