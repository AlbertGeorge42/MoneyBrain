/**
 * Ant Design 主题配置
 * 根据主题模式返回对应的主题配置
 */

import type { ThemeConfig } from 'antd'

/**
 * 浅色主题配置
 */
export const lightTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1890ff',
    colorSuccess: '#3f8600',
    colorWarning: '#faad14',
    colorError: '#cf1322',
    colorInfo: '#1890ff',
    colorText: 'rgba(0, 0, 0, 0.88)',
    colorTextSecondary: '#666666',
    colorTextTertiary: '#999999',
    colorTextQuaternary: 'rgba(0, 0, 0, 0.25)',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#f0f2f5',
    colorBorder: '#f0f0f0',
    colorBorderSecondary: '#d9d9d9',
    fontSize: 14,
    fontSizeSM: 12,
    fontSizeLG: 16,
    borderRadius: 6,
    borderRadiusSM: 4,
    borderRadiusLG: 8,
    paddingXS: 8,
    paddingSM: 12,
    padding: 16,
    paddingMD: 20,
    paddingLG: 24,
    paddingXL: 32,
    controlHeight: 32,
    controlHeightSM: 24,
    controlHeightLG: 40,
  },
}

/**
 * 暗色主题配置
 */
export const darkTheme: ThemeConfig = {
  token: {
    colorPrimary: '#177ddc',
    colorSuccess: '#49aa19',
    colorWarning: '#d89614',
    colorError: '#d84a4a',
    colorInfo: '#177ddc',
    colorText: 'rgba(255, 255, 255, 0.88)',
    colorTextSecondary: '#b3b3b3',
    colorTextTertiary: '#8c8c8c',
    colorTextQuaternary: 'rgba(255, 255, 255, 0.35)',
    colorBgContainer: '#1f1f1f',
    colorBgElevated: '#1f1f1f',
    colorBgLayout: '#141414',
    colorBorder: '#424242',
    colorBorderSecondary: '#434343',
    fontSize: 14,
    fontSizeSM: 12,
    fontSizeLG: 16,
    borderRadius: 6,
    borderRadiusSM: 4,
    borderRadiusLG: 8,
    paddingXS: 8,
    paddingSM: 12,
    padding: 16,
    paddingMD: 20,
    paddingLG: 24,
    paddingXL: 32,
    controlHeight: 32,
    controlHeightSM: 24,
    controlHeightLG: 40,
  },
}

/**
 * 获取 Ant Design 主题配置
 * @param isDark 是否为暗色主题
 */
export function getAntdTheme(isDark: boolean): ThemeConfig {
  return isDark ? darkTheme : lightTheme
}
