/**
 * 报表与账本配置的共享原语回归：默认折叠、竖向拖拽、双表强制对齐、
 * 移动端分段表补齐对齐，以及「设置不再提供显示口径配置 / 不再有对账入口」的结构守护。
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from '@testing-library/react'
import { ReportTable, ReportTablePair, type ReportTableProps } from '@/features/reports/ReportTable'
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

describe('报表明细行双端同风格', () => {
  it('四张报表的移动端都用 ReportTable 表格行，卡片行与横滑实现已删除', () => {
    for (const file of ['BalanceView.tsx', 'FlowView.tsx', 'CashView.tsx', 'InvestView.tsx']) {
      const text = source(`features/reports/${file}`)
      expect(text, file).not.toContain('ReportCardList')
      expect(text, file).not.toContain('flattenTreeCards')
      // 移动端所有列一屏内显示，不允许横滑或首列吸顶。
      expect(text, file).not.toContain('scrollable')
      expect(text, file).toContain('<ReportTable')
    }
    const tableSource = source('features/reports/ReportTable.tsx')
    expect(tableSource).not.toContain('CardRow')
    expect(tableSource).not.toContain('is-scroll')
    expect(source('features/reports/reportRows.ts')).not.toContain('flattenTreeCards')
    const css = source('features/reports/reports.css')
    expect(css).not.toContain('mb-rp-crow')
    expect(css).not.toContain('is-scroll')
  })

  it('明细表副标题不再重复表尾合计，手续费说明随后端计入一并删除', () => {
    for (const file of ['BalanceView.tsx', 'FlowView.tsx', 'CashView.tsx', 'InvestView.tsx']) {
      expect(source(`features/reports/${file}`), file).not.toMatch(/<ReportTable[\s\S]{0,400}?\bdesc[=:]/)
      expect(source(`features/reports/${file}`), file).not.toContain('desc:')
    }
    const tableSource = source('features/reports/ReportTable.tsx')
    expect(tableSource).not.toContain('desc?: string')
    expect(tableSource).not.toContain('mb-rp-sec-desc')
    // 手续费已由后端计入现金流，前端不再有恒为 0 的口径提示字段。
    expect(source('features/reports/CashView.tsx')).not.toContain('feeNote')
    expect(source('features/reports/apiReports.ts')).not.toContain('transferFee')
    expect(source('features/reports/reportsModel.ts')).not.toContain('transferFee')
  })

  it('单个 ReportTable 传 minRows 也会补 pad 行，合计行位置固定', () => {
    const { container } = render(
      <ReportTable {...base} title="移动表" ariaLabel="移动表" rows={[row('1', '一')]} minRows={3} />,
    )
    const table = container.querySelector('table')!
    expect(table.querySelectorAll('tbody tr')).toHaveLength(3)
    expect(table.querySelectorAll('tbody tr.is-pad')).toHaveLength(2)
    expect(table.querySelector('tfoot tr.is-total')).not.toBeNull()
  })

  it('三张移动端分段表都按两段最大行数补齐，切换标签时高度不跳变', () => {
    for (const file of ['BalanceView.tsx', 'FlowView.tsx', 'CashView.tsx']) {
      const text = source(`features/reports/${file}`)
      // 两段行数取最大值，且移动端那张表确实消费了它。
      expect(text, file).toMatch(/mobileMinRows = Math\.max\([^;]+\)/)
      expect(text, file).toContain('minRows={mobileMinRows}')
    }
    // 投资页不是分段切换结构，不需要补齐。
    expect(source('features/reports/InvestView.tsx')).not.toContain('mobileMinRows')
  })

  it('收支表双端同序：PC 左支出右收入，移动端分段支出在前', () => {
    const flow = source('features/reports/FlowView.tsx')
    // PC 双表：left 是支出、right 是收入。
    const left = /left=\{\{[\s\S]*?title:\s*'([^']+)'/.exec(flow)
    const right = /right=\{\{[\s\S]*?title:\s*'([^']+)'/.exec(flow)
    expect(left?.[1]).toBe('支出构成')
    expect(right?.[1]).toBe('收入构成')
    // 移动端分段：expense 选项排在 income 前面。
    const segment = /<Segmented[\s\S]*?options=\{\[([\s\S]*?)\]\}/.exec(flow)?.[1] ?? ''
    const expense = segment.indexOf("id: 'expense'")
    const income = segment.indexOf("id: 'income'")
    expect(expense).toBeGreaterThanOrEqual(0)
    expect(income).toBeGreaterThan(expense)
  })

  it('移动端子行缩进比表头多一级，账户行再多一级', () => {
    const css = source('features/reports/reports.css')
    // 表头/合计、is-child、is-child-2 三档递增，不能合并成同一缩进。
    const head = /is-foldable th:first-child[\s\S]*?padding-left:\s*calc\(([^;]+)\)/.exec(css)
    const child = /tr\.is-child td:first-child[\s\S]*?padding-left:\s*calc\(([^;]+)\)/.exec(css)
    const child2 = /tr\.is-child-2 td:first-child[\s\S]*?padding-left:\s*calc\(([^;]+)\)/.exec(css)
    expect(head, '表头缩进').not.toBeNull()
    expect(child, '子级缩进').not.toBeNull()
    expect(child2, '账户级缩进').not.toBeNull()
    expect(child![1].split('+').length).toBeGreaterThan(head![1].split('+').length)
    expect(child2![1].split('+').length).toBeGreaterThan(child![1].split('+').length)
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
    expect(manager).not.toContain('Tabs')
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

  it('PC 图表区上下堆叠：走势在上、构成在下，不再左右并排', () => {
    const css = source('features/reports/reports.css')
    const grid = /\.mb-rp-chart-grid\s*\{([^}]+)\}/.exec(css)
    expect(grid).not.toBeNull()
    expect(grid![1]).toMatch(/grid-template-columns:\s*1fr/)
    expect(grid![1]).not.toContain('auto-fit')
    // 三张有双环的报表在 PC 都仍渲染构成图；移动端分支不再把它塞进 chartGrid。
    for (const file of ['BalanceView.tsx', 'FlowView.tsx']) {
      const text = source(`features/reports/${file}`)
      expect(text, file).toContain("device === 'desktop' &&")
      expect(text, file).toContain('<CompositionDonutSide')
    }
  })

  it('移动端构成环在分段下、表格上，且随 side 切换一侧', () => {
    for (const file of ['BalanceView.tsx', 'FlowView.tsx', 'CashView.tsx']) {
      const text = source(`features/reports/${file}`)
      const segmented = text.indexOf('<Segmented')
      const donut = text.indexOf('<CompositionDonutSide')
      // 取最后一个 <ReportTable：PC 分支里的 <ReportTablePair 也算前缀匹配。
      const table = text.lastIndexOf('<ReportTable')
      expect(segmented, `${file} 分段`).toBeGreaterThan(-1)
      expect(donut, `${file} 构成环`).toBeGreaterThan(segmented)
      expect(table, `${file} 表格`).toBeGreaterThan(donut)
      // 环的节点按 side 取一侧，而不是双环同时显示。
      const donutBlock = text.slice(donut, table)
      expect(donutBlock, file).toMatch(/nodes=\{side === '[^']+' \? .+ : .+\}/)
    }
  })

  it('全项目只有一份构成环绘制实现，总览与报表都委托给它', () => {
    const donut = source('features/shared/DonutChart.tsx')
    expect(donut).toContain('function donutArc')
    expect(donut).toContain('function mergeTail')
    // 报表侧只 re-export，不再自己画弧。
    const charts = source('features/reports/charts.tsx')
    expect(charts).not.toContain('function donutArc')
    expect(charts).toContain("export { DonutChart")
    // 总览侧只剩 OverviewPage 内联的数据适配，独立适配文件已删除。
    expect(existsSync(resolve(WEB_ROOT, 'src/features/overview/ExpenseCategoryPie.tsx'))).toBe(false)
    const overview = source('features/overview/OverviewPage.tsx')
    expect(overview).toContain('<DonutChart')
    expect(overview).not.toContain('donutArc')
    // 样式同源：环与图例只由 shared/donut.css 定义。
    const css = source('features/reports/reports.css')
    expect(css).not.toContain('.mb-rp-donut-arc')
    expect(source('features/overview/overview.css')).not.toContain('.mb-expense-pie-arc')
  })

  it('四条环下钻链路统一：都构造 DrillTarget 走同一份抽屉，而非环点击直接跳流水', () => {
    const page = source('features/reports/ReportsPage.tsx')
    // 报表页只有一个 DrillDrawer 实例，三条链路都 setDrill 到它。
    expect(page.match(/<DrillDrawer/g)).toHaveLength(1)
    expect(page).toContain('buildDrillFor')
    expect(page).not.toContain('buildDrill(')
    // 收支 / 资产负债 / 现金流三张报表都通过 target 下钻，不再直接 onViewFlow。
    for (const file of ['BalanceView.tsx', 'CashView.tsx']) {
      const text = source(`features/reports/${file}`)
      expect(text, file).toContain('onDrill: (target: DrillTarget) => void')
      if (file === 'BalanceView.tsx') expect(text, file).toContain("type: 'account'")
      else expect(text, file).toContain("type: 'category'")
    }
    // 总览支出环也走同一份抽屉，不再由 onDrill 回调直接跳流水。
    const overview = source('features/overview/OverviewPage.tsx')
    expect(overview).toContain('<DrillDrawer')
    expect(overview).toContain('buildDrillFor')
    expect(overview).toContain('openCategory')
    // 唯一的数据构建实现在 reportsModel。
    const model = source('features/reports/reportsModel.ts')
    expect(model).toContain('function buildDrillFor')
    expect(model).toContain("childTitle: string")
  })
})
