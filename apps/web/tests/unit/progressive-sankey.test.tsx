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
import { deriveCashSankey, projectCashSankey, type CashSankey, type CashSankeyNode } from '@/features/reports/cashSankeyModel'
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

  it('键盘 Enter / 空格可展开，收起后守恒脚注仍为 0', () => {
    const { container } = render(<CashSankeyChart data={fixture()} device="desktop" animate={false} />)
    const foodGroup = container.querySelector<SVGGElement>('.mb-rp-sankey-node[data-id="grp:cat:in:food"]')!
    fireEvent.keyDown(foodGroup, { key: 'Enter' })
    expect(container.querySelector('[data-id="in:food_lunch"]')).not.toBeNull()
    const check = container.querySelector<HTMLElement>('.mb-rp-sankey-check')
    expect(check?.dataset.difference).toBe('0')
    cleanup()
  })

  it('移动端 Top N 聚合与渐进式投影叠加：组可展开，聚合后守恒脚注仍为 0', () => {
    const { container } = render(<CashSankeyChart data={fixture()} device="mobile" animate={false} />)
    // 移动端仍渲染桑基，组节点可见且可点击展开
    expect(container.querySelector('.mb-rp-sankey-svg')).not.toBeNull()
    const cashGroup = container.querySelector<SVGGElement>('.mb-rp-sankey-node[data-id="grp:acctcat:cash"]')!
    expect(cashGroup).not.toBeNull()
    fireEvent.click(cashGroup)
    expect(container.querySelector('[data-id="acct:a1"]')).not.toBeNull()
    expect(container.querySelector<HTMLElement>('.mb-rp-sankey-check')?.dataset.difference).toBe('0')
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
