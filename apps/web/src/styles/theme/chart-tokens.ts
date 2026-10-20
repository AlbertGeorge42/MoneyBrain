import { useMemo } from 'react'
import { theme } from 'antd'
import { useTheme } from '../ThemeContext'
import { getFinancialTokens, type FinancialTokens } from './financial-tokens'

export interface ChartTokens {
  text: string
  textSecondary: string
  textTertiary: string
  axis: string
  splitLine: string
  legend: string
  tooltip: {
    bg: string
    text: string
    border: string
  }
  title: string
  grid: string
  palette: string[]
  financial: FinancialTokens
}

export function useChartTokens(): ChartTokens {
  const { token } = theme.useToken()
  const { isDark } = useTheme()

  const financial = useMemo(() => getFinancialTokens(isDark), [isDark])

  const palette = useMemo(() => {
    // 按色相顺序排列的离散色板，确保每种颜色视觉可辨识
    return [
      token.colorPrimary,   // 蓝
      token.cyan6,          // 青
      token.green6,         // 绿
      token.gold6,          // 金
      token.orange6,        // 橙
      token.red6,           // 红
      token.magenta6,       // 洋红
      token.purple6,        // 紫
      token.geekblue6,      // 极客蓝
      token.volcano6,       // 火山色
    ].filter(Boolean)
  }, [token])

  return useMemo(() => ({
    text: token.colorText,
    textSecondary: token.colorTextSecondary,
    textTertiary: token.colorTextTertiary,
    axis: token.colorBorderSecondary,
    splitLine: token.colorBorderSecondary,
    legend: token.colorTextTertiary,
    tooltip: {
      bg: token.colorBgContainer,
      text: token.colorText,
      border: token.colorBorder,
    },
    title: token.colorText,
    grid: token.colorBorderSecondary,
    palette,
    financial,
  }), [token, palette, financial])
}