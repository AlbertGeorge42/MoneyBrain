/**
 * 报表与账本配置的共享原语回归：默认折叠、竖向拖拽、双表强制对齐、
 * 以及「设置不再提供显示口径配置 / 不再有对账入口」的结构守护。
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from '@testing-library/react'
import { ReportTablePair, type ReportTableProps } from '@/features/reports/ReportTable'
import {
  isExpanded,
  setExpandedKeys,
  toggleExpandedKey,
  toggleFold,
} from '@/features/shared/foldState'
import { restrictToVerticalAxis, verticalDragStyle } from '@/features/ledger-config/drag'

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const source = (relative: string) => readFileSync(resolve(WEB_ROOT, 'src', relative), 'utf8')

const COLUMNS = [{ label: '分类' }, { label: '金额', align: 'num' as const }]
const row = (id: string, name: string) => ({ id, cells: [name, '1'] })
const base = {
  device: 'desktop' as const,
  columns: COLUMNS,
  total: ['合计', '0'],
}

function pair(leftRows: ReturnType<typeof row>[], rightRows: ReturnType<typeof row>[]) {
  const left: Omit<ReportTableProps, 'minRows'> = { ...base, title: '左表', ariaLabel: '左表', rows: leftRows }
  const right: Omit<ReportTableProps, 'minRows'> = { ...base, title: '右表', ariaLabel: '右表', rows: rightRows }
  return render(<ReportTablePair left={left} right={right} />)
}

describe('折叠列表默认收起', () => {
  it('报表树：空状态不展开，toggle 只翻转当前键', () => {
    expect(isExpanded({}, 'food')).toBe(false)
    const opened = toggleFold({}, 'food')
    expect(isExpanded(opened, 'food')).toBe(true)
    expect(isExpanded(opened, 'other')).toBe(false)
    expect(isExpanded(toggleFold(opened, 'food'), 'food')).toBe(false)
  })

  it('账本配置：展开集合为空即全部折叠，批量展开 / 收起互不串扰', () => {
    const opened = setExpandedKeys(new Set(), ['grp-a', 'grp-b'], true)
    expect(opened.has('grp-a')).toBe(true)
    expect(toggleExpandedKey(opened, 'grp-a').has('grp-a')).toBe(false)
    expect(toggleExpandedKey(opened, 'grp-a').has('grp-b')).toBe(true)
    expect(setExpandedKeys(opened, ['grp-a', 'grp-b'], false).size).toBe(0)
  })

  it('三个配置分区与四个报表视图都从同一份默认折叠口径取状态', () => {
    for (const file of [
      'features/ledger-config/AccountsSection.tsx',
      'features/ledger-config/CategoriesSection.tsx',
      'features/ledger-config/CashflowSection.tsx',
      'features/reports/BalanceView.tsx',
      'features/reports/CashView.tsx',
      'features/reports/reportRows.ts',
      'features/reports/reportsModel.ts',
    ]) {
      const text = source(file)
      expect(text, file).not.toMatch(/\?\? true|!== false|!collapsed\.has/)
    }
  })
})

describe('拖拽只允许竖直方向', () => {
  it('modifier 把水平位移归零，保留竖直位移', () => {
    const result = restrictToVerticalAxis({
      transform: { x: 42, y: 18, scaleX: 1, scaleY: 1 },
    } as never)
    expect(result.x).toBe(0)
    expect(result.y).toBe(18)
  })

  it('行样式也只输出竖直位移', () => {
    const style = verticalDragStyle({ x: 30, y: 12, scaleX: 1, scaleY: 1 })
    expect(style.transform).toContain('translate3d(0px, 12px, 0)')
    expect(style.transform).not.toContain('30px')
  })

  it('两处 DndContext 都挂了 modifier', () => {
    for (const file of [
      'features/ledger-config/AccountsSection.tsx',
      'features/ledger-config/CategoriesSection.tsx',
    ]) {
      expect(source(file), file).toContain('modifiers={[restrictToVerticalAxis]}')
    }
  })
})

describe('左右双表合计行强制对齐', () => {
  it('行数少的一侧补 pad 行，两表 tbody 严格等高', () => {
    const { container } = pair([row('1', '一'), row('2', '二'), row('3', '三')], [row('4', '四')])
    const tables = container.querySelectorAll('table')
    expect(tables[0].querySelectorAll('tbody tr')).toHaveLength(3)
    expect(tables[1].querySelectorAll('tbody tr')).toHaveLength(3)
    expect(tables[1].querySelectorAll('tbody tr.is-pad')).toHaveLength(2)
  })

  it('空表也补齐：空态行 + pad 行与另一侧同高', () => {
    const { container } = pair([row('1', '一'), row('2', '二')], [])
    const tables = container.querySelectorAll('table')
    expect(tables[1].querySelectorAll('tbody tr')).toHaveLength(2)
    expect(tables[1].querySelector('.mb-rp-table-empty')).not.toBeNull()
    expect(tables[1].querySelectorAll('tbody tr.is-pad')).toHaveLength(1)
  })

  it('三张双表报表统一走 ReportTablePair，CSS 让两卡等高', () => {
    for (const file of ['BalanceView.tsx', 'FlowView.tsx', 'CashView.tsx']) {
      expect(source(`features/reports/${file}`), file).toContain('<ReportTablePair')
    }
    const css = source('features/reports/reports.css')
    expect(css).toMatch(/\.mb-rp-cols\s*\{[^}]*align-items:\s*stretch/)
    // 折叠行 / 补齐行 / 空态行统一固定行高，表头也固定高度。
    expect(css).toMatch(/\.mb-rp-table tbody tr\s*\{[^}]*height:\s*var\(--mb-tbl-row-h\)/)
    expect(css).toMatch(/\.mb-rp-cols > \.mb-rp-table-card > \.mb-rp-sec-head\s*\{[^}]*min-height:/)
  })
})

describe('设置顺序决定报表默认顺序', () => {
  it('报表映射与资产负债分组都不再按金额降序覆盖后端顺序', () => {
    for (const file of [
      'features/reports/apiReports.ts',
      'features/reports/reportsModel.ts',
      'features/reports/reportSettings.ts',
    ]) {
      expect(source(file), file).not.toMatch(/right\.(amount|current|marketValue) - left\./)
    }
    expect(source('features/reports/InvestView.tsx')).not.toContain('sortHoldingRows')
  })

  it('四张视图的树与表格都用同一份分类树展开实现', () => {
    for (const file of ['BalanceView.tsx', 'FlowView.tsx']) {
      expect(source(`features/reports/${file}`), file).toContain('flattenTreeRows')
    }
  })
})

describe('设置精简后的结构守护', () => {
  it('报表设置直达分类管理：中间层弹窗与跨分区页签都已删除', () => {
    expect(existsSync(resolve(WEB_ROOT, 'src/features/reports/ReportSettingsPanel.tsx'))).toBe(false)
    const manager = source('features/ledger-config/LedgerConfigManager.tsx')
    expect(manager).not.toContain('HfTabs')
    expect(manager).not.toContain('label="账本数据"')
    const page = source('features/reports/ReportsPage.tsx')
    expect(page).not.toContain('分组口径')
    expect(page).not.toContain('列显示')
    expect(page).not.toContain('draftSettings')
    expect(page).toContain('REPORT_CONFIG[tab].tab')
  })

  it('资产负债表不再渲染净资产卡 / 覆盖说明，账户行不再有对账按钮', () => {
    const balance = source('features/reports/BalanceView.tsx')
    expect(balance).not.toContain('mb-rp-networth')
    expect(balance).not.toContain('账户覆盖')
    expect(source('features/ledger-config/AccountsSection.tsx')).not.toContain('ReconcileButton')
    expect(existsSync(resolve(WEB_ROOT, 'src/features/ledger-config/ReconcileSheet.tsx'))).toBe(false)
  })
})

describe('账户分类与构成环口径', () => {
  it('buildBalanceGroups 不把子分类归一到父分类', () => {
    const model = source('features/reports/reportsModel.ts')
    expect(model).not.toContain('byId.get(category.parentId)')
    expect(model).not.toContain('parent?.id')
  })

  it('收支与资产负债构成共用一份单框双环实现', () => {
    const charts = source('features/reports/charts.tsx')
    expect(charts).toContain('function DonutCompare')
    expect(charts.match(/<DonutCompare/g)).toHaveLength(2)
    const balance = source('features/reports/BalanceView.tsx')
    expect(balance).toContain('BalanceComposition')
    expect(balance).not.toContain('ChartCard title="资产构成"')
  })
})
