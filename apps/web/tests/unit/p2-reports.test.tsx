/**
 * P2 #10 / #15 / #16（报表）
 *
 * #10 三个 tab 共用一套期间措辞，时点不得晚于数据截止日；
 * #15 现金流与收支明细的差异显式列出（调整 2.40 / 转账手续费 2.00）；
 * #16 卡片合并桶「其余 N 类」与下钻同一聚合口径；子级行挂「†」图例角标。
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fireEvent, render } from '@testing-library/react'
import { CompositionBars } from '@/features/reports/charts'
import { flattenFlowRows } from '@/features/reports/reportRows'
import {
  buildDrill,
  deriveBalanceReport,
  deriveCashReport,
  type FlowTreeNode,
} from '@/features/reports/reportsModel'
import {
  clampAsOfPoint,
  formatPointLabel,
  formatRangeLabel,
  type ReportTime,
} from '@/features/reports/reportsTime'
import { TODAY, createSeedLedger } from '@/features/overview/model'

const MONTH_TIME: ReportTime = {
  gran: 'month',
  point: '2026-10-31',
  from: '2026-10-01',
  to: '2026-10-28',
  preset: 'thisMonth',
}

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

describe('报表设置抽屉：移动 sheet 四行可见、toast 不压「完成」', () => {
  const reports = readFileSync(resolve(WEB_ROOT, 'src/features/reports/reports.css'), 'utf8')

  it('380px sheet 内四行压到 44px，打开即可完整落位', () => {
    expect(reports).toMatch(
      /\.mb-rp-sheet-settings\.is-mobile \.mb-rp-settings-row\s*\{[^}]*min-height:\s*var\(--mb-touch\)/,
    )
    expect(reports).toMatch(
      /\.mb-rp-sheet-settings\.is-mobile \.mb-rp-settings-scroll\s*\{[^}]*padding:\s*var\(--mb-s-2\)/,
    )
  })

  it('sheet 打开时 toast 抬到 sheet 上方，不遮住底部「完成」', () => {
    expect(reports).toMatch(/\.mb-rp-toast\.is-over-sheet\s*\{[^}]*bottom:\s*calc\(380px/)
  })
})

describe('#10 期间措辞统一', () => {
  it('期间与时点标签写成同一句「2026 年 10 月 · 截至 10-28」', () => {
    expect(formatRangeLabel(MONTH_TIME)).toBe('2026 年 10 月 · 截至 10-28')
    expect(formatPointLabel(MONTH_TIME.point, MONTH_TIME.gran, TODAY)).toBe(
      '2026 年 10 月 · 截至 10-28',
    )
  })

  it('时点不晚于 asOf（10-31 截到 10-28）', () => {
    expect(clampAsOfPoint('2026-10-31', TODAY)).toBe(TODAY)
    const balance = deriveBalanceReport(createSeedLedger(), clampAsOfPoint('2026-10-31', TODAY))
    expect(balance.point <= TODAY).toBe(true)
    expect(formatPointLabel(balance.point, 'month', TODAY)).toBe('2026 年 10 月 · 截至 10-28')
  })
})

describe('#15 三处口径对账', () => {
  const cash = deriveCashReport(createSeedLedger(), '2026-10-01', '2026-10-28')

  it('差异等于经营净额减收支结余，并单列调整与手续费', () => {
    expect(cash.reconcile.difference).toBe(cash.operatingNet - cash.reconcile.flowBalance)
    // 种子里的对账修正 ¥2.40 与转账手续费 ¥2.00
    expect(cash.reconcile.adjustmentExpense).toBe(240)
    expect(cash.reconcile.transferFee).toBe(200)
  })

  it('现金流不计调整与手续费，收支明细计入调整——差异金额可解释', () => {
    expect(cash.reconcile.flowExpense).toBeGreaterThan(0)
    expect(cash.reconcile.difference).toBe(240)
  })

  it('经营净额带「不含修正」角标，差额不用整段说明', () => {
    const metric = cash.metrics.find((item) => item.label === '经营净额')
    expect(metric?.hint).toBe('不含修正 ¥2.40')
  })
})

function node(id: string, name: string, amount: number, count = 1): FlowTreeNode {
  return { id, name, amount, count, share: 0, level: 0, children: [] }
}

describe('#16 卡片「其余」合并桶与下钻同口径', () => {
  const trees = [
    node('food', '餐饮', 10_000),
    node('shop', '购物', 9_000),
    node('home', '居住', 8_000),
    node('fun', '娱乐', 7_000),
    node('edu', '教育', 6_000),
    node('health', '医疗', 3_000),
    node('transit', '交通', 2_000),
    node('other', '其他', 490),
  ]
  const rest = trees.slice(5)
  const restNode: FlowTreeNode = {
    id: 'rest',
    name: '其余 3 类',
    amount: 5_490,
    count: 3,
    share: 0,
    level: 0,
    children: rest.map((item) => ({ ...item, level: 1 as const, children: [] })),
    mergedIds: rest.map((item) => item.id),
  }

  it('合并桶「其余 3 类」金额与下钻同口径，不列构成说明', () => {
    const { container } = render(
      <CompositionBars
        incomeTrees={[]}
        expenseTrees={trees}
        incomeTotal={0}
        expenseTotal={trees.reduce((sum, item) => sum + item.amount, 0)}
      />,
    )
    const rows = Array.from(container.querySelectorAll('.mb-rp-compare-row'))
    const row = rows.find((item) =>
      item.querySelector('.mb-rp-compare-name')?.textContent?.includes('其余'),
    )
    // 合并桶不再叫「其他」，避免与根分类「其他 ¥2.40」重名。
    expect(row?.querySelector('.mb-rp-compare-name')?.textContent).toContain('其余 3 类')
    expect(row?.querySelector('.mb-rp-compare-hint')).toBeNull()
    expect(row?.querySelector('.mb-rp-compare-amount')?.textContent).toBe('¥54.90')
  })

  it('点进「其余」的下钻金额与被点行一致', () => {
    const drill = buildDrill(createSeedLedger(), restNode, 'expense', '2026-10-01', '2026-10-28')
    expect(drill.title).toBe('其余 3 类')
    expect(drill.amount).toBe(5_490)
    expect(drill.children.reduce((sum, child) => sum + child.amount, 0)).toBe(5_490)
  })

  it('子级行挂「†」角标，可见行相加不再被当作合计', () => {
    const parent: FlowTreeNode = {
      ...node('food', '餐饮', 1_300, 2),
      share: 100,
      children: [{ ...node('lunch', '午餐', 300), level: 1 }],
    }
    const rows = flattenFlowRows([parent], {}, () => {}, () => {})
    expect(rows.map((row) => row.cells[0])).toEqual(['餐饮', '午餐'])
    // 1024 首列仅 101px，五字标记会挤掉名称，故用「†」由表说明位图例承载。
    expect(rows[1].hint).toBe('†')
    expect(rows[0].hint).toBeUndefined()
    // 父级金额已含子级：子级只是拆分展示，不是额外一笔。
    expect(rows[0].cells[2]).toBe('¥13.00')
    expect(rows[1].cells[2]).toBe('¥3.00')
  })

  it('卡片每一行可点，点「其余」打开与被点金额一致的下钻', () => {
    const onOpen = vi.fn()
    const { container } = render(
      <CompositionBars
        incomeTrees={[]}
        expenseTrees={trees}
        incomeTotal={0}
        expenseTotal={trees.reduce((sum, item) => sum + item.amount, 0)}
        onOpen={onOpen}
      />,
    )
    const rows = Array.from(container.querySelectorAll<HTMLButtonElement>('.mb-rp-compare-row'))
    expect(rows.every((row) => row.tagName === 'BUTTON')).toBe(true)

    const other = rows.find((row) =>
      row.querySelector('.mb-rp-compare-name')?.textContent?.includes('其余'),
    )
    expect(other).toBeDefined()
    fireEvent.click(other as HTMLButtonElement)

    expect(onOpen).toHaveBeenCalledTimes(1)
    const [openedNode, kind] = onOpen.mock.calls[0] as [FlowTreeNode, string]
    expect(kind).toBe('expense')
    expect(openedNode.id).toBe('rest')
    expect(openedNode.amount).toBe(5_490)
    expect(openedNode.mergedIds).toEqual(rest.map((item) => item.id))
  })
})
