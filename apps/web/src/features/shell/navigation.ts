import {
  BarChart3,
  LayoutDashboard,
  List,
  Settings,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export type ShellPage = 'overview' | 'transactions' | 'reports' | 'budgets' | 'settings'

export interface ShellNavItem {
  id: ShellPage
  label: string
  icon: LucideIcon
  shortcut: string
}

export const SHELL_NAV: ShellNavItem[] = [
  { id: 'overview', label: '总览', icon: LayoutDashboard, shortcut: '1' },
  { id: 'transactions', label: '流水', icon: List, shortcut: '2' },
  { id: 'reports', label: '报表', icon: BarChart3, shortcut: '3' },
  { id: 'budgets', label: '预算', icon: Wallet, shortcut: '4' },
  { id: 'settings', label: '设置', icon: Settings, shortcut: '5' },
]

export function shellPageLabel(page: ShellPage): string {
  return SHELL_NAV.find((item) => item.id === page)?.label ?? '总览'
}
