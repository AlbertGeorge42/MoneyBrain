/**
 * 业务语义 token
 * 收入、支出、现金流等财务领域专用颜色，不属于 antd token 体系
 */

export interface DomainColorPair {
  light: string
  dark: string
}

export const domainColors: Record<string, DomainColorPair> = {
  income: { light: '#52c41a', dark: '#5fd05f' },
  expense: { light: '#ff4d4f', dark: '#ff7875' },
  transfer: { light: '#1890ff', dark: '#40a9ff' },
  refund: { light: '#fa8c16', dark: '#ffc069' },
  adjustment: { light: '#722ed1', dark: '#b37feb' },
  positive: { light: '#3f8600', dark: '#49aa19' },
  negative: { light: '#cf1322', dark: '#d84a4a' },
  neutral: { light: '#595959', dark: '#bfbfbf' },

  cash: { light: '#1890ff', dark: '#177ddc' },
  nonCash: { light: '#13c2c2', dark: '#36cfc9' },
  operating: { light: '#52c41a', dark: '#49aa19' },
  investing: { light: '#1890ff', dark: '#177ddc' },
  financing: { light: '#fa8c16', dark: '#d89614' },
}

export function getDomainColor(key: string, isDark: boolean): string {
  const pair = domainColors[key]
  if (!pair) return '#000'
  return isDark ? pair.dark : pair.light
}

export function getAllDomainColors(isDark: boolean): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, pair] of Object.entries(domainColors)) {
    result[key] = isDark ? pair.dark : pair.light
  }
  return result
}