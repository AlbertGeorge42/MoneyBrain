/**
 * 桑基 DTO 构造测试。
 *
 * buildSankey 已从 Domain 迁到 API 报表编排层（可视化 DTO 构造不是财务语义），
 * 这里承接原先位于 domain/tests/cash-flow.test.ts 的桑基契约用例，并补手续费 /
 * 优惠券独立绘制的守恒回归。财务金额规则本身仍由 domain/tests 守护。
 */
import { describe, expect, it } from 'vitest'
import { minor, type Minor } from '../../../../packages/domain/src/index.js'
import { buildSankey, type SankeySourceTransaction } from '../../src/services/report/sankey.js'

const m = (value: number): Minor => minor(value)

const source = (overrides: Partial<SankeySourceTransaction> = {}): SankeySourceTransaction => ({
  isActual: true,
  type: 'expense',
  relatedType: null,
  amount: m(100),
  fee: m(0),
  coupon: m(0),
  cashFlowType: 'operating',
  isFromCash: true,
  isToCash: false,
  categoryName: '餐饮',
  categoryId: 'food',
  accountName: '现金',
  accountId: 'cash-a',
  toAccountName: null,
  toAccountId: null,
  categoryGroupId: 'grp-cat-food',
  categoryGroupName: '餐饮',
  accountGroupId: 'grp-acct-cash',
  accountGroupName: '现金账户',
  toAccountGroupId: null,
  toAccountGroupName: null,
  ...overrides,
})

describe('桑基 DTO 契约（从 Domain 迁入，行为基线不变）', () => {
  it('退款方向与聚合同源、金额锁定、识别不了的原类型不计入', () => {
    const inflow = buildSankey([source({ type: 'refund', relatedType: 'expense', categoryName: null })])
    expect(inflow.links).toHaveLength(1)
    expect(inflow.links[0]!.source).toBe('in:food')
    expect(inflow.links[0]!.target).toBe('acct:cash-a')
    expect(inflow.links[0]!.value).toBe(100)
    expect(inflow.links[0]!.actualValue).toBe(100)

    const outflow = buildSankey([source({ type: 'refund', relatedType: 'income', categoryName: null })])
    expect(outflow.links[0]!.source).toBe('acct:cash-a')
    expect(outflow.links[0]!.target).toBe('out:food')

    expect(buildSankey([source({ type: 'refund', relatedType: null })]).links).toHaveLength(0)
  })

  it('actual/predicted 两侧合并，同一对端点按活动拆成多条', () => {
    const result = buildSankey([
      source({ type: 'income', categoryId: 'sale', categoryName: '销售收入', cashFlowType: 'operating',
        categoryGroupId: 'grp-op', categoryGroupName: '经营', amount: m(100) }),
      source({ type: 'income', categoryId: 'dividend', categoryName: '分红', cashFlowType: 'investing',
        categoryGroupId: 'grp-inv', categoryGroupName: '投资', amount: m(200) }),
      source({ type: 'expense', categoryId: 'interest', categoryName: '利息', cashFlowType: 'financing',
        categoryGroupId: 'grp-fin', categoryGroupName: '筹资', amount: m(30) }),
    ])
    const byActivity = new Map(result.links.map((link) => [`${link.source}>${link.target}`, link.activity]))
    expect(byActivity.get('in:sale>acct:cash-a')).toBe('operating')
    expect(byActivity.get('in:dividend>acct:cash-a')).toBe('investing')
    expect(byActivity.get('acct:cash-a>out:interest')).toBe('financing')

    const merged = buildSankey([
      source({ type: 'income', categoryId: 'sale', categoryName: '销售', cashFlowType: 'operating', amount: m(100) }),
      source({ type: 'income', categoryId: 'service', categoryName: '服务', cashFlowType: 'operating', amount: m(50) }),
    ])
    const cashLinks = merged.links.filter((link) => link.target === 'acct:cash-a')
    expect(cashLinks).toHaveLength(2)
    expect([...new Set(cashLinks.map((link) => link.activity))]).toEqual(['operating'])
  })

  it('身份与展示名解耦、同名实体不合并、合成节点 group 为 null', () => {
    const base = { type: 'expense' as const, categoryName: '餐饮', categoryId: 'cat-food' }
    const before = buildSankey([source(base)])
    const after = buildSankey([source({ ...base, categoryName: '改了名字的餐饮' })])
    expect(before.nodes.find((n) => n.nodeType === 'expense_category')!.id).toBe('out:cat-food')
    expect(after.nodes.find((n) => n.nodeType === 'expense_category')!.id).toBe('out:cat-food')
    expect(after.nodes.find((n) => n.nodeType === 'expense_category')!.name).toBe('改了名字的餐饮')

    const result = buildSankey([
      source({ type: 'expense', categoryName: '餐饮', categoryId: 'food-a', accountId: 'acc-a', amount: m(100) }),
      source({ type: 'expense', categoryName: '餐饮', categoryId: 'food-b', accountId: 'acc-b', amount: m(200) }),
    ])
    expect(result.nodes.filter((n) => n.nodeType === 'expense_category').map((n) => n.id).sort())
      .toEqual(['out:food-a', 'out:food-b'])
    expect(result.links.find((link) => link.target === 'out:food-a')?.value).toBe(100)
    expect(result.links.find((link) => link.target === 'out:food-b')?.value).toBe(200)

    const withFee = buildSankey([source({ type: 'transfer', isToCash: true, fee: m(10),
      toAccountName: '支付宝', toAccountId: 'zfb',
      accountGroupId: 'grp:acct:cash', accountGroupName: '现金',
      toAccountGroupId: 'grp:acct:cash', toAccountGroupName: '现金' })])
    expect(withFee.nodes.find((node) => node.id === 'out:synthetic:fee')!.group).toBeNull()
  })

  it('分组元数据：真实实体带 group、按列隔离、expandable 按组内数量', () => {
    const result = buildSankey([
      source({ type: 'expense', categoryName: '午餐', categoryId: 'lunch',
        categoryGroupId: 'grp:cat:out:food', categoryGroupName: '餐饮', amount: m(100) }),
      source({ type: 'expense', categoryName: '外食', categoryId: 'takeout',
        categoryGroupId: 'grp:cat:out:food', categoryGroupName: '餐饮', amount: m(200) }),
      source({ type: 'transfer', isFromCash: false, isToCash: true,
        accountName: '证券', accountId: 'sec', accountGroupId: 'grp:acct:inv', accountGroupName: '投资',
        toAccountName: '微信', toAccountId: 'wx', toAccountGroupId: 'grp:acct:cash', toAccountGroupName: '现金' }),
    ])
    expect(result.nodes.find((n) => n.id === 'out:lunch')!.group)
      .toEqual({ id: 'out:grp:cat:out:food', name: '餐饮', expandable: true })
    expect(result.nodes.find((n) => n.nodeType === 'non_cash_source')!.group)
      .toEqual({ id: 'in:grp:acct:inv', name: '投资', expandable: false })
  })

  it('非现金节点名只用账户名，不拼交易分类名', () => {
    const inflow = buildSankey([source({
      type: 'transfer', isFromCash: false, isToCash: true,
      categoryName: '账户互转', categoryId: 'move',
      accountName: '长桥证券', accountId: 'brk', toAccountName: '微信零钱', toAccountId: 'wx',
    })])
    expect(inflow.nodes.find((n) => n.nodeType === 'non_cash_source')!.name).toBe('长桥证券')
    const outflow = buildSankey([source({
      type: 'transfer', isFromCash: true, isToCash: false,
      categoryName: '账户互转', categoryId: 'move',
      accountName: '微信零钱', accountId: 'wx', toAccountName: '长桥证券', toAccountId: 'brk',
    })])
    expect(outflow.nodes.find((n) => n.nodeType === 'non_cash_target')!.name).toBe('长桥证券')
  })
})

/**
 * Phase 2：手续费与优惠券完整、独立绘制。
 *
 * 账务金额：转出 X+f、转入 X+c；桑基本金 ribbon 仍是 X，手续费 f 与优惠券 c
 * 各自单列，不再用净额 c−f 相互抵消——否则 fee>0 且 coupon>0 时与逐账户余额
 * 回放口径不一致，下游守恒断言会把图判为 invalid。
 */
describe('现金→现金转账：手续费与优惠券独立绘制并守恒', () => {
  const cashTransfer = (fee: number, coupon: number): SankeySourceTransaction => source({
    type: 'transfer', isFromCash: true, isToCash: true,
    accountName: '微信零钱', accountId: 'wx', toAccountName: '支付宝', toAccountId: 'zfb',
    fee: m(fee), coupon: m(coupon), amount: m(100),
  })

  const linkValue = (
    sankey: ReturnType<typeof buildSankey>, from: string, to: string,
  ): number | undefined => sankey.links.find((l) => l.source === from && l.target === to)?.value

  // 逐账户余额回放口径：转出记 X+f、转入记 X+c；桑基三条 ribbon 必须解释同一变化。
  const expectPerAccountConserved = (fee: number, coupon: number) => {
    const sankey = buildSankey([cashTransfer(fee, coupon)])
    const out = cashTransfer(fee, coupon).amount + m(fee)
    const inc = cashTransfer(fee, coupon).amount + m(coupon)
    const principal = linkValue(sankey, 'acct:wx', 'acct:zfb') ?? 0
    const feeRibbon = linkValue(sankey, 'acct:wx', 'out:synthetic:fee') ?? 0
    const couponRibbon = linkValue(sankey, 'in:synthetic:coupon', 'acct:zfb') ?? 0
    // 转出侧：本金 + 手续费 = X+f；转入侧：本金 + 优惠券 = X+c。
    expect(principal + feeRibbon).toBe(out)
    expect(principal + couponRibbon).toBe(inc)
    // 全局净变化 = 转入 − 转出 = c−f，由手续费与优惠券 ribbon 的差额表达。
    expect(couponRibbon - feeRibbon).toBe(m(coupon) - m(fee))
  }

  it('fee=0 coupon=0：不产生 synthetic link', () => {
    const sankey = buildSankey([cashTransfer(0, 0)])
    expect(sankey.nodes.some((n) => n.id === 'out:synthetic:fee')).toBe(false)
    expect(sankey.nodes.some((n) => n.id === 'in:synthetic:coupon')).toBe(false)
    expect(linkValue(sankey, 'acct:wx', 'acct:zfb')).toBe(100)
    expectPerAccountConserved(0, 0)
  })

  it('fee=2 coupon=0：手续费完整绘制', () => {
    const sankey = buildSankey([cashTransfer(2, 0)])
    expect(linkValue(sankey, 'acct:wx', 'out:synthetic:fee')).toBe(2)
    expect(sankey.nodes.some((n) => n.id === 'in:synthetic:coupon')).toBe(false)
    expectPerAccountConserved(2, 0)
  })

  it('fee=0 coupon=3：优惠券完整绘制', () => {
    const sankey = buildSankey([cashTransfer(0, 3)])
    expect(linkValue(sankey, 'in:synthetic:coupon', 'acct:zfb')).toBe(3)
    expect(sankey.nodes.some((n) => n.id === 'out:synthetic:fee')).toBe(false)
    expectPerAccountConserved(0, 3)
  })

  it('fee=3 coupon=2：两者独立绘制，不抵消', () => {
    const sankey = buildSankey([cashTransfer(3, 2)])
    expect(linkValue(sankey, 'acct:wx', 'out:synthetic:fee')).toBe(3)
    expect(linkValue(sankey, 'in:synthetic:coupon', 'acct:zfb')).toBe(2)
    expectPerAccountConserved(3, 2)
  })

  it('fee=2 coupon=3：两者独立绘制，不抵消', () => {
    const sankey = buildSankey([cashTransfer(2, 3)])
    expect(linkValue(sankey, 'acct:wx', 'out:synthetic:fee')).toBe(2)
    expect(linkValue(sankey, 'in:synthetic:coupon', 'acct:zfb')).toBe(3)
    expectPerAccountConserved(2, 3)
  })

  it('fee=2 coupon=2：相等也各自绘制，不因净额为 0 而消失', () => {
    const sankey = buildSankey([cashTransfer(2, 2)])
    expect(linkValue(sankey, 'acct:wx', 'out:synthetic:fee')).toBe(2)
    expect(linkValue(sankey, 'in:synthetic:coupon', 'acct:zfb')).toBe(2)
    expectPerAccountConserved(2, 2)
  })

  it('手续费 / 优惠券链路保持中性色，合成节点无分组', () => {
    const sankey = buildSankey([cashTransfer(3, 2)])
    expect(sankey.links.filter((l) => l.activity === null)).toHaveLength(3)
    expect(sankey.nodes.find((n) => n.id === 'out:synthetic:fee')!.group).toBeNull()
    expect(sankey.nodes.find((n) => n.id === 'in:synthetic:coupon')!.group).toBeNull()
  })
})
