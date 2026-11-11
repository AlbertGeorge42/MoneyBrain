/**
 * 批 C：PC 现金流桑基（三层重设计）
 *
 * 守护口径：收入一级分类 → 账户 → 支出一级分类；期初 / 期末逐账户读数；
 * 逐账户 + 总账双重守恒；现金账户之间转账画成账户 → 账户 link；
 * 每条 link 与每个节点都有 ≥24px 命中带；390 不渲染桑基，仍用 Top5 横条。
 */
import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { mapCashReport } from '@/features/reports/apiReports'
import { CashView } from '@/features/reports/CashView'
import { CashSankeyChart } from '@/features/reports/CashSankey'
import {
  assertAccountConservation,
  assertCashSankeyConservation,
  deriveCashSankey,
} from '@/features/reports/cashSankeyModel'
import type { DeviceMode } from '@/features/shared/types'
import { makeLedger } from '../helpers/ledger'

const FROM = '2026-10-01'
const TO = '2026-10-31'

/** 与后端现金流 DTO 完全对得上的账本：收入 5 万、教育 2 万、转账 1 万（手续费 200）、修正 -240。 */
const LEDGER = makeLedger({
  accounts: [
    { id: 'wx', name: '微信零钱', kind: 'cash', balance: 119_560 },
    { id: 'zfb', name: '支付宝', kind: 'cash', balance: 60_000 },
  ],
  categories: [
    { id: 'salary', name: '工资', type: 'income' },
    { id: 'edu', name: '教育', type: 'expense' },
    { id: 'fee', name: '手续费', type: 'expense' },
    { id: 'other', name: '其他', type: 'expense' },
    { id: 'move', name: '账户互转', type: 'transfer' },
  ],
  transactions: [
    {
      id: 't1',
      date: '2026-10-05',
      type: 'income',
      categoryId: 'salary',
      note: '',
      accountId: 'wx',
      amount: 50_000,
    },
    {
      id: 't2',
      date: '2026-10-08',
      type: 'expense',
      categoryId: 'edu',
      note: '',
      accountId: 'wx',
      amount: 20_000,
    },
    {
      id: 't3',
      date: '2026-10-12',
      type: 'transfer',
      categoryId: 'move',
      note: '',
      accountId: 'wx',
      toAccountId: 'zfb',
      amount: 10_000,
      fee: 200,
    },
    {
      id: 't4',
      date: '2026-10-15',
      type: 'adjustment',
      categoryId: 'other',
      note: '',
      accountId: 'wx',
      amount: -240,
    },
  ],
})

const FEE = 200
const CORRECTION = 240

/** 后端 /reports/cash-flow 的原样 DTO：期初 1500、期末 1795.60，三层桑基含手续费 link。 */
const CASH_FLOW = {
  cashInflow: { actual: 50_000 },
  cashOutflow: { actual: -20_440 },
  startCash: { actual: 150_000 },
  endCash: { actual: 179_560 },
  byActivity: {
    operating: {
      inflow: { actual: 50_000 },
      outflow: { actual: -20_000 },
      net: { actual: 30_000 },
      items: [
        { categoryName: '工资', categoryId: 'salary', actual: 50_000, direction: 'inflow', type: 'income' },
        { categoryName: '教育', categoryId: 'edu', actual: -20_000, direction: 'outflow', type: 'expense' },
      ],
    },
    investing: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
    financing: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
    uncategorized: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
  },
  sankey: {
    nodes: [
      { name: '工资_income', category: 'income_category' },
      { name: '教育_expense', category: 'expense_category' },
      { name: '手续费_expense', category: 'expense_category' },
      { name: '微信零钱_cash', category: 'cash' },
      { name: '支付宝_cash', category: 'cash' },
    ],
    links: [
      { source: '工资_income', target: '微信零钱_cash', value: 50_000, actualValue: 50_000 },
      { source: '微信零钱_cash', target: '教育_expense', value: 20_000, actualValue: 20_000 },
      { source: '微信零钱_cash', target: '手续费_expense', value: FEE, actualValue: FEE },
      { source: '微信零钱_cash', target: '支付宝_cash', value: 10_000, actualValue: 10_000 },
    ],
  },
}

const report = mapCashReport(CASH_FLOW as never, LEDGER, FROM, TO)
const ALL_VISIBLE = { 经营: true, 投资: true, 筹资: true, 未分类: true, 账户间转账: true }
const sankey = deriveCashSankey(LEDGER, report, ALL_VISIBLE)

