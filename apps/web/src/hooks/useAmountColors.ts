/**
 * 主题感知的金额颜色 Hook
 * 返回当前主题下的 positive（深绿）/ negative（深红）/ neutral（灰）颜色值
 */

import { useMemo } from 'react'
import { useTheme } from '../styles/ThemeContext'
import { getFlatFinancialTokens } from '../styles/theme/financial-tokens'

export function useAmountColors() {
  const { isDark } = useTheme()
  return useMemo(() => getFlatFinancialTokens(isDark), [isDark])
}
