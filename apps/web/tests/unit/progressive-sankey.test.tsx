/**
 * 渐进式现金流桑基：组 → 成员两级展开。
 *
 * 守护口径：初始每个一级分类 / 账户分类折叠成组节点；点击展开直接成员，
 * 再点成员收起；不展开更深层级。投影只改可见节点与连线，不改任何守恒合计。
 */
import { describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { CashSankeyChart } from '@/features/reports/CashSankey'
import { frameProgress, interpolateSankeyFrame, type SankeyFrame } from '@/features/reports/useAnimatedSankeyFrame'
import { mapCashReport } from '@/features/reports/apiReports'
import { assignNodeActivities, deriveCashSankey, projectCashSankey, sankeyOrder, type CashSankey, type CashSankeyLink, type CashSankeyNode } from '@/features/reports/cashSankeyModel'
import { makeLedger } from '../helpers/ledger'

/** 账户分类「现金」组：a1 / a2；一级收入分类「餐饮」组：午餐 / 外食；独立支出「房租」。 */
function fixture(): CashSankey {
  const node = (partial: Partial<CashSankeyNode> & Pick<CashSankeyNode, 'id' | 'name' | 'layer' | 'tone' | 'amount'>): CashSankeyNode => ({
    children: [],
    groupId: `self:${partial.id}`,
    groupName: partial.name,
    expandable: false,
    origin: partial.layer === 1 ? 'account' : 'category',
    rank: 0,
    memberIndex: 0,
    ...partial,
  })
  const a1 = node({
    id: 'acct:a1', name: '微信', layer: 1, tone: 'neutral', amount: 30_000,
    groupId: 'grp:acctcat:cash', groupName: '现金', expandable: true, rank: 0, memberIndex: 0,
  })
  const a2 = node({
    id: 'acct:a2', name: '支付宝', layer: 1, tone: 'neutral', amount: 20_000,
    groupId: 'grp:acctcat:cash', groupName: '现金', expandable: true, rank: 0, memberIndex: 1,
  })
  const lunch = node({
    id: 'in:food_lunch', name: '午餐', layer: 0, tone: 'income', amount: 30_000,
    groupId: 'grp:cat:in:food', groupName: '餐饮', expandable: true, rank: 2, memberIndex: 0,
  })
  const takeout = node({
    id: 'in:food_takeout', name: '外食', layer: 0, tone: 'income', amount: 20_000,
    groupId: 'grp:cat:in:food', groupName: '餐饮', expandable: true, rank: 2, memberIndex: 1,
  })
  const rent = node({ id: 'out:rent', name: '房租', layer: 2, tone: 'expense', amount: 50_000, rank: 3 })
  return {
    status: 'ready',
    opening: 100_000, closing: 100_000, inflow: 50_000, outflow: 50_000,
    fee: 0, correction: 0, difference: 0, hiddenGroups: 0, transferTotal: 10_000,
    nodes: [a1, a2, lunch, takeout, rent],
    links: [
      { id: 'l1', sourceId: 'in:food_lunch', targetId: 'acct:a1', nodeId: 'in:food_lunch', amount: 30_000, tone: 'income', kind: 'flow' },
      { id: 'l2', sourceId: 'in:food_takeout', targetId: 'acct:a1', nodeId: 'in:food_takeout', amount: 20_000, tone: 'income', kind: 'flow' },
      { id: 'l3', sourceId: 'acct:a1', targetId: 'acct:a2', nodeId: 'acct:a1', amount: 10_000, tone: 'neutral', kind: 'transfer' },
      { id: 'l4', sourceId: 'acct:a1', targetId: 'out:rent', nodeId: 'out:rent', amount: 50_000, tone: 'expense', kind: 'flow' },
    ],
    accounts: [],
  }
}

const totals = (data: CashSankey) => ({
  opening: data.opening, closing: data.closing, inflow: data.inflow,
  outflow: data.outflow, difference: data.difference, transferTotal: data.transferTotal,
})

describe('projectCashSankey：组 → 成员投影', () => {
  it('默认折叠：一级分类与账户分类各成一个组节点', () => {
    const view = projectCashSankey(fixture(), new Set())
    const ids = view.nodes.map((node) => node.id).sort()
    expect(ids).toEqual(['grp:acctcat:cash', 'grp:cat:in:food', 'out:rent'])
    const cashGroup = view.nodes.find((node) => node.id === 'grp:acctcat:cash')!
    const foodGroup = view.nodes.find((node) => node.id === 'grp:cat:in:food')!
    expect(cashGroup.isGroup).toBe(true)
    expect(cashGroup.name).toBe('现金')
    expect(foodGroup.isGroup).toBe(true)
    expect(foodGroup.name).toBe('餐饮')
  })

  it('折叠后合计字段与守恒完全不变', () => {
    const data = fixture()
    expect(totals(projectCashSankey(data, new Set()))).toEqual(totals(data))
    expect(totals(projectCashSankey(data, new Set(['grp:acctcat:cash', 'grp:cat:in:food'])))).toEqual(totals(data))
  })

  it('组内互转折叠成自环时不画连线，展开账户分类后恢复 transfer', () => {
    const collapsed = projectCashSankey(fixture(), new Set())
    expect(collapsed.links.some((link) => link.kind === 'transfer')).toBe(false)
    const expanded = projectCashSankey(fixture(), new Set(['grp:acctcat:cash']))
    expect(expanded.links.some((link) => link.kind === 'transfer' && link.sourceId === 'acct:a1' && link.targetId === 'acct:a2')).toBe(true)
  })

  it('展开一级分类显示二级分类，展开账户分类显示账户', () => {
    const view = projectCashSankey(fixture(), new Set(['grp:cat:in:food', 'grp:acctcat:cash']))
    const ids = view.nodes.map((node) => node.id)
    expect(ids).toContain('in:food_lunch')
    expect(ids).toContain('in:food_takeout')
    expect(ids).toContain('acct:a1')
    expect(ids).toContain('acct:a2')
    expect(ids).not.toContain('grp:cat:in:food')
    expect(ids).not.toContain('grp:acctcat:cash')
    for (const node of view.nodes.filter((n) => n.layer !== 2)) {
      expect(node.isGroup).toBe(false)
      expect(node.expandable).toBe(true) // 成员可点击收起
    }
  })

  it('展开一个组不改变其他节点的相对顺序', () => {
    const base = projectCashSankey(fixture(), new Set())
    const rentBase = base.nodes.find((node) => node.id === 'out:rent')!
    const expanded = projectCashSankey(fixture(), new Set(['grp:cat:in:food']))
    const rentExpanded = expanded.nodes.find((node) => node.id === 'out:rent')!
    expect(rentExpanded.rank).toBe(rentBase.rank)
    expect(expanded.nodes.filter((n) => n.origin === 'account').map((n) => n.rank)).toEqual(
      base.nodes.filter((n) => n.origin === 'account').map((n) => n.rank),
    )
  })

  it('单成员组原样保留，不丢失账户读数语义', () => {
    const view = projectCashSankey(fixture(), new Set())
    expect(view.nodes.find((node) => node.id === 'out:rent')?.name).toBe('房租')
  })
})

describe('CashSankeyChart：点击展开 / 收起', () => {
  it('点击组节点展开成员，再点成员收起', () => {
    const { container } = render(<CashSankeyChart data={fixture()} device="desktop" animate={false} />)
    const cashGroup = () => container.querySelector<SVGGElement>('.mb-rp-sankey-node[data-id="grp:acctcat:cash"]')
    expect(cashGroup()).not.toBeNull()
    expect(cashGroup()?.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(cashGroup()!)
    expect(container.querySelector('[data-id="grp:acctcat:cash"]')).toBeNull()
    const a1 = container.querySelector<SVGGElement>('.mb-rp-sankey-node[data-id="acct:a1"]')!
    expect(a1).not.toBeNull()
    expect(a1.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(a1)
    expect(container.querySelector('[data-id="grp:acctcat:cash"]')).not.toBeNull()
    cleanup()
  })

  it('键盘 Enter / 空格可展开，数据层守恒仍为 0', () => {
    const { container } = render(<CashSankeyChart data={fixture()} device="desktop" animate={false} />)
    const foodGroup = container.querySelector<SVGGElement>('.mb-rp-sankey-node[data-id="grp:cat:in:food"]')!
    fireEvent.keyDown(foodGroup, { key: 'Enter' })
    expect(container.querySelector('[data-id="in:food_lunch"]')).not.toBeNull()
    expect(container.querySelector('.mb-rp-sankey-check')).toBeNull()
    cleanup()
  })

  it('移动端 Top N 聚合与渐进式投影叠加：组可展开，无守恒脚注 DOM', () => {
    const { container } = render(<CashSankeyChart data={fixture()} device="mobile" animate={false} />)
    // 移动端仍渲染桑基，组节点可见且可点击展开
    expect(container.querySelector('.mb-rp-sankey-svg')).not.toBeNull()
    const cashGroup = container.querySelector<SVGGElement>('.mb-rp-sankey-node[data-id="grp:acctcat:cash"]')!
    expect(cashGroup).not.toBeNull()
    fireEvent.click(cashGroup)
    expect(container.querySelector('[data-id="acct:a1"]')).not.toBeNull()
    expect(container.querySelector('.mb-rp-sankey-check')).toBeNull()
    cleanup()
  })

  it('移动端 SVG 标记 data-device；无测量时 viewBox 回落 360，桌面端固定 1080', () => {
    const mobile = render(<CashSankeyChart data={fixture()} device="mobile" animate={false} />)
    const svg = mobile.container.querySelector('.mb-rp-sankey-svg')!
    expect(svg.getAttribute('data-device')).toBe('mobile')
    expect(svg.getAttribute('viewBox')?.split(' ')[2]).toBe('360')
    cleanup()
    const desktop = render(<CashSankeyChart data={fixture()} device="desktop" animate={false} />)
    const dsvg = desktop.container.querySelector('.mb-rp-sankey-svg')!
    expect(dsvg.getAttribute('data-device')).toBe('desktop')
    expect(dsvg.getAttribute('viewBox')?.split(' ')[2]).toBe('1080')
    cleanup()
  })

  it('移动端 viewBox 宽度跟随容器实测宽度，保证 SVG 内文字按真实 px 渲染不缩放', () => {
    // 模拟 ResizeObserver 测到容器 338px：viewBox 宽度应等于 338，1 单位 = 1 CSS px。
    const originalRO = globalThis.ResizeObserver
    const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    let roCallback: ResizeObserverCallback = () => {}
    class MockRO {
      constructor(cb: ResizeObserverCallback) { roCallback = cb }
      observe() { roCallback([], this as unknown as ResizeObserver) }
      disconnect() {}
      unobserve() {}
    }
    globalThis.ResizeObserver = MockRO as unknown as typeof ResizeObserver
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 338 })
    try {
      let container!: HTMLElement
      act(() => {
        container = render(<CashSankeyChart data={fixture()} device="mobile" animate={false} />).container
      })
      const svg = container.querySelector('.mb-rp-sankey-svg')!
      expect(svg.getAttribute('viewBox')?.split(' ')[2]).toBe('338')
    } finally {
      globalThis.ResizeObserver = originalRO
      if (originalWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalWidth)
      else delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth
    }
    cleanup()
  })
})

describe('deriveCashSankey：真实账本下的分组身份', () => {
  const FROM = '2026-10-01'
  const TO = '2026-10-31'
  const LEDGER = makeLedger({
    accountCategories: [
      { id: 'grp-cash', name: '现金钱包', type: 'asset', sort: 0 },
      { id: 'grp-inv', name: '投资', type: 'asset', sort: 1 },
    ],
    accounts: [
      { id: 'wx', name: '微信', kind: 'cash', balance: 119_560, categoryId: 'grp-cash' },
      { id: 'zfb', name: '支付宝', kind: 'cash', balance: 60_000, categoryId: 'grp-cash' },
    ],
    categories: [
      { id: 'salary', name: '工资', type: 'income' },
      { id: 'food', name: '餐饮', type: 'expense' },
      { id: 'food_lunch', name: '午餐', type: 'expense', parentId: 'food' },
      { id: 'food_takeout', name: '外食', type: 'expense', parentId: 'food' },
      { id: 'fee', name: '手续费', type: 'expense' },
      { id: 'other', name: '其他', type: 'expense' },
      { id: 'move', name: '账户互转', type: 'transfer' },
    ],
    transactions: [
      { id: 't1', date: '2026-10-05', type: 'income', categoryId: 'salary', note: '', accountId: 'wx', amount: 50_000 },
      { id: 't2', date: '2026-10-08', type: 'expense', categoryId: 'food_lunch', note: '', accountId: 'wx', amount: 20_000 },
      { id: 't3', date: '2026-10-12', type: 'transfer', categoryId: 'move', note: '', accountId: 'wx', toAccountId: 'zfb', amount: 10_000, fee: 200 },
      { id: 't4', date: '2026-10-15', type: 'adjustment', categoryId: 'other', note: '', accountId: 'wx', amount: -240 },
    ],
  } as never)
  const FLOW = {
    cashInflow: { actual: 50_000 },
    cashOutflow: { actual: -20_440 },
    startCash: { actual: 150_000 },
    endCash: { actual: 179_560 },
    byActivity: {
      operating: {
        inflow: { actual: 50_000 }, outflow: { actual: -20_000 }, net: { actual: 30_000 },
        items: [
          { categoryName: '工资', categoryId: 'salary', actual: 50_000, direction: 'inflow', type: 'income' },
          { categoryName: '午餐', categoryId: 'food_lunch', actual: -20_000, direction: 'outflow', type: 'expense' },
        ],
      },
      investing: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
      financing: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
      uncategorized: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
    },
    sankey: {
      nodes: [
        { id: 'in:salary', name: '工资', nodeType: 'income_category', side: 'in', group: null },
        { id: 'out:food_lunch', name: '午餐', nodeType: 'expense_category', side: 'out',
          group: { id: 'grp:cat:out:food', name: '餐饮', expandable: true } },
        { id: 'out:food_takeout', name: '外食', nodeType: 'expense_category', side: 'out',
          group: { id: 'grp:cat:out:food', name: '餐饮', expandable: true } },
        { id: 'out:fee', name: '手续费', nodeType: 'expense_category', side: 'out', group: null },
        { id: 'acct:wx', name: '微信', nodeType: 'cash', side: 'account',
          group: { id: 'grp:acctcat:grp-cash', name: '现金钱包', expandable: true } },
        { id: 'acct:zfb', name: '支付宝', nodeType: 'cash', side: 'account',
          group: { id: 'grp:acctcat:grp-cash', name: '现金钱包', expandable: true } },
      ],
      links: [
        { source: 'in:salary', target: 'acct:wx', value: 50_000, actualValue: 50_000 },
        { source: 'acct:wx', target: 'out:food_lunch', value: 10_000, actualValue: 10_000 },
        { source: 'acct:wx', target: 'out:food_takeout', value: 10_000, actualValue: 10_000 },
        { source: 'acct:wx', target: 'out:fee', value: 200, actualValue: 200 },
        { source: 'acct:wx', target: 'acct:zfb', value: 10_000, actualValue: 10_000 },
      ],
    },
  }
  const fine = deriveCashSankey(LEDGER, mapCashReport(FLOW as never, LEDGER, FROM, TO), {})

  it('账户节点按账户分类归组，同名组可展开', () => {
    expect(fine.status).toBe('ready')
    const accounts = fine.nodes.filter((node) => node.layer === 1)
    expect(accounts.length).toBeGreaterThanOrEqual(2)
    for (const account of accounts) {
      expect(account.groupId).toBe('grp:acctcat:grp-cash')
      expect(account.groupName).toBe('现金钱包')
      expect(account.origin).toBe('account')
      expect(account.expandable).toBe(true)
    }
  })

  it('叶子分类保留在细图，按一级分类归组，可展开出二级', () => {
    const lunch = fine.nodes.find((node) => node.id === 'out:food_lunch')
    expect(lunch).toBeDefined()
    expect(lunch?.groupId).toBe('grp:cat:out:food')
    expect(lunch?.groupName).toBe('餐饮')
    const view = projectCashSankey(fine, new Set(['grp:cat:out:food']))
    expect(view.nodes.some((node) => node.id === 'out:food_lunch')).toBe(true)
    expect(view.nodes.some((node) => node.id === 'grp:cat:out:food')).toBe(false)
  })

  it('默认折叠后账户两节点并为一个账户分类组，展开又拆开', () => {
    const collapsed = projectCashSankey(fine, new Set())
    const cashGroup = collapsed.nodes.find((node) => node.id === 'grp:acctcat:grp-cash')
    expect(cashGroup?.isGroup).toBe(true)
    expect(cashGroup?.amount).toBeGreaterThan(0)
    const expanded = projectCashSankey(fine, new Set(['grp:acctcat:grp-cash']))
    expect(expanded.nodes.some((node) => node.id === 'acct:wx')).toBe(true)
    expect(expanded.nodes.some((node) => node.id === 'acct:zfb')).toBe(true)
  })
})

describe('deriveCashSankey：左右非现金节点按账户分类归组', () => {
  const FROM = '2026-10-01'
  const TO = '2026-10-31'
  const LEDGER = makeLedger({
    accountCategories: [
      { id: 'grp-cash', name: '现金钱包', type: 'asset', sort: 0 },
      { id: 'grp-inv', name: '投资账户', type: 'asset', sort: 1 },
    ],
    accounts: [
      { id: 'wx', name: '微信', kind: 'cash', balance: 70_000, categoryId: 'grp-cash' },
      { id: 'sec-in1', name: '证券甲', kind: 'investment', balance: 100_000, categoryId: 'grp-inv' },
      { id: 'sec-in2', name: '证券乙', kind: 'investment', balance: 50_000, categoryId: 'grp-inv' },
      { id: 'sec-out1', name: '证券丙', kind: 'investment', balance: 80_000, categoryId: 'grp-inv' },
      { id: 'sec-out2', name: '证券丁', kind: 'investment', balance: 60_000, categoryId: 'grp-inv' },
    ],
    categories: [{ id: 'move', name: '账户互转', type: 'transfer' }],
    transactions: [
      { id: 't1', date: '2026-10-05', type: 'transfer', categoryId: 'move', note: '', accountId: 'sec-in1', toAccountId: 'wx', amount: 10_000 },
      { id: 't2', date: '2026-10-06', type: 'transfer', categoryId: 'move', note: '', accountId: 'sec-in2', toAccountId: 'wx', amount: 5_000 },
      { id: 't3', date: '2026-10-07', type: 'transfer', categoryId: 'move', note: '', accountId: 'wx', toAccountId: 'sec-out1', amount: 8_000 },
      { id: 't4', date: '2026-10-08', type: 'transfer', categoryId: 'move', note: '', accountId: 'wx', toAccountId: 'sec-out2', amount: 4_000 },
    ],
  } as never)
  const FLOW = {
    cashInflow: { actual: 15_000 },
    cashOutflow: { actual: -12_000 },
    startCash: { actual: 67_000 },
    endCash: { actual: 70_000 },
    byActivity: {
      operating: {
        inflow: { actual: 15_000 }, outflow: { actual: -12_000 }, net: { actual: 3_000 },
        items: [
          { categoryName: '账户互转', categoryId: 'move', actual: 15_000, direction: 'inflow', type: 'transfer_in' },
          { categoryName: '账户互转', categoryId: 'move', actual: -12_000, direction: 'outflow', type: 'transfer_out' },
        ],
      },
      investing: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
      financing: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
      uncategorized: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
    },
    sankey: {
      nodes: [
        { id: 'in:ncs:move:sec-in1', name: '证券甲', nodeType: 'non_cash_source', side: 'in',
          group: { id: 'in:grp:acctcat:grp-inv', name: '投资账户', expandable: true } },
        { id: 'in:ncs:move:sec-in2', name: '证券乙', nodeType: 'non_cash_source', side: 'in',
          group: { id: 'in:grp:acctcat:grp-inv', name: '投资账户', expandable: true } },
        { id: 'out:nct:move:sec-out1', name: '证券丙', nodeType: 'non_cash_target', side: 'out',
          group: { id: 'out:grp:acctcat:grp-inv', name: '投资账户', expandable: true } },
        { id: 'out:nct:move:sec-out2', name: '证券丁', nodeType: 'non_cash_target', side: 'out',
          group: { id: 'out:grp:acctcat:grp-inv', name: '投资账户', expandable: true } },
        { id: 'acct:wx', name: '微信', nodeType: 'cash', side: 'account',
          group: { id: 'grp:acctcat:grp-cash', name: '现金钱包', expandable: false } },
      ],
      links: [
        { source: 'in:ncs:move:sec-in1', target: 'acct:wx', value: 10_000, actualValue: 10_000 },
        { source: 'in:ncs:move:sec-in2', target: 'acct:wx', value: 5_000, actualValue: 5_000 },
        { source: 'acct:wx', target: 'out:nct:move:sec-out1', value: 8_000, actualValue: 8_000 },
        { source: 'acct:wx', target: 'out:nct:move:sec-out2', value: 4_000, actualValue: 4_000 },
      ],
    },
  }
  const fine = deriveCashSankey(LEDGER, mapCashReport(FLOW as never, LEDGER, FROM, TO), {})

  it('左右非现金节点都按账户分类归组，且两侧不合并', () => {
    expect(fine.status).toBe('ready')
    const left = fine.nodes.filter((node) => node.layer === 0)
    const right = fine.nodes.filter((node) => node.layer === 2)
    expect(left.map((node) => node.id).sort()).toEqual(['in:ncs:move:sec-in1', 'in:ncs:move:sec-in2'])
    expect(right.map((node) => node.id).sort()).toEqual(['out:nct:move:sec-out1', 'out:nct:move:sec-out2'])
    for (const node of [...left, ...right]) {
      expect(node.groupName).toBe('投资账户')
      expect(node.expandable).toBe(true)
    }
    expect(new Set([...left, ...right].map((node) => node.groupId))).toEqual(
      new Set(['in:grp:acctcat:grp-inv', 'out:grp:acctcat:grp-inv']),
    )
  })

  it('默认折叠左右各显示一个账户分类，展开才显示各自账户', () => {
    const collapsed = projectCashSankey(fine, new Set())
    const groups = collapsed.nodes.filter((node) => node.layer === 0 || node.layer === 2)
    expect(groups.map((node) => node.name)).toEqual(['投资账户', '投资账户'])
    for (const group of groups) expect(group.isGroup).toBe(true)
    expect(collapsed.nodes.some((node) => node.name === '证券甲')).toBe(false)

    const expanded = projectCashSankey(fine, new Set(['in:grp:acctcat:grp-inv', 'out:grp:acctcat:grp-inv']))
    expect(expanded.nodes.some((node) => node.id === 'in:ncs:move:sec-in1')).toBe(true)
    expect(expanded.nodes.some((node) => node.id === 'out:nct:move:sec-out1')).toBe(true)
    expect(totals(expanded)).toEqual(totals(fine))
  })
})

describe('CashSankeyChart：现金流活动着色与图例', () => {
  it('ribbon 按活动着色，内部转账用 transfer，图例给出文字冗余编码', () => {
    const base = fixture()
    const data: CashSankey = {
      ...base,
      nodes: base.nodes.map((node) => ({
        ...node,
        activity: node.id === 'in:food_lunch' ? 'operating'
          : node.id === 'in:food_takeout' ? 'investing'
            : node.id === 'out:rent' ? 'financing'
              : null,
      })),
      links: [
        { ...base.links[0], id: 'a1', activity: 'operating' },
        { ...base.links[1], id: 'a2', activity: 'investing' },
        { ...base.links[2], id: 'a3', activity: null },
        { ...base.links[3], id: 'a4', activity: 'financing' },
      ],
    }
    const { container } = render(<CashSankeyChart data={data} device="desktop" animate={false} />)
    fireEvent.click(container.querySelector('[data-id="grp:acctcat:cash"]')!)
    fireEvent.click(container.querySelector('[data-id="grp:cat:in:food"]')!)
    for (const activity of ['operating', 'investing', 'financing']) {
      expect(container.querySelector(`.mb-rp-sankey-tone--${activity} .mb-rp-sankey-ribbon`)).not.toBeNull()
      expect(container.querySelector(`.mb-rp-sankey-tone--${activity} .mb-rp-sankey-node-body`)).not.toBeNull()
    }
    expect(container.querySelector('.mb-rp-sankey-tone--transfer .mb-rp-sankey-ribbon')).not.toBeNull()
    const legend = container.querySelectorAll('.mb-rp-sankey-legend-item')
    expect(Array.from(legend).map((item) => item.textContent)).toEqual(['经营', '投资', '筹资', '其他'])
    cleanup()
  })

  it('活动不同的同端点流水不合并，同活动仍聚合成一条', () => {
    const base = fixture()
    const first = { ...base.links[0], id: 'a1', activity: 'operating' as const }
    const second = { ...first, id: 'a2', activity: 'investing' as const }
    const third = { ...first, id: 'a3' }
    const data: CashSankey = { ...base, links: [first, second, third] }
    const view = projectCashSankey(data, new Set())
    // 经营与投资拆两条；两条经营聚合到同一 id，金额相加。
    expect(view.links).toHaveLength(2)
    expect(new Set(view.links.map((link) => link.id)).size).toBe(2)
    expect(view.links.some((link) => link.activity === 'investing')).toBe(true)
    const operating = view.links.find((link) => link.activity === 'operating')!
    expect(operating.amount).toBe(first.amount + third.amount)
  })
})

describe('桑基展开折叠动画：几何插值', () => {
  const mkNode = (id: string, y: number, h: number, groupId?: string, isGroup = false) => ({
    id, groupId, isGroup, x: 0, y, h, opacity: 1, render: { id },
  })
  const mkLink = (id: string, y1: number, y2: number, height: number) => ({
    id, x1: 0, x2: 1, y1, y2, height, opacity: 1, transfer: false, render: { id },
  })
  const from: SankeyFrame = {
    nodes: new Map([
      ['a', mkNode('a', 10, 20)],
      ['gone', mkNode('gone', 30, 40)],
    ]),
    links: new Map([
      ['l1', mkLink('l1', 10, 30, 5)],
      ['l-gone', mkLink('l-gone', 1, 2, 3)],
    ]),
    height: 100,
  }
  const to: SankeyFrame = {
    nodes: new Map([
      ['a', mkNode('a', 50, 60)],
      ['fresh', mkNode('fresh', 70, 80)],
    ]),
    links: new Map([
      ['l1', mkLink('l1', 50, 70, 9)],
      ['l-fresh', mkLink('l-fresh', 4, 5, 6)],
    ]),
    height: 140,
  }

  it('共有元素按 t 插值，t=0 回落起点、t=1 落到终点', () => {
    const start = interpolateSankeyFrame(from, to, 0)
    expect(start.nodes.get('a')).toMatchObject({ y: 10, h: 20, opacity: 1 })
    const end = interpolateSankeyFrame(from, to, 1)
    expect(end.nodes.get('a')).toMatchObject({ y: 50, h: 60, opacity: 1 })
    const mid = interpolateSankeyFrame(from, to, 0.5)
    expect(mid.nodes.get('a')).toMatchObject({ y: 30, h: 40, opacity: 1 })
    expect(mid.links.get('l1')).toMatchObject({ y1: 30, y2: 50, height: 7, opacity: 1 })
    expect(mid.height).toBe(120)
  })

  it('新 key 线性淡入：t=0 透明、t=1 到位', () => {
    expect(interpolateSankeyFrame(from, to, 0).nodes.get('fresh')?.opacity).toBe(0)
    expect(interpolateSankeyFrame(from, to, 0.5).nodes.get('fresh')?.opacity).toBeCloseTo(0.5)
    expect(interpolateSankeyFrame(from, to, 1).nodes.get('fresh')?.opacity).toBe(1)
    expect(interpolateSankeyFrame(from, to, 1).nodes.get('fresh')).toMatchObject({ y: 70, h: 80 })
  })

  it('退出 key 线性淡出，t=1 归零', () => {
    expect(interpolateSankeyFrame(from, to, 0.5).nodes.get('gone')?.opacity).toBeCloseTo(0.5)
    expect(interpolateSankeyFrame(from, to, 0.5).links.get('l-gone')?.opacity).toBeCloseTo(0.5)
    expect(interpolateSankeyFrame(from, to, 1).nodes.get('gone')?.opacity).toBe(0)
  })

  it('互补交接：任一时刻进入与退出的 opacity 之和恒为 1（无空档、无重影）', () => {
    for (const t of [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1]) {
      const frame = interpolateSankeyFrame(from, to, t)
      const sum = (frame.nodes.get('fresh')?.opacity ?? 0) + (frame.nodes.get('gone')?.opacity ?? 0)
      expect(sum).toBeCloseTo(1)
    }
  })

  it('组↔成员桥接：展开时成员从组几何散开，收起时成员向组几何聚拢', () => {
    // 展开：from 有组节点 grp:g，to 有两个成员指向 grp:g
    const collapsed: SankeyFrame = {
      ...from,
      nodes: new Map([['grp:g', mkNode('grp:g', 30, 100, 'grp:g', true)]]),
      links: new Map(),
    }
    const expanded: SankeyFrame = {
      ...to,
      nodes: new Map([
        ['m1', mkNode('m1', 10, 45, 'grp:g')],
        ['m2', mkNode('m2', 85, 45, 'grp:g')],
      ]),
      links: new Map(),
    }
    // t=0：成员起点落在组的位置（散开前）
    const opening = interpolateSankeyFrame(collapsed, expanded, 0)
    expect(opening.nodes.get('m1')).toMatchObject({ y: 30, h: 100, opacity: 0 })
    expect(opening.nodes.get('m2')).toMatchObject({ y: 30, h: 100, opacity: 0 })
    // t=1：成员各就各位
    const opened = interpolateSankeyFrame(collapsed, expanded, 1)
    expect(opened.nodes.get('m1')).toMatchObject({ y: 10, h: 45, opacity: 1 })
    // 收起：成员退出并聚拢回组几何（t=0 起于成员、t=1 落到组）
    const closingStart = interpolateSankeyFrame(expanded, collapsed, 0)
    const closingEnd = interpolateSankeyFrame(expanded, collapsed, 1)
    expect(closingStart.nodes.get('m1')).toMatchObject({ y: 10, h: 45, opacity: 1 })
    expect(closingEnd.nodes.get('m1')).toMatchObject({ y: 30, h: 100, opacity: 0 })
    // 组节点作为新元素从自身几何淡入
    expect(interpolateSankeyFrame(expanded, collapsed, 0).nodes.get('grp:g')?.opacity).toBe(0)
  })

  it('纯函数：不修改入参', () => {
    const fromSnapshot = [...from.nodes].map(([k, v]) => [k, { ...v }])
    interpolateSankeyFrame(from, to, 0.5)
    expect([...from.nodes].map(([k, v]) => [k, { ...v }])).toEqual(fromSnapshot)
  })
})

describe('CashSankeyChart：动画开关', () => {
  it('animate=false 时关闭动画，点击后新成员直接以终态几何出现（opacity=1）', () => {
    const { container } = render(<CashSankeyChart data={fixture()} device="desktop" animate={false} />)
    const cashGroup = container.querySelector<SVGGElement>('.mb-rp-sankey-node[data-id="grp:acctcat:cash"]')!
    fireEvent.click(cashGroup)
    const a1 = container.querySelector<SVGGElement>('.mb-rp-sankey-node[data-id="acct:a1"]')!
    expect(a1).not.toBeNull()
    expect(a1.getAttribute('opacity')).toBe('1')
    cleanup()
  })
})

describe('桑基动画：帧进度（首帧不得跳到终点）', () => {
  it('首帧以当前 now 为起点，t=0', () => {
    const first = frameProgress(1000, 0, 420)
    expect(first).toEqual({ t: 0, start: 1000 })
  })

  it('随后帧相对首帧推进，t 单调递增', () => {
    const first = frameProgress(1000, 0, 420)
    const mid = frameProgress(1210, first.start, 420)
    const end = frameProgress(1420, first.start, 420)
    expect(mid.t).toBeCloseTo(0.5)
    expect(end.t).toBe(1)
  })

  it('now 早于 start（帧时间戳错位）时 t 钳制为 0，不外插跳变', () => {
    expect(frameProgress(900, 1000, 420).t).toBe(0)
  })

  it('超过时长 t 钳制为 1，末尾才到终点', () => {
    expect(frameProgress(9999, 1000, 420).t).toBe(1)
  })
})

describe('CashSankeyChart：连续动画不闪现（回归）', () => {
  const opacityOf = (container: HTMLElement, id: string) =>
    container.querySelector<SVGGElement>(`.mb-rp-sankey-node[data-id="${id}"]`)?.getAttribute('opacity')

  it('展开→收起→展开：每轮进入元素首帧从透明开始，退出元素不残留到下一轮', () => {
    let cbs: Array<(now: number) => void> = []
    vi.stubGlobal('requestAnimationFrame', (cb: (now: number) => void) => { cbs.push(cb); return cbs.length })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const container = render(<CashSankeyChart data={fixture()} device="desktop" animate />).container

    const finish = () => {
      let now = 1000
      let step = 0
      while (cbs.length && step < 12) {
        const cb = cbs.shift()!
        now += 420 / 6
        act(() => { cb(now) })
        step++
      }
    }

    // R1 展开：成员首帧透明，末帧组退出且被清除（不在 DOM 中）
    cbs = []
    act(() => { fireEvent.click(container.querySelector('[data-id="grp:acctcat:cash"]')!) })
    expect(opacityOf(container, 'acct:a1')).toBe('0')
    finish()
    expect(container.querySelector('[data-id="grp:acctcat:cash"]')).toBeNull()

    // R2 收起：组作为进入元素首帧必须透明（旧 bug 会闪成 1）
    cbs = []
    act(() => { fireEvent.click(container.querySelector('[data-id="acct:a1"]')!) })
    expect(opacityOf(container, 'grp:acctcat:cash')).toBe('0')
    finish()
    expect(container.querySelector('[data-id="acct:a1"]')).toBeNull()

    // R3 再展开：成员首帧仍透明，末帧稳定
    cbs = []
    act(() => { fireEvent.click(container.querySelector('[data-id="grp:acctcat:cash"]')!) })
    expect(opacityOf(container, 'acct:a1')).toBe('0')
    finish()
    expect(opacityOf(container, 'acct:a1')).toBe('1')
    expect(container.querySelector('[data-id="grp:acctcat:cash"]')).toBeNull()

    cleanup()
    vi.unstubAllGlobals()
  })
})

// ===== 回归：单成员账户分类组 / 活动色排序 / 标签垂直居中 =====
describe('桑基分组与排序口径修复', () => {
  const mkNode = (
    id: string, name: string, layer: 0 | 1 | 2, amount: number,
    groupId: string | undefined, groupName: string | undefined,
    activity: CashSankeyNode['activity'],
  ): CashSankeyNode => ({
    id, name, layer, tone: 'neutral', amount, children: [],
    groupId, groupName, expandable: false,
    origin: layer === 1 ? 'account' : 'category',
    rank: 0, memberIndex: 0, activity,
  })
  const mkLink = (sourceId: string, targetId: string, amount: number, activity: CashSankeyNode['activity']) => ({
    id: `${sourceId}>${targetId}|flow|${activity ?? 'none'}`,
    sourceId, targetId, nodeId: targetId, amount, tone: 'neutral' as const,
    kind: 'flow' as const, activity,
  })
  const baseData = (nodes: CashSankeyNode[], links: ReturnType<typeof mkLink>[]): CashSankey => ({
    status: 'ready', opening: 100_000, closing: 100_000, inflow: 0, outflow: 0,
    fee: 0, correction: 0, difference: 0, hiddenGroups: 0, transferTotal: 0,
    accounts: [], nodes, links,
  })

  it('单成员账户分类组默认折叠显示一级分类名，点击可展开账户名再收起', () => {
    // 复现真实数据形态：右侧「投资」账户分类下只有一个非现金端点（买入）。
    const data = baseData(
      [
        mkNode('acct:wx', '微信', 1, 10_000, 'grp-cash', '现金', null),
        mkNode('out:nct:buy:xq', '雪球基金', 2, 10_000, 'out:grp-inv', '投资', 'investing'),
      ],
      [mkLink('acct:wx', 'out:nct:buy:xq', 10_000, 'investing')],
    )
    const collapsed = projectCashSankey(data, new Set())
    const right = collapsed.nodes.filter((n) => n.layer === 2)
    expect(right).toHaveLength(1)
    expect(right[0]!.id).toBe('out:grp-inv')
    expect(right[0]!.name).toBe('投资')
    expect(right[0]!.isGroup).toBe(true)
    expect(right[0]!.expandable).toBe(true)
    const expanded = projectCashSankey(data, new Set(['out:grp-inv']))
    expect(expanded.nodes.find((n) => n.id === 'out:nct:buy:xq')?.name).toBe('雪球基金')
    // 无分组归属的 self: 节点仍原样显示自身名，且不可点击。
    const lone = baseData([mkNode('out:rent', '房租', 2, 5_000, 'self:out:rent', '房租', null)], [])
    const loneView = projectCashSankey(lone, new Set())
    expect(loneView.nodes[0]!.name).toBe('房租')
    expect(loneView.nodes[0]!.expandable).toBe(false)

    const { container } = render(<CashSankeyChart data={data} device="desktop" animate={false} />)
    const group = () => container.querySelector<SVGGElement>('.mb-rp-sankey-node[data-id="out:grp-inv"]')!
    expect(group().getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(group())
    const member = container.querySelector<SVGGElement>('.mb-rp-sankey-node[data-id="out:nct:buy:xq"]')!
    expect(member).not.toBeNull()
    expect(member.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(member)
    expect(container.querySelector('[data-id="out:grp-inv"]')).not.toBeNull()
    cleanup()
  })

  it('节点按活动类型→账户/分类→金额排序，同色相邻', () => {
    // 四组：经营/投资/筹资/中性，金额故意交错，验证活动类型优先于金额。
    const nodes = [
      mkNode('a:neutral', '其他', 0, 90_000, 'in:grp-neutral', '其他', null),
      mkNode('a:oper', '工资', 0, 10_000, 'in:grp-op', '工资', 'operating'),
      mkNode('a:inv', '分红', 0, 50_000, 'in:grp-inv', '分红', 'investing'),
      mkNode('a:fin', '借款', 0, 30_000, 'in:grp-fin', '借款', 'financing'),
      mkNode('acct:cash', '现金', 1, 90_000, 'grp-cash', '现金', null),
    ]
    // 账户类节点在同活动内排前；这里账户与「其他」同为中性，账户应更靠前。
    expect(nodes.slice().sort(sankeyOrder).map((n) => n.id)).toEqual([
      'a:oper', 'a:inv', 'a:fin', 'acct:cash', 'a:neutral',
    ])
  })

  it('标签相对节点垂直居中：分类节点名称/金额围绕节点中心', () => {
    const data = baseData(
      [
        mkNode('acct:wx', '微信', 1, 10_000, 'grp-cash', '现金', null),
        mkNode('out:rent', '房租', 2, 10_000, 'self:out:rent', '房租', 'operating'),
      ],
      [mkLink('acct:wx', 'out:rent', 10_000, 'operating')],
    )
    const { container } = render(<CashSankeyChart data={data} device="desktop" animate={false} />)
    const rent = container.querySelector<SVGGElement>('[data-id="out:rent"]')!
    const body = rent.querySelector('.mb-rp-sankey-node-body')!
    const name = rent.querySelector('.mb-rp-sankey-name')!
    const value = rent.querySelector('.mb-rp-sankey-value')!
    const y = (el: Element) => Number(el.getAttribute('y'))
    const gy = y(body)
    const gh = Number(body.getAttribute('height'))
    const cy = gy + gh / 2
    // 名称在中心上方、金额在中心下方，且都落在节点纵向范围内（相对居中而非顶部）。
    expect(y(name)).toBeLessThan(cy)
    expect(y(value)).toBeGreaterThan(cy)
    expect(y(name)).toBeGreaterThanOrEqual(gy)
    expect(y(value)).toBeLessThanOrEqual(gy + gh)
    cleanup()
  })

  it('现金账户列按相连流主导活动排序，与两侧活动顺序一致', () => {
    const accounts = [
      mkNode('acct:a', 'A', 1, 30_000, 'self:acct:a', 'A', null),
      mkNode('acct:b', 'B', 1, 90_000, 'self:acct:b', 'B', null),
      mkNode('acct:c', 'C', 1, 60_000, 'self:acct:c', 'C', null),
    ]
    const links: CashSankeyLink[] = [
      mkLink('in:op', 'acct:a', 30_000, 'operating'),
      mkLink('in:inv', 'acct:b', 90_000, 'investing'),
      mkLink('in:fin', 'acct:c', 60_000, 'financing'),
    ]
    assignNodeActivities(accounts, links)
    expect(accounts.map((node) => node.activity)).toEqual(['operating', 'investing', 'financing'])
    // 金额最大的账户 B 因活动排在投资，仍位于经营账户之后。
    expect(accounts.slice().sort(sankeyOrder).map((node) => node.id)).toEqual(['acct:a', 'acct:b', 'acct:c'])
  })

  it('最小 ribbon 与节点竖条共用最小高度，且 ribbon 不超出节点', () => {
    const data = baseData(
      [
        mkNode('acct:wx', '微信', 1, 100_000, 'self:acct:wx', '微信', null),
        mkNode('out:small', '手续费', 2, 1, 'self:out:small', '手续费', 'operating'),
      ],
      [mkLink('acct:wx', 'out:small', 1, 'operating')],
    )
    const { container } = render(<CashSankeyChart data={data} device="desktop" animate={false} />)
    // ribbonPath: M x y1 ... L x (y2+h) ...，第 8 / 10 个数即 y2 与 y2+h。
    const nums = container.querySelector('.mb-rp-sankey-ribbon')!.getAttribute('d')!
      .match(/-?\d+(?:\.\d+)?/g)!.map(Number)
    const ribbonH = nums[9] - nums[7]
    expect(ribbonH).toBe(5) // PC 的 minBandH
    const nodeH = Number(container.querySelector('[data-id="out:small"] .mb-rp-sankey-node-body')!
      .getAttribute('height'))
    // 节点条高度严格等于 ribbon 高度：只有一条带时二者重合，不再被两行文字撑到 32px。
    expect(nodeH).toBe(ribbonH)
    cleanup()
  })

  it('叶子一级分类（组名与成员名相同）无子类别，不可点击展开', () => {
    // 后端对叶子一级分类也下发 group，但组名就是自身名，展开只会显示同一节点。
    const leaf = baseData(
      [
        mkNode('acct:wx', '微信', 1, 10_000, 'self:acct:wx', '微信', null),
        // groupId='in:grp-cat'、groupName='工资' 与成员 name='工资' 相同 → 单成员叶子分类。
        { ...mkNode('in:salary', '工资', 0, 10_000, 'in:grp-cat', '工资', 'operating'), rank: 0 },
      ],
      [mkLink('acct:wx', 'in:salary', 10_000, 'operating')],
    )
    const view = projectCashSankey(leaf, new Set())
    const group = view.nodes.find((n) => n.id === 'in:grp-cat')!
    expect(group.expandable).toBe(false)
    expect(group.isGroup).toBe(false)

    const { container } = render(<CashSankeyChart data={leaf} device="desktop" animate={false} />)
    const el = container.querySelector<SVGGElement>('.mb-rp-sankey-node[data-id="in:grp-cat"]')!
    expect(el).not.toBeNull()
    expect(el.getAttribute('role')).toBeNull()
    expect(el.getAttribute('aria-expanded')).toBeNull()
    cleanup()
  })

  it('fee 与 coupon 同时存在：端到端守恒（逐账户 + 全局）都通过，图不被判 invalid', () => {
    // 后端 buildSankey 已把手续费 f=200、优惠券 c=300 独立画成两条 ribbon
    // （本金 X=10000）。这里模拟其 DTO 输出，验证前端账本回放 + 守恒断言能闭环。
    // 账本期初：wx=100000、zfb=50000；期末：wx=100000-(10000+200)=89800，
    // zfb=50000+(10000+300)=60300。账户 balance 是期末快照，回放按 X+f / X+c 反推。
    const FROM2 = '2026-11-01'
    const TO2 = '2026-11-30'
    const LEDGER2 = makeLedger({
      accounts: [
        { id: 'wx', name: '微信', kind: 'cash', balance: 89_800 },
        { id: 'zfb', name: '支付宝', kind: 'cash', balance: 60_300 },
      ],
      categories: [{ id: 'move', name: '账户互转', type: 'transfer' }],
      transactions: [
        { id: 't1', date: '2026-11-15', type: 'transfer', categoryId: 'move', note: '',
          accountId: 'wx', toAccountId: 'zfb', amount: 10_000, fee: 200, coupon: 300 },
      ],
    } as never)
    const FLOW2 = {
      cashInflow: { actual: 300 },
      cashOutflow: { actual: -200 },
      startCash: { actual: 150_000 },
      endCash: { actual: 150_100 },
      byActivity: {
        operating: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
        investing: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
        financing: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
        uncategorized: { inflow: { actual: 0 }, outflow: { actual: 0 }, net: { actual: 0 }, items: [] },
      },
      sankey: {
        nodes: [
          { id: 'acct:wx', name: '微信', nodeType: 'cash', side: 'account', group: null },
          { id: 'acct:zfb', name: '支付宝', nodeType: 'cash', side: 'account', group: null },
          { id: 'out:synthetic:fee', name: '手续费', nodeType: 'expense_category', side: 'out', group: null },
          { id: 'in:synthetic:coupon', name: '优惠券', nodeType: 'income_category', side: 'in', group: null },
        ],
        links: [
          { source: 'acct:wx', target: 'acct:zfb', value: 10_000, actualValue: 10_000 },
          { source: 'acct:wx', target: 'out:synthetic:fee', value: 200, actualValue: 200 },
          { source: 'in:synthetic:coupon', target: 'acct:zfb', value: 300, actualValue: 300 },
        ],
      },
    }
    const result = deriveCashSankey(LEDGER2, mapCashReport(FLOW2 as never, LEDGER2, FROM2, TO2), {})
    expect(result.status).toBe('ready')
    expect(result.status === 'invalid' ? result.reason : '').toBe('')
    // 逐账户：每条等式残差为 0。
    for (const account of result.accounts) {
      expect(account.difference).toBe(0)
    }
    // 全局：期初 150000 + 流入 300 − 流出 200 − 期末 150100 = 0。
    expect(result.inflow).toBe(300)
    expect(result.outflow).toBe(200)
    expect(result.difference).toBe(0)
  })

  it('中列出边按右列节点顺序堆叠，金额最大的投资带不横穿其他活动', () => {
    // 右列自上而下：经营 → 投资 → 筹资；金额故意倒挂（投资最大）来验证
    // ribbon 顺序跟随目标节点而不是金额，否则大带会从上端横穿所有绿色带。
    const data = baseData(
      [
        { ...mkNode('acct:wx', '微信', 1, 40_000, 'self:acct:wx', '微信', null), rank: 0 },
        { ...mkNode('out:op', '餐饮', 2, 3_000, 'self:out:op', '餐饮', 'operating'), rank: 1 },
        { ...mkNode('out:inv', '投资', 2, 31_000, 'self:out:inv', '投资', 'investing'), rank: 2 },
        { ...mkNode('out:fin', '负债', 2, 6_000, 'self:out:fin', '负债', 'financing'), rank: 3 },
      ],
      [
        mkLink('acct:wx', 'out:op', 3_000, 'operating'),
        mkLink('acct:wx', 'out:inv', 31_000, 'investing'),
        mkLink('acct:wx', 'out:fin', 6_000, 'financing'),
      ],
    )
    const { container } = render(<CashSankeyChart data={data} device="desktop" animate={false} />)
    const y2Of = (g: Element) => Number(g.querySelector('.mb-rp-sankey-ribbon')!.getAttribute('d')!
      .match(/-?\d+(?:\.\d+)?/g)![7])
    const targetY = (id: string) => Number(container.querySelector(`[data-id="${id}"] .mb-rp-sankey-node-body`)!
      .getAttribute('y'))
    const ribbons = [...container.querySelectorAll('.mb-rp-sankey-link')]
    const inv = ribbons.find((g) => g.classList.contains('mb-rp-sankey-tone--investing'))!
    const op = ribbons.find((g) => g.classList.contains('mb-rp-sankey-tone--operating'))!
    const fin = ribbons.find((g) => g.classList.contains('mb-rp-sankey-tone--financing'))!
    // 目标节点确实按活动顺序排列。
    expect(targetY('out:op')).toBeLessThan(targetY('out:inv'))
    expect(targetY('out:inv')).toBeLessThan(targetY('out:fin'))
    // 出边在账户节点上的起点 y1 也按目标顺序递增：无交叉。
    const startY = (g: Element) => Number(g.querySelector('.mb-rp-sankey-ribbon')!.getAttribute('d')!
      .match(/-?\d+(?:\.\d+)?/g)![1])
    expect(startY(op)).toBeLessThan(startY(inv))
    expect(startY(inv)).toBeLessThan(startY(fin))
    // y2 落在各自目标的入口，顺序同样递增。
    expect(y2Of(op)).toBeLessThan(y2Of(inv))
    expect(y2Of(inv)).toBeLessThan(y2Of(fin))
    cleanup()
  })
})

describe('移动端「其他 (N)」按活动独立聚合：稳定分组、带活动色、展开不重排', () => {
  // 收入侧按活动分桶，每桶 perActivityTop=3：
  //   operating 4 组（100/90/g4=80/70）→ top3 保留 100/90/g4，其他(1)=70
  //   investing 2 组（60/50）→ 全保留，无其他
  //   financing 1 组（40）→ 全保留，无其他
  // grp:g4(operating, 80) 是双成员组（50+30），可展开且稳定在 top3 内。
  const n = (
    partial: Partial<CashSankeyNode> & Pick<CashSankeyNode, 'id' | 'name' | 'layer' | 'tone' | 'amount'>,
  ): CashSankeyNode => ({
    children: [],
    groupId: `self:${partial.id}`,
    groupName: partial.name,
    expandable: false,
    origin: partial.layer === 1 ? 'account' : 'category',
    rank: 0,
    memberIndex: 0,
    activity: null,
    ...partial,
  })
  const act = (a: 'operating' | 'investing' | 'financing' | null) => a
  const mergedFixture = (): CashSankey => ({
    status: 'ready',
    opening: 420, closing: 420, inflow: 420, outflow: 100,
    fee: 0, correction: 0, difference: 0, hiddenGroups: 0, transferTotal: 0,
    nodes: [
      n({ id: 'in:g1', name: 'g1', layer: 0, tone: 'income', amount: 100, groupId: 'grp:g1', groupName: 'g1', rank: 0, activity: act('operating') }),
      n({ id: 'in:g2', name: 'g2', layer: 0, tone: 'income', amount: 90, groupId: 'grp:g2', groupName: 'g2', rank: 1, activity: act('operating') }),
      n({ id: 'in:g3', name: 'g3', layer: 0, tone: 'income', amount: 70, groupId: 'grp:g3', groupName: 'g3', rank: 2, activity: act('operating') }),
      n({ id: 'in:g4a', name: 'g4a', layer: 0, tone: 'income', amount: 50, groupId: 'grp:g4', groupName: 'g4', expandable: true, rank: 3, memberIndex: 0, activity: act('operating') }),
      n({ id: 'in:g4b', name: 'g4b', layer: 0, tone: 'income', amount: 30, groupId: 'grp:g4', groupName: 'g4', expandable: true, rank: 3, memberIndex: 1, activity: act('operating') }),
      n({ id: 'in:g6', name: 'g6', layer: 0, tone: 'income', amount: 60, groupId: 'grp:g6', groupName: 'g6', rank: 5, activity: act('investing') }),
      n({ id: 'in:g7', name: 'g7', layer: 0, tone: 'income', amount: 50, groupId: 'grp:g7', groupName: 'g7', rank: 6, activity: act('investing') }),
      n({ id: 'in:g8', name: 'g8', layer: 0, tone: 'income', amount: 40, groupId: 'grp:g8', groupName: 'g8', rank: 7, activity: act('financing') }),
      n({ id: 'acct:a1', name: '账户', layer: 1, tone: 'neutral', amount: 420, groupId: 'self:acct:a1' }),
      n({ id: 'out:rent', name: '房租', layer: 2, tone: 'expense', amount: 100, groupId: 'self:out:rent' }),
    ],
    links: [
      { id: 'l1', sourceId: 'in:g1', targetId: 'acct:a1', nodeId: 'in:g1', amount: 100, tone: 'income', kind: 'flow', activity: act('operating') },
      { id: 'l2', sourceId: 'in:g2', targetId: 'acct:a1', nodeId: 'in:g2', amount: 90, tone: 'income', kind: 'flow', activity: act('operating') },
      { id: 'l3', sourceId: 'in:g3', targetId: 'acct:a1', nodeId: 'in:g3', amount: 70, tone: 'income', kind: 'flow', activity: act('operating') },
      { id: 'l4a', sourceId: 'in:g4a', targetId: 'acct:a1', nodeId: 'in:g4a', amount: 50, tone: 'income', kind: 'flow', activity: act('operating') },
      { id: 'l4b', sourceId: 'in:g4b', targetId: 'acct:a1', nodeId: 'in:g4b', amount: 30, tone: 'income', kind: 'flow', activity: act('operating') },
      { id: 'l6', sourceId: 'in:g6', targetId: 'acct:a1', nodeId: 'in:g6', amount: 60, tone: 'income', kind: 'flow', activity: act('investing') },
      { id: 'l7', sourceId: 'in:g7', targetId: 'acct:a1', nodeId: 'in:g7', amount: 50, tone: 'income', kind: 'flow', activity: act('investing') },
      { id: 'l8', sourceId: 'in:g8', targetId: 'acct:a1', nodeId: 'in:g8', amount: 40, tone: 'income', kind: 'flow', activity: act('financing') },
      { id: 'lr', sourceId: 'acct:a1', targetId: 'out:rent', nodeId: 'acct:a1', amount: 100, tone: 'expense', kind: 'flow', activity: act('operating') },
    ],
    accounts: [],
  })

  const mergedNode = (container: HTMLElement, activity = 'operating') =>
    container.querySelector<SVGGElement>(`.mb-rp-sankey-node[data-id="in:merged:${activity}"]`)
  const info = (el: SVGGElement | null) => {
    if (!el) return null
    return {
      name: el.querySelector('.mb-rp-sankey-name')?.textContent,
      amount: el.getAttribute('data-amount'),
      role: el.getAttribute('role'),
      expanded: el.getAttribute('aria-expanded'),
      tone: [...el.classList].find((c) => c.startsWith('mb-rp-sankey-tone--')),
    }
  }

  it('每个活动独立聚合：只有超额的 operating 生成「其他 (1)」，且带 operating 色', () => {
    const { container } = render(<CashSankeyChart data={mergedFixture()} device="mobile" animate={false} />)
    const op = info(mergedNode(container, 'operating'))!
    expect(op.name).toBe('其他 (1)')
    expect(op.amount).toBe('70') // operating 组 g1=100/g2=90/g4=80/g3=70 → top3 保留，g3(70) 出局
    expect(op.tone).toBe('mb-rp-sankey-tone--operating')
    // investing 只有 2 组、financing 只有 1 组，均未超额 → 没有各自的「其他」
    expect(mergedNode(container, 'investing')).toBeNull()
    expect(mergedNode(container, 'financing')).toBeNull()
    // 被合并的 g3 不显示，investing/financing 的组全部保留（投影后单成员组 id 为 grp:xxx）
    expect(container.querySelector('[data-id="grp:g3"]')).toBeNull()
    expect(container.querySelector('[data-id="grp:g6"]')).not.toBeNull()
    expect(container.querySelector('[data-id="grp:g7"]')).not.toBeNull()
    expect(container.querySelector('[data-id="grp:g8"]')).not.toBeNull()
    cleanup()
  })

  it('展开 keep 内的双成员组后「其他」不变，其余可见节点不变', () => {
    const { container } = render(<CashSankeyChart data={mergedFixture()} device="mobile" animate={false} />)
    const before = info(mergedNode(container, 'operating'))!
    // 展开 g4（operating top3 内的可展开组）。
    fireEvent.click(container.querySelector<SVGGElement>('.mb-rp-sankey-node[data-id="grp:g4"]')!)
    expect(container.querySelector('[data-id="in:g4a"]')).not.toBeNull()
    expect(container.querySelector('[data-id="in:g4b"]')).not.toBeNull()
    // 「其他」成员数、金额、名称、色完全不变。
    expect(info(mergedNode(container, 'operating'))).toEqual(before)
    // g3 仍被合并，没有冒出来。
    expect(container.querySelector('[data-id="grp:g3"]')).toBeNull()
    // 全部层0可见 id 不变（除 g4 展开为两成员）。
    const ids = [...container.querySelectorAll('.mb-rp-sankey-node[data-layer="0"]')]
      .map((el) => el.getAttribute('data-id'))
    expect(ids).toContain('grp:g1')
    expect(ids).toContain('grp:g2')
    expect(ids).toContain('in:g4a')
    expect(ids).toContain('in:merged:operating')
    cleanup()
  })

  it('「其他」节点不可点击：无 role / aria-expanded，点击不触发展开', () => {
    const { container } = render(<CashSankeyChart data={mergedFixture()} device="mobile" animate={false} />)
    const el = mergedNode(container, 'operating')!
    const before = info(el)!
    expect(before.role).toBeNull()
    expect(before.expanded).toBeNull()
    fireEvent.click(el)
    expect(container.querySelector('[data-id="in:g4a"]')).toBeNull()
    expect(info(mergedNode(container, 'operating'))).toEqual(before)
    cleanup()
  })

  it('多活动同时超额时，各自生成一个带本活动色的「其他」', () => {
    const data = mergedFixture()
    // 再给 investing 补 3 组（合计超额）、financing 补 3 组。
    const extra = [
      n({ id: 'in:g9', name: 'g9', layer: 0, tone: 'income', amount: 45, groupId: 'grp:g9', groupName: 'g9', rank: 8, activity: act('investing') }),
      n({ id: 'in:g10', name: 'g10', layer: 0, tone: 'income', amount: 35, groupId: 'grp:g10', groupName: 'g10', rank: 9, activity: act('investing') }),
      n({ id: 'in:g11', name: 'g11', layer: 0, tone: 'income', amount: 30, groupId: 'grp:g11', groupName: 'g11', rank: 10, activity: act('financing') }),
      n({ id: 'in:g12', name: 'g12', layer: 0, tone: 'income', amount: 20, groupId: 'grp:g12', groupName: 'g12', rank: 11, activity: act('financing') }),
    ]
    data.nodes.push(...extra)
    for (const node of extra) {
      data.links.push({ id: `l${node.id}`, sourceId: node.id, targetId: 'acct:a1', nodeId: node.id, amount: node.amount, tone: 'income', kind: 'flow', activity: node.activity ?? null })
    }
    const { container } = render(<CashSankeyChart data={data} device="mobile" animate={false} />)
    // investing: 60/50/45/35 → top3 保留，35 出局
    const inv = info(mergedNode(container, 'investing'))!
    expect(inv.name).toBe('其他 (1)')
    expect(inv.amount).toBe('35')
    expect(inv.tone).toBe('mb-rp-sankey-tone--investing')
    // financing: 40/30/20 → top3 保留，无其他（恰好 3 组）
    expect(mergedNode(container, 'financing')).toBeNull()
    cleanup()
  })
})
