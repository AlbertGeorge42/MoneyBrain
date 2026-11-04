/**
 * 渲染级回归：表格金额必须走表级 format（signed / unsigned），
 * 而不是列定义的 text 分支输出裸数字。
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { ReportTable } from '../../../src/features/reports/ReportTable'
import { REPORT_PERIODS, type ReportTableData } from '../../../src/features/reports/reports-mock'

const period = REPORT_PERIODS.month[2]
const [income, expense] = period.views.flows.tables
const assets = period.views.balance.tables[0]

const baseProps = {
  periodLabel: period.label,
  device: 'pc' as const,
  folded: new Set<string>(),
  sort: null,
  onSort: vi.fn(),
  onToggleFold: vi.fn(),
  onOpenRow: vi.fn(),
}

function renderTable(table: ReportTableData) {
  render(
    <MantineProvider>
      <ReportTable table={table} {...baseProps} />
    </MantineProvider>,
  )
  return screen.getByRole('table', { name: `${table.title} · ${period.label}` })
}

function amountTexts(table: HTMLElement) {
  return Array.from(table.querySelectorAll('tbody .rep-data-row .rep-num-cell .mb-num'))
    .map((node) => node.textContent ?? '')
    .filter((text) => text.includes('¥'))
}

const currency = /^[+−]?¥\d{1,3}(,\d{3})*\.\d{2}$/

describe('ReportTable 金额渲染', () => {
  it('收入表的数据行显示符号、货币符号与千分位', () => {
    const table = renderTable(income)
    const texts = amountTexts(table)

    expect(texts.length).toBeGreaterThan(0)
    expect(texts.every((text) => currency.test(text))).toBe(true)
    expect(within(table).getAllByText('+¥18,320.00').length).toBeGreaterThan(0)

    const total = table.querySelector('tfoot .rep-num-cell:last-child .mb-num')?.textContent ?? ''
    expect(total).toBe('+¥18,812.40')
  })

  it('支出表金额带负号，合计行同样格式化', () => {
    const table = renderTable(expense)
    const texts = amountTexts(table)

    expect(texts.every((text) => currency.test(text))).toBe(true)
    expect(within(table).getAllByText('−¥5,840.00').length).toBeGreaterThan(0)

    const total = table.querySelector('tfoot .rep-num-cell:last-child .mb-num')?.textContent ?? ''
    expect(total).toBe('−¥7,056.90')
  })

  it('资产负债表金额不带正负号，但仍保留货币符号与千分位', () => {
    const table = renderTable(assets)
    const texts = amountTexts(table)

    expect(texts.length).toBeGreaterThan(0)
    expect(texts.every((text) => /^¥\d{1,3}(,\d{3})*\.\d{2}$/.test(text))).toBe(true)
    expect(within(table).getAllByText('¥82,340.50').length).toBeGreaterThan(0)
  })

  it('行的无障碍摘要也使用格式化金额，而不是裸数字', () => {
    const table = renderTable(expense)
    const row = within(table).getByRole('row', { name: /居住/ })

    expect(row.getAttribute('aria-label')).toContain('¥')
    expect(row.getAttribute('aria-label')).toContain(',')
  })
})
