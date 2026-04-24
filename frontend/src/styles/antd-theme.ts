import type { ThemeConfig } from 'antd'

function colorToken(name: string): string {
  return `var(${name})`
}

const baseTheme: ThemeConfig['token'] = {
  fontFamily: '"Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif',
  fontSize: 14,
  fontSizeSM: 12,
  fontSizeLG: 16,
  borderRadius: 10,
  borderRadiusSM: 8,
  borderRadiusLG: 16,
  paddingXS: 8,
  paddingSM: 12,
  padding: 16,
  paddingMD: 20,
  paddingLG: 24,
  paddingXL: 32,
  controlHeight: 40,
  controlHeightSM: 32,
  controlHeightLG: 48,
  motionDurationFast: '0.16s',
  motionDurationMid: '0.24s',
  motionDurationSlow: '0.32s',
}

export function getAntdTheme(): ThemeConfig {
  return {
    token: {
      ...baseTheme,
      colorPrimary: colorToken('--mb-color-primary'),
      colorSuccess: colorToken('--mb-color-success'),
      colorWarning: colorToken('--mb-color-warning'),
      colorError: colorToken('--mb-color-danger'),
      colorInfo: colorToken('--mb-color-info'),
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
        primaryColor: '#ffffff',
        primaryShadow: 'none',
        dangerColor: '#ffffff',
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
        buttonSolidCheckedColor: '#ffffff',
      },
      Table: {
        headerBg: colorToken('--mb-color-surface-muted'),
        rowHoverBg: colorToken('--mb-color-surface-hover'),
      },
    },
  }
}
