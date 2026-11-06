/**
 * 批 C：PC 现金流桑基
 *
 * 守护口径：三层（期初 → 流入 / 流出 → 期末）、费用与修正各为独立 link、
 * 每条 link 与每个节点都有 ≥24px 命中带、守恒差额在页脚可见；
 * 390 不渲染桑基，仍用 Top5 横条。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { LedgerContext, type LedgerContextValue } from '@/features/overview/ledgerStore'
import { createSeedLedger } from '@/features/overview/model'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { CashSankeyChart } from '@/features/reports/CashSankey'
import { deriveCashReport } from '@/features/reports/reportsModel'
import { assertCashSankeyConservation, deriveCashSankey } from '@/features/reports/cashSankeyModel'
import type { DeviceMode } from '@/features/shared/types'

const ledger = createSeedLedger()
const report = deriveCashReport(ledger, '2026-10-01', '2026-10-31')
const ALL_VISIBLE = { 经营: true, 投资: true, 筹资: true, 未分类: true, 账户间转账: true }
const sankey = deriveCashSankey(ledger, report, ALL_VISIBLE)

describe('CashSankeyChart', () => {
  it('每条 link 与每个节点都有 24px 命中带', () => {
    const { container } = render(<CashSankeyChart data={sankey} onOpen={() => {}} />)
    const linkHits = Array.from(container.querySelectorAll<SVGPathElement>('.mb-rp-sankey-hit'))
    expect(linkHits.length).toBe(sankey.links.length)
    for (const hit of linkHits) {
      expect(Number(hit.dataset.hit)).toBeGreaterThanOrEqual(24)
    }
    const nodes = container.querySelectorAll('.mb-rp-sankey-node')
    const nodeHits = Array.from(container.querySelectorAll<SVGRectElement>('.mb-rp-sankey-node-hit'))
    expect(nodeHits.length).toBe(nodes.length)
    for (const hit of nodeHits) {
      expect(Number(hit.dataset.hit)).toBeGreaterThanOrEqual(24)
      expect(Number(hit.getAttribute('height'))).toBeGreaterThanOrEqual(24)
    }
  })

  it('点 link / 点节点都落到同一节点锚点（合计逐字段一致）', () => {
    const onOpen = vi.fn()
    const { container } = render(<CashSankeyChart data={sankey} onOpen={onOpen} />)
    const feeNode = sankey.nodes.find((node) => node.id === 'out:fee')
    const feeHit = container.querySelector<SVGPathElement>('.mb-rp-sankey-hit[data-target="out:fee"]')
    expect(feeHit).not.toBeNull()
    fireEvent.click(feeHit!)
    expect(onOpen).toHaveBeenCalledWith('out:fee', feeNode?.amount)
    const openingHit = container.querySelector<SVGRectElement>('.mb-rp-sankey-node-hit')
    fireEvent.click(openingHit!)
    const opening = sankey.nodes.find((node) => node.id === 'opening')
    expect(onOpen).toHaveBeenCalledWith('opening', opening?.amount)
  })

  it('页脚给出期初 / 流入 / 流出 / 期末与差额，差额实测为 0', () => {
    const { container } = render(<CashSankeyChart data={sankey} onOpen={() => {}} />)
    const check = container.querySelector<HTMLElement>('.mb-rp-sankey-check')
    expect(check?.dataset.difference).toBe('0')
    expect(container.querySelector('.mb-rp-sankey-foot')?.textContent).toContain('差额')
  })

  it('不守恒时画可见失败态，而不是一张错的图', () => {
    const { container } = render(
      <CashSankeyChart data={{ ...sankey, status: 'invalid', reason: '不守恒' }} onOpen={() => {}} />,
    )
    expect(container.querySelector('.mb-rp-sankey-fail')?.textContent).toBe('不守恒')
    expect(container.querySelector('.mb-rp-sankey-svg')).toBeNull()
  })
})

describe('deriveCashSankey 守恒', () => {
  it('期初 + 流入 − 流出 − 期末 = 0，账户间转账不进桑基', () => {
    expect(sankey.status).toBe('ready')
    expect(sankey.difference).toBe(0)
    expect(sankey.opening + sankey.inflow - sankey.outflow - sankey.closing).toBe(0)
    expect(sankey.transferExcluded).toBeGreaterThan(0)
  })

  it('手续费与对账修正各为一条独立出流 link', () => {
    const fee = sankey.nodes.find((node) => node.id === 'out:fee')
    expect(fee?.amount).toBe(report.reconcile.transferFee)
    expect(sankey.links.some((link) => link.nodeId === 'out:fee' && link.amount === fee?.amount)).toBe(true)
    const adjustment = report.reconcile.adjustmentExpense
    if (adjustment > 0) {
      expect(sankey.nodes.find((node) => node.id === 'out:correction')?.amount).toBe(adjustment)
    }
  })

  it('隐藏分组并入「其他」后仍守恒，合计不因隐藏而改变', () => {
    const hidden = deriveCashSankey(ledger, report, { ...ALL_VISIBLE, 经营: false })
    expect(hidden.status).toBe('ready')
    expect(hidden.difference).toBe(0)
    expect(hidden.hiddenGroups).toBeGreaterThan(0)
    expect(hidden.nodes.some((node) => node.name.startsWith('其他（已隐藏'))).toBe(true)
    expect(hidden.inflow).toBe(sankey.inflow)
    expect(hidden.outflow).toBe(sankey.outflow)
  })

  it('期初净额为负（负债大于资产）时走可见失败态，不静默画图', () => {
    const negativeLedger = {
      ...ledger,
      accounts: ledger.accounts.map((account) => ({ ...account, balance: -Math.abs(account.balance) })),
    }
    const negative = deriveCashSankey(
      negativeLedger,
      deriveCashReport(negativeLedger, '2026-10-01', '2026-10-31'),
      ALL_VISIBLE,
    )
    expect(negative.status).toBe('invalid')
    expect(negative.reason).toContain('三层桑基不适用')
    expect(negative.links).toHaveLength(0)
  })

  it('守恒断言容差 ¥0.01：差 1 分放行，差 2 分抛错', () => {
    expect(assertCashSankeyConservation(10_000, 1_000, 500, 10_500)).toBe(0)
    expect(() => assertCashSankeyConservation(10_000, 1_000, 500, 10_498)).toThrow('现金流桑基不守恒')
  })
})

const contextValue = {
  ledger,
  dataMode: 'seed' as const,
  addTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransactions: vi.fn(),
  setTransactionCategory: vi.fn(),
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  deleteAccount: vi.fn(),
  reorderAccount: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  moveCategory: vi.fn(),
  deleteCategory: vi.fn(),
  reorderCategory: vi.fn(),
  undo: vi.fn(),
  replaceLedger: vi.fn(),
} as unknown as LedgerContextValue

function renderPage(device: DeviceMode) {
  return render(
    <MantineProvider>
      <LedgerContext.Provider value={contextValue}>
        <ReportsPage
          device={device}
          dataState="ready"
          settingsOpen={false}
          onSettingsToggle={() => {}}
          onRetry={() => {}}
          onImport={() => {}}
          onViewFlow={() => {}}
        />
      </LedgerContext.Provider>
    </MantineProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('现金流 tab 的平台降级', () => {
  it('390 不渲染桑基，仍用 Top5 横条', () => {
    const { container } = renderPage('mobile')
    fireEvent.click(screen.getByRole('tab', { name: '现金流' }))
    expect(container.querySelector('.mb-rp-sankey')).toBeNull()
    expect(container.querySelector('.mb-rp-flow-row')).not.toBeNull()
  })

  it('PC 渲染桑基并撤掉 Top5 横条', () => {
    const { container } = renderPage('desktop')
    fireEvent.click(screen.getByRole('tab', { name: '现金流' }))
    expect(container.querySelector('.mb-rp-sankey')).not.toBeNull()
    expect(container.querySelector('.mb-rp-flow-row')).toBeNull()
  })
})
