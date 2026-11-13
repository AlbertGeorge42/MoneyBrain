import { describe, it, expect } from 'vitest'
import { buildSankey, minor, type SankeySourceTransaction } from '../../../../packages/domain/src/index.js'

// C4 验收：桑基图退款方向由领域层 refundOffsetKind 唯一判定——
// 支出退款计入流入侧（分类 → 现金），收入退款计入流出侧（现金 → 分类），
// 与 aggregate() 的 outflow/inflow 同一判定；relatedType 无法识别时不计入。
// 夹具是领域输入而非 Prisma payload：buildSankey 的入参已在 D5 领域化。

const makeRefund = (relatedType: 'income' | 'expense' | null): SankeySourceTransaction => ({
  isActual: true,
  type: 'refund',
  relatedType,
  amount: minor(100),
  fee: minor(0),
  coupon: minor(0),
  ruleVersion: 1,
  isFromCash: true,
  isToCash: false,
  categoryName: '未分类',
  accountName: '现金账户',
  toAccountName: null,
})

const makeCashTransfer = (fee = 0): SankeySourceTransaction => ({
  isActual: true,
  type: 'transfer',
  relatedType: null,
  amount: minor(100),
  fee: minor(fee),
  coupon: minor(0),
  ruleVersion: 1,
  isFromCash: true,
  isToCash: true,
  categoryName: '未分类',
  accountName: '微信零钱',
  toAccountName: '支付宝',
})

const buildWith = (sources: SankeySourceTransaction[]) => buildSankey(sources)

const hasLink = (sankey: ReturnType<typeof buildWith>, source: string, target: string) =>
  sankey.links.some((link) => link.source === source && link.target === target)

describe('buildSankey 退款方向与活动表同源（C4）', () => {
  it('支出退款计入流入侧：退款分类 → 现金', () => {
    const sankey = buildWith([makeRefund('expense')])

    expect(hasLink(sankey, '未分类_income', '现金账户_cash')).toBe(true)
    // 不得再出现现金 → 流出侧的退款链路
    expect(hasLink(sankey, '现金账户_cash', '未分类_expense')).toBe(false)
  })

  it('收入退款计入流出侧：现金 → 退款分类，与 aggregate 的 outflow 方向一致', () => {
    const sankey = buildWith([makeRefund('income')])

    expect(hasLink(sankey, '现金账户_cash', '未分类_expense')).toBe(true)
    // 不得再出现在流入侧（修复前一律按流入直取的错误方向）
    expect(hasLink(sankey, '未分类_income', '现金账户_cash')).toBe(false)
  })

  it('relatedType 无法识别时不计入（refundOffsetKind 返回 null，与 aggregate 一致）', () => {
    const sankey = buildWith([makeRefund(null)])

    expect(sankey.links).toHaveLength(0)
  })

  it('退款金额按实际值计入链路（金额 100 分）', () => {
    const sankey = buildWith([makeRefund('expense')])
    const link = sankey.links.find((item) => item.source === '未分类_income')
    expect(link?.value).toBe(minor(100))
  })
})

describe('buildSankey 现金账户内部转账（三层桑基）', () => {
  it('现金 → 现金保留账户到账户的 link，不被吞掉', () => {
    const sankey = buildWith([makeCashTransfer()])

    expect(hasLink(sankey, '微信零钱_cash', '支付宝_cash')).toBe(true)
    expect(sankey.nodes.map((node) => node.name)).toEqual(
      expect.arrayContaining(['微信零钱_cash', '支付宝_cash']),
    )
    expect(sankey.links.find((link) => link.target === '支付宝_cash')?.value).toBe(minor(100))
  })

  it('转账手续费不随本金转移：单独成为「手续费」出流节点', () => {
    const sankey = buildWith([makeCashTransfer(10)])

    expect(hasLink(sankey, '微信零钱_cash', '支付宝_cash')).toBe(true)
    expect(sankey.links.find((link) => link.source === '微信零钱_cash' && link.target === '支付宝_cash')?.value).toBe(
      minor(100),
    )
    expect(hasLink(sankey, '微信零钱_cash', '手续费_expense')).toBe(true)
    expect(sankey.links.find((link) => link.target === '手续费_expense')?.value).toBe(minor(10))
  })
})
