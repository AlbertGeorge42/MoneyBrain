import {
  ArrowLeftRight,
  ChartColumn,
  LayoutDashboard,
  Settings,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export type NavPage = 'overview' | 'transactions' | 'reports' | 'budgets' | 'settings'

export interface NavItem {
  page: NavPage
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { page: 'overview', label: '总览', icon: LayoutDashboard },
  { page: 'transactions', label: '流水', icon: ArrowLeftRight },
  { page: 'reports', label: '报表', icon: ChartColumn },
  { page: 'budgets', label: '预算', icon: Wallet },
  { page: 'settings', label: '设置', icon: Settings },
]

export function navLabel(page: NavPage): string {
  return NAV_ITEMS.find((item) => item.page === page)?.label ?? '总览'
}
