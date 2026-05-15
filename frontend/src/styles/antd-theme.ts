import type { ThemeConfig } from 'antd'

function colorToken(name: string): string {
  return `var(${name})`
}

const baseTheme: ThemeConfig['token'] = {
  fontFamily: '"Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif',
  fontSize: 14,
  fontSizeSM: 12,
  fontSizeLG: 16,
  borderRadius: 8,
  borderRadiusSM: 6,
  borderRadiusLG: 12,
  paddingXS: 8,
  paddingSM: 12,
  padding: 16,
  paddingMD: 20,
  paddingLG: 24,
  paddingXL: 32,
  controlHeight: 44,
  controlHeightSM: 36,
  controlHeightLG: 52,
}

export function getAntdTheme(_isDark: boolean): ThemeConfig {
  return {
    token: {
      ...baseTheme,
      colorPrimary: colorToken('--mb-color-action-primary'),
      colorBgContainer: colorToken('--mb-color-bg-surface'),
      colorBgElevated: colorToken('--mb-color-bg-elevated'),
      colorBgLayout: colorToken('--mb-color-bg-app'),
      colorText: colorToken('--mb-color-text-primary'),
      colorTextSecondary: colorToken('--mb-color-text-secondary'),
      colorTextTertiary: colorToken('--mb-color-text-muted'),
      colorTextQuaternary: colorToken('--mb-color-text-muted'),
      colorBorder: colorToken('--mb-color-border-subtle'),
      colorBorderSecondary: colorToken('--mb-color-border-subtle'),
      colorFill: colorToken('--mb-color-bg-app'),
      colorFillSecondary: colorToken('--mb-color-bg-app'),
      colorFillTertiary: colorToken('--mb-color-bg-app'),
      colorFillQuaternary: colorToken('--mb-color-bg-app'),
      colorError: colorToken('--mb-color-danger'),
      colorWarning: colorToken('--mb-color-warning'),
      colorSuccess: colorToken('--mb-color-success'),
      colorInfo: colorToken('--mb-color-info'),
    },
    components: {
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
      Layout: {
        siderBg: colorToken('--mb-color-bg-surface'),
      },
      Menu: {
        itemBorderRadius: 14,
        itemMarginInline: 12,
        itemMarginBlock: 4,
      },
      Table: {
        headerBg: 'transparent',
        headerSplitColor: colorToken('--mb-color-border-subtle'),
        headerColor: colorToken('--mb-color-text-secondary'),
      },
      Modal: {
        borderRadiusLG: 12,
      },
      Tag: {
        borderRadiusSM: 999,
        borderRadius: 999,
      },
      Radio: {
        buttonBg: colorToken('--mb-color-bg-surface'),
        buttonCheckedBg: colorToken('--mb-color-bg-selected'),
        buttonColor: colorToken('--mb-color-text-primary'),
        buttonSolidCheckedColor: colorToken('--mb-color-on-action-primary'),
      },
      Segmented: {
        trackBg: colorToken('--mb-color-bg-app'),
        borderRadius: 8,
      },
      Alert: {
        colorWarningBg: colorToken('--mb-color-warning-bg'),
        colorWarningBorder: colorToken('--mb-color-warning'),
        colorErrorBg: colorToken('--mb-color-danger-bg'),
        colorErrorBorder: colorToken('--mb-color-danger'),
        colorSuccessBg: colorToken('--mb-color-success-bg'),
        colorSuccessBorder: colorToken('--mb-color-success'),
        colorInfoBg: colorToken('--mb-color-info-bg'),
        colorInfoBorder: colorToken('--mb-color-info'),
      },
    },
  }
}
