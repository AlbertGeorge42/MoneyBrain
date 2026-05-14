import type { ThemeConfig } from 'antd'
import { lightThemeValues } from './themes/light'
import { darkThemeValues } from './themes/dark'

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
  controlHeight: 40,
  controlHeightSM: 32,
  controlHeightLG: 48,
}

export function getAntdTheme(isDark: boolean): ThemeConfig {
  const theme = isDark ? darkThemeValues : lightThemeValues

  return {
    token: {
      ...baseTheme,
      colorPrimary: theme['--mb-color-primary'],
      colorSuccess: theme['--mb-color-success'],
      colorWarning: theme['--mb-color-warning'],
      colorError: theme['--mb-color-danger'],
      colorInfo: theme['--mb-color-info'],
      colorText: colorToken('--mb-color-text'),
      colorTextSecondary: colorToken('--mb-color-neutral'),
      colorTextTertiary: colorToken('--mb-color-muted'),
      colorTextQuaternary: colorToken('--mb-color-disabled'),
      colorBgContainer: colorToken('--mb-color-surface'),
      colorBgElevated: colorToken('--mb-color-surface-elevated'),
      colorBgLayout: colorToken('--mb-color-background'),
      colorBorder: colorToken('--mb-color-border'),
      colorBorderSecondary: colorToken('--mb-color-border-strong'),
      colorFillSecondary: colorToken('--mb-color-surface-muted'),
      colorFillTertiary: colorToken('--mb-color-surface-hover'),
      boxShadow: colorToken('--mb-shadow-md'),
      boxShadowSecondary: colorToken('--mb-shadow-sm'),
    },
    components: {
      Layout: {
        headerBg: colorToken('--mb-color-panel'),
        siderBg: colorToken('--mb-color-panel'),
        bodyBg: colorToken('--mb-color-background'),
        triggerBg: colorToken('--mb-color-panel'),
      },
      Card: {
        headerBg: 'transparent',
      },
      Button: {
        defaultBg: colorToken('--mb-color-surface'),
        defaultBorderColor: colorToken('--mb-color-border-input'),
        defaultColor: colorToken('--mb-color-text'),
        defaultHoverBg: colorToken('--mb-color-surface-hover'),
        defaultHoverBorderColor: colorToken('--mb-color-primary'),
        defaultHoverColor: colorToken('--mb-color-primary'),
        defaultActiveBg: colorToken('--mb-color-surface-hover'),
        defaultActiveBorderColor: colorToken('--mb-color-primary'),
        defaultActiveColor: colorToken('--mb-color-primary'),
        primaryColor: colorToken('--mb-color-on-primary'),
        primaryShadow: 'none',
        dangerColor: colorToken('--mb-color-on-primary'),
      },
      Menu: {
        itemBg: 'transparent',
        itemSelectedBg: colorToken('--mb-color-surface-selected'),
        itemHoverBg: colorToken('--mb-color-surface-hover'),
        itemColor: colorToken('--mb-color-neutral'),
        itemSelectedColor: colorToken('--mb-color-text'),
      },
      Tag: {
        defaultBg: colorToken('--mb-color-surface-muted'),
        defaultColor: colorToken('--mb-color-text'),
        colorBorder: colorToken('--mb-color-border'),
      },
      Segmented: {
        trackBg: colorToken('--mb-color-surface-muted'),
        itemColor: colorToken('--mb-color-neutral'),
        itemHoverColor: colorToken('--mb-color-text'),
        itemHoverBg: colorToken('--mb-color-surface-hover'),
        itemSelectedBg: colorToken('--mb-color-surface'),
        itemSelectedColor: colorToken('--mb-color-text'),
      },
      Radio: {
        buttonBg: colorToken('--mb-color-surface'),
        buttonCheckedBg: colorToken('--mb-color-surface-selected'),
        buttonColor: colorToken('--mb-color-text'),
        buttonSolidCheckedColor: colorToken('--mb-color-on-primary'),
      },
      Table: {
        headerBg: colorToken('--mb-color-surface-muted'),
        rowHoverBg: colorToken('--mb-color-surface-hover'),
      },
      Alert: {
        colorWarningBg: colorToken('--mb-color-surface-muted'),
        colorWarningBorder: colorToken('--mb-color-warning'),
        colorErrorBg: colorToken('--mb-color-surface-muted'),
        colorErrorBorder: colorToken('--mb-color-danger'),
        colorSuccessBg: colorToken('--mb-color-surface-muted'),
        colorSuccessBorder: colorToken('--mb-color-success'),
        colorInfoBg: colorToken('--mb-color-surface-muted'),
        colorInfoBorder: colorToken('--mb-color-info'),
      },
    },
  }
}