describe('CashSankeyChart', () => {
  it('每条 link 与每个节点都有 24px 命中带', () => {
    const { container } = render(<CashSankeyChart data={sankey} onOpen={() => {}} />)
    const linkHits = Array.from(container.querySelectorAll<SVGPathElement>('.mb-rp-sankey-hit'))
    expect(linkHits.length).toBe(sankey.links.length)
    for (const hit of linkHits) {
      expect(Number(hit.dataset.hit)).toBeGreaterThanOrEqual(24)
      expect(Number(hit.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(24)
    }
    const nodes = container.querySelectorAll('.mb-rp-sankey-node')
    const nodeHits = Array.from(container.querySelectorAll<SVGRectElement>('.mb-rp-sankey-node-hit'))
    expect(nodeHits.length).toBe(nodes.length)
    for (const hit of nodeHits) {
      expect(Number(hit.dataset.hit)).toBeGreaterThanOrEqual(24)
      expect(Number(hit.getAttribute('height'))).toBeGreaterThanOrEqual(24)
      expect(Number(hit.getAttribute('width'))).toBeGreaterThanOrEqual(24)
    }
  })

  it('点 link / 点节点都落到同一节点锚点（金额逐字段一致）', () => {
    const onOpen = vi.fn()
    const { container } = render(<CashSankeyChart data={sankey} onOpen={onOpen} />)
    const feeNode = sankey.nodes.find((node) => node.id === 'out:fee')
    const feeHit = container.querySelector<SVGPathElement>('.mb-rp-sankey-hit[data-target="out:fee"]')
    expect(feeHit).not.toBeNull()
    fireEvent.click(feeHit!)
    expect(onOpen).toHaveBeenCalledWith('out:fee', feeNode?.amount)
    const nodeHit = container.querySelector<SVGRectElement>('.mb-rp-sankey-node-hit')
    fireEvent.click(nodeHit!)
    const first = sankey.nodes.find((node) => node.id === nodeHit!.closest('.mb-rp-sankey-node')?.getAttribute('data-id'))
    expect(onOpen).toHaveBeenLastCalledWith(first?.id, first?.amount)
  })

  it('账户节点下方逐账户给出期初 → 期末读数', () => {
    const { container } = render(<CashSankeyChart data={sankey} onOpen={() => {}} />)
    const balances = Array.from(container.querySelectorAll('.mb-rp-sankey-balance'))
    expect(balances).toHaveLength(sankey.accounts.length)
    for (const text of balances) {
      expect(text.textContent).toMatch(/期初 .+ → 期末 .+/)
    }
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

describe('deriveCashSankey 三层与守恒', () => {
  it('总账守恒：期初 + 流入 − 流出 − 期末 = 0，逐账户等式全部成立', () => {
    expect(sankey.status).toBe('ready')
    expect(sankey.difference).toBe(0)
    expect(sankey.opening + sankey.inflow - sankey.outflow - sankey.closing).toBe(0)
    expect(assertAccountConservation(sankey.accounts)).toBeNull()
    for (const account of sankey.accounts) {
      expect(Math.abs(account.difference)).toBeLessThanOrEqual(1)
      expect(
        account.opening +
          account.inflow -
          account.outflow +
          account.transferIn -
          account.transferOut,
      ).toBe(account.closing)
    }
  })

  it('节点键用账户 / 分类 id，左右列落到一级分类', () => {
    const categoryNames = sankey.nodes
      .filter((node) => node.layer === 0 || node.layer === 2)
      .map((node) => node.id)
    for (const id of categoryNames) {
      expect(id).toMatch(/^(in|out):.+$/)
    }
    const accountIds = sankey.nodes.filter((node) => node.layer === 1).map((node) => node.id)
    for (const id of accountIds) {
      expect(id).toMatch(/^acct:.+$/)
    }
  })

  it('现金账户之间转账保留账户 → 账户 link，并反映在两侧余额变化', () => {
    expect(sankey.transferTotal).toBeGreaterThan(0)
    const transfers = sankey.links.filter((link) => link.kind === 'transfer')
    expect(transfers.length).toBeGreaterThan(0)
    for (const transfer of transfers) {
      const from = sankey.accounts.find((account) => `acct:${account.id}` === transfer.sourceId)
      const to = sankey.accounts.find((account) => `acct:${account.id}` === transfer.targetId)
      expect(from).toBeDefined()
      expect(to).toBeDefined()
      expect(from!.transferOut).toBeGreaterThanOrEqual(transfer.amount)
      expect(to!.transferIn).toBeGreaterThanOrEqual(transfer.amount)
    }
  })

  it('手续费与对账修正各为一条独立出流 link', () => {
    const fee = sankey.nodes.find((node) => node.id === 'out:fee')
    // 手续费来自后端桑基 link；对账修正由账本调整流水补出。
    expect(fee?.amount).toBe(FEE)
    expect(sankey.links.some((link) => link.nodeId === 'out:fee' && link.amount === fee?.amount)).toBe(true)
    expect(sankey.correction).toBe(CORRECTION)
    expect(sankey.nodes.find((node) => node.id === 'out:correction')?.amount).toBe(CORRECTION)
    expect(
      sankey.links.some((link) => link.nodeId === 'out:correction' && link.amount === CORRECTION),
    ).toBe(true)
  })

  it('隐藏分组并入「其他」后仍守恒，合计不因隐藏而改变', () => {
    const hidden = deriveCashSankey(LEDGER, report, { ...ALL_VISIBLE, 经营: false })
    expect(hidden.status).toBe('ready')
    expect(hidden.difference).toBe(0)
    expect(hidden.hiddenGroups).toBeGreaterThan(0)
    expect(hidden.nodes.some((node) => node.name.startsWith('其他（已隐藏'))).toBe(true)
    expect(hidden.inflow).toBe(sankey.inflow)
    expect(hidden.outflow).toBe(sankey.outflow)
    expect(assertAccountConservation(hidden.accounts)).toBeNull()
  })

  it('隐藏组数按活动分组去重：隐藏 1 组只算 1 组，不把流入 / 流出各计一次', () => {
    const hidden = deriveCashSankey(LEDGER, report, { ...ALL_VISIBLE, 经营: false })
    expect(hidden.hiddenGroups).toBe(1)
    const merged = hidden.nodes.filter((node) => node.name.startsWith('其他（已隐藏'))
    expect(merged.map((node) => node.name)).toEqual(['其他（已隐藏 1 组）', '其他（已隐藏 1 组）'])
  })

  it('隐藏 2 组 / 全隐藏时图注与抽屉说明位同数同词', () => {
    const one = deriveCashSankey(LEDGER, report, { ...ALL_VISIBLE, 经营: false })
    const two = deriveCashSankey(LEDGER, report, { ...ALL_VISIBLE, 经营: false, 账户间转账: false })
    const all = deriveCashSankey(LEDGER, report, {
      经营: false,
      投资: false,
      筹资: false,
      未分类: false,
      账户间转账: false,
    })
    expect(two.hiddenGroups).toBe(2)
    // 本期只有经营 / 账户间转账有流水，全隐藏与隐藏 2 组同数。
    expect(all.hiddenGroups).toBe(2)
    // 账户间转账隐藏后不再画账户 → 账户 link，但金额并入「其他」仍守恒。
    expect(two.links.some((link) => link.kind === 'transfer')).toBe(false)
    expect(two.transferTotal).toBe(sankey.transferTotal)
    expect(two.difference).toBe(0)
    for (const data of [one, two, all]) {
      const { container } = render(<CashSankeyChart data={data} onOpen={() => {}} />)
      const note = container.querySelector('.mb-rp-chart-note')?.textContent ?? ''
      expect(note).toContain(`已隐藏 ${data.hiddenGroups} 组，并入「其他」以保持守恒；`)
      cleanup()
    }
  })

  it('期初净额为负（负债大于资产）时走可见失败态，不静默画图', () => {
    const negativeLedger = {
      ...LEDGER,
      accounts: LEDGER.accounts.map((account) => ({ ...account, balance: -Math.abs(account.balance) })),
    }
    const negativeReport = mapCashReport(
      {
        ...CASH_FLOW,
        startCash: { actual: -209_120 },
        endCash: { actual: -179_560 },
      } as never,
      negativeLedger,
      FROM,
      TO,
    )
    const negative = deriveCashSankey(negativeLedger, negativeReport, ALL_VISIBLE)
    expect(negative.status).toBe('invalid')
    expect(negative.reason).toContain('三层桑基不适用')
  })

  it('守恒断言容差 ¥0.01：差 1 分放行，差 2 分抛错', () => {
    expect(assertCashSankeyConservation(10_000, 1_000, 500, 10_500)).toBe(0)
    expect(() => assertCashSankeyConservation(10_000, 1_000, 500, 10_498)).toThrow('现金流桑基不守恒')
  })

  it('十几项分类时按行带避让：同一列标签基线间距不小于 14px，图形随之变高', () => {
    const categories = Array.from({ length: 16 }, (_, index) => ({
      id: `dense_${index}`,
      name: `密集分类 ${index + 1}`,
      type: 'expense' as const,
    }))
    const denseTransactions = categories.map((category, index) => ({
      id: `dense_tx_${index}`,
      date: '2026-10-15',
      type: 'expense' as const,
      categoryId: category.id,
      note: '',
      accountId: 'wx',
      amount: 1_000 + index * 300,
    }))
    const denseLedger = makeLedger({
      accounts: [{ id: 'wx', name: '微信零钱', kind: 'cash', balance: 448_000 }],
      categories,
      transactions: denseTransactions,
    })
    const denseFlow = {
      cashInflow: { actual: 0 },
      cashOutflow: { actual: -52_000 },
      startCash: { actual: 500_000 },
      endCash: { actual: 448_000 },
      byActivity: {
        operating: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
        investing: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
        financing: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
        uncategorized: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
      },
      sankey: {
        nodes: [
          ...categories.map((category) => ({
            name: `${category.name}_expense`,
            category: 'expense_category',
          })),
          { name: '微信零钱_cash', category: 'cash' },
        ],
        links: categories.map((category, index) => ({
          source: '微信零钱_cash',
          target: `${category.name}_expense`,
          value: 1_000 + index * 300,
          actualValue: 1_000 + index * 300,
        })),
      },
    }
    const dense = deriveCashSankey(
      denseLedger,
      mapCashReport(denseFlow as never, denseLedger, FROM, TO),
      ALL_VISIBLE,
    )
    expect(dense.status).toBe('ready')
    const expenseNodes = dense.nodes.filter((node) => node.layer === 2)
    expect(expenseNodes.length).toBeGreaterThanOrEqual(16)
    const { container } = render(<CashSankeyChart data={dense} onOpen={() => {}} />)
    const rows = Array.from(container.querySelectorAll<SVGGElement>('.mb-rp-sankey-node[data-layer="2"]'))
      .map((node) => {
        const name = node.querySelector('.mb-rp-sankey-name')
        const value = node.querySelector('.mb-rp-sankey-value')
        return { name: Number(name?.getAttribute('y')), value: Number(value?.getAttribute('y')) }
      })
      .sort((left, right) => left.name - right.name)
    expect(rows.length).toBeGreaterThanOrEqual(16)
    for (let index = 1; index < rows.length; index += 1) {
      expect(rows[index].name - rows[index - 1].value).toBeGreaterThanOrEqual(14)
    }
    const viewBox = container.querySelector('.mb-rp-sankey-svg')?.getAttribute('viewBox') ?? ''
    expect(Number(viewBox.split(' ')[3])).toBeGreaterThan(600)
  })
})

function renderCashView(device: DeviceMode) {
  return render(
    <MantineProvider>
      <CashView
        device={device}
        report={report}
        sankey={sankey}
        side="out"
        onSide={() => {}}
        expanded={{}}
        onFold={() => {}}
        from={FROM}
        to={TO}
        onViewFlow={() => {}}
        rootOf={(id) => id}
      />
    </MantineProvider>,
  )
}

describe('现金流 tab 的平台降级', () => {
  it('390 不渲染桑基，仍用 Top5 横条', () => {
    const { container } = renderCashView('mobile')
    expect(container.querySelector('.mb-rp-sankey')).toBeNull()
    expect(container.querySelector('.mb-rp-flow-row')).not.toBeNull()
  })

  it('PC 渲染桑基并撤掉 Top5 横条', () => {
    const { container } = renderCashView('desktop')
    expect(container.querySelector('.mb-rp-sankey')).not.toBeNull()
    expect(container.querySelector('.mb-rp-flow-row')).toBeNull()
  })

  it('隐藏分组只在桑基图注说明，抽屉只列节点明细', async () => {
    const hiddenSankey = deriveCashSankey(LEDGER, report, { ...ALL_VISIBLE, 经营: false })
    const { container } = render(
      <MantineProvider>
        <CashView
          device="desktop"
          report={report}
          sankey={hiddenSankey}
          side="out"
          onSide={() => {}}
          expanded={{}}
          onFold={() => {}}
          from={FROM}
          to={TO}
          onViewFlow={() => {}}
          rootOf={(id) => id}
        />
      </MantineProvider>,
    )
    const chartNote = container.querySelector('.mb-rp-sankey .mb-rp-chart-note')?.textContent ?? ''
    expect(chartNote).toContain('已隐藏 1 组，并入「其他」以保持守恒；')
    fireEvent.click(container.querySelector('.mb-rp-sankey-node[data-id="in:hidden"] .mb-rp-sankey-node-hit')!)
    await waitFor(() => expect(container.querySelector('.mb-rp-drill')).not.toBeNull())
    // 前端不再提供隐藏分组开关，抽屉不再重复「已隐藏 N 组 / 图与表合计允许不同」。
    const drawerNote = container.querySelector('.mb-rp-drill .mb-rp-chart-note')?.textContent ?? ''
    expect(drawerNote).not.toContain('已隐藏')
    expect(container.querySelector('.mb-rp-drill .mb-rp-drill-head')).not.toBeNull()
  })
})
