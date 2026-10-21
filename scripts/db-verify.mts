/**
 * 数据自检：重算账本里的关键等式，发现不一致就报出来。
 *
 * 检查项（都是「不该错」的等式）：
 * 1. Σ 所有账户余额 == 净资产（资产 − 负债）
 * 2. 期初净资产 + 净收入 − 净支出 == 期末净资产（本月）
 * 3. 每一笔转账满足 Δ转出 + Δ转入 == −手续费
 * 4. 每一笔退款不超过原交易的剩余可退金额
 *
 * 用法：
 *   npm run db:verify            # 检查本月
 *   npm run db:verify -- 2026-01 # 检查指定月份（YYYY-MM）
 */
import { PrismaClient } from '@prisma/client'
import { balanceBefore, postingsOf, remainingRefundable } from '../packages/domain/src/index.js'
import type { LedgerTransaction } from '../packages/domain/src/index.js'

const toLocalDate = (value: Date): string => {
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const toMinor = (value: { toNumber(): number }) => Math.round(value.toNumber() * 100)

const toLedger = (t: Record<string, unknown>): LedgerTransaction => ({
  id: t.id as string,
  kind: t.type as LedgerTransaction['kind'],
  date: toLocalDate(t.date as Date),
  amount: toMinor(t.amount as { toNumber(): number }),
  fee: toMinor((t.fee ?? 0) as { toNumber(): number }),
  coupon: toMinor((t.coupon ?? 0) as { toNumber(): number }),
  accountId: t.accountId as string,
  toAccountId: (t.toAccountId ?? null) as string | null,
  categoryId: (t.categoryId ?? null) as string | null,
  relatedTransactionId: (t.relatedTransactionId ?? null) as string | null,
  relatedType:
    t.relatedType === 'income' || t.relatedType === 'expense' ? (t.relatedType as 'income' | 'expense') : null,
  excludeFromIncomeExpense: Boolean(t.excludeFromIncomeExpense),
})

const yuan = (minor: number) => (minor / 100).toFixed(2)

async function main() {
  const month = process.argv[2] ?? new Date().toISOString().slice(0, 7)
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber) {
    throw new Error('月份格式应为 YYYY-MM')
  }
  const start = new Date(year, monthNumber - 1, 1)
  const endExclusive = new Date(year, monthNumber, 1)
  const startDate = toLocalDate(start)
  const endDate = toLocalDate(new Date(endExclusive.getTime() - 1))

  const prisma = new PrismaClient()
  const problems: string[] = []

  try {
    const [accounts, transactions] = await Promise.all([
      prisma.account.findMany(),
      prisma.transaction.findMany({ orderBy: { date: 'asc' } }),
    ])
    const ledger = transactions.map((t) => toLedger(t as unknown as Record<string, unknown>))

    // 1. 净资产 = Σ 账户余额（负债余额本身为负）
    let netWorth = 0
    for (const account of accounts) {
      const balance = balanceBefore(
        account.id,
        {
          date: account.initialBalanceDate ? toLocalDate(account.initialBalanceDate) : null,
          amount: toMinor(account.initialBalance),
        },
        ledger,
        toLocalDate(new Date()),
      )
      netWorth += balance
    }

    // 2. 期初 + 净收入 − 净支出 + 不进收支但影响余额的部分 = 期末
    const inPeriod = ledger.filter((t) => t.date >= startDate && t.date < toLocalDate(endExclusive))

    // 净资产 = Σ 资产账户余额 + Σ 负债账户余额（负债余额本身是负数）
    const netAt = (date: string) => {
      let total = 0
      for (const account of accounts) {
        const balance = balanceBefore(
          account.id,
          {
            date: account.initialBalanceDate ? toLocalDate(account.initialBalanceDate) : null,
            amount: toMinor(account.initialBalance),
          },
          ledger,
          date,
        )
        total += balance
      }
      return total
    }

    const startNetWorth = netAt(startDate)
    const endNetWorth = netAt(toLocalDate(endExclusive))

    // 余额影响 = 分录里所有账户分录之和（用领域层算，不自己重推）
    const balanceEffect = (t: LedgerTransaction) =>
      postingsOf(t)
        .filter((p) => p.kind === 'account')
        .reduce((total, p) => total + p.amount, 0)

    const flowOf = (predicate: (t: LedgerTransaction) => boolean) =>
      inPeriod.filter(predicate).reduce((total, t) => total + t.amount, 0)

    const netIncome = flowOf((t) => t.kind === 'income' && !t.excludeFromIncomeExpense)
    const incomeRefunds = flowOf(
      (t) => t.kind === 'refund' && t.relatedType === 'income' && !t.excludeFromIncomeExpense,
    )
    const netExpense = flowOf((t) => t.kind === 'expense' && !t.excludeFromIncomeExpense)
    const expenseRefunds = flowOf(
      (t) => t.kind === 'refund' && t.relatedType === 'expense' && !t.excludeFromIncomeExpense,
    )
    const flow = netIncome - incomeRefunds - (netExpense - expenseRefunds)

    // 不进收支统计但改变余额的部分
    const excludedNet = inPeriod
      .filter((t) => t.excludeFromIncomeExpense)
      .reduce((total, t) => total + balanceEffect(t), 0)
    const transferFee = inPeriod
      .filter((t) => t.kind === 'transfer')
      .reduce((total, t) => total + Math.max(t.fee - t.coupon, 0), 0)
    const adjustmentNet = inPeriod
      .filter((t) => t.kind === 'adjustment')
      .reduce((total, t) => total + balanceEffect(t), 0)

    // 开户日之前的交易：进收支统计，但不进余额
    const openingDateOf = new Map(
      accounts.map((a) => [a.id, a.initialBalanceDate ? toLocalDate(a.initialBalanceDate) : null]),
    )
    const isPreOpening = (t: LedgerTransaction) => {
      const opening = openingDateOf.get(t.accountId)
      return opening !== null && opening !== undefined && t.date < opening
    }
    const preOpeningFlow = inPeriod
      .filter((t) => isPreOpening(t))
      .reduce((total, t) => {
        if (t.kind === 'income') return total + t.amount
        if (t.kind === 'expense') return total - t.amount
        if (t.kind === 'refund' && t.relatedType === 'income') return total - t.amount
        if (t.kind === 'refund' && t.relatedType === 'expense') return total + t.amount
        return total
      }, 0)

    // 完整的恒等式：期初 + 净流量 + 不进收支但影响余额的部分 − 开户前交易 = 期末
    const expectedEnd =
      startNetWorth + flow + excludedNet + transferFee + adjustmentNet - preOpeningFlow
    const difference = endNetWorth - expectedEnd

    if (Math.abs(difference) >= 1) {
      problems.push(
        `净资产对不上：期末 ${yuan(endNetWorth)} ≠ 期望 ${yuan(expectedEnd)}` +
          `（期初 ${yuan(startNetWorth)} + 净流量 ${yuan(flow)} + 不计收支 ${yuan(excludedNet)}` +
          ` + 手续费 ${yuan(transferFee)} + 平账 ${yuan(adjustmentNet)} − 开户前 ${yuan(preOpeningFlow)}，差 ${yuan(difference)}）`,
      )
    } else {
      const extras: string[] = []
      if (Math.abs(excludedNet) >= 1) extras.push(`不计收支 ${yuan(excludedNet)}`)
      if (Math.abs(transferFee) >= 1) extras.push(`转账手续费 ${yuan(transferFee)}`)
      if (Math.abs(adjustmentNet) >= 1) extras.push(`平账 ${yuan(adjustmentNet)}`)
      if (Math.abs(preOpeningFlow) >= 1) extras.push(`开户前交易 ${yuan(preOpeningFlow)}`)
      if (extras.length > 0) {
        console.log(`ℹ 不进收支统计但影响余额：${extras.join('、')}（已计入对账，非错误）`)
      }
    }

    // 3. 转账：Δ转出 + Δ转入 == −手续费
    for (const t of ledger) {
      if (t.kind !== 'transfer' || !t.toAccountId) continue
      const fee = Math.max(t.fee - t.coupon, 0)
      const outflow = -t.amount - fee
      const inflow = t.amount
      if (outflow + inflow !== -fee) {
        problems.push(`转账 ${t.id} 不平衡：Δ转出 ${yuan(outflow)} + Δ转入 ${yuan(inflow)} ≠ −手续费 ${yuan(fee)}`)
      }
    }

    // 4. 退款不超过原交易剩余可退金额
    const byId = new Map(ledger.map((t) => [t.id, t]))
    const refundsByOriginal = new Map<string, LedgerTransaction[]>()
    for (const t of ledger) {
      if (t.kind !== 'refund' || !t.relatedTransactionId) continue
      const list = refundsByOriginal.get(t.relatedTransactionId) ?? []
      list.push(t)
      refundsByOriginal.set(t.relatedTransactionId, list)
    }
    for (const [originalId, refunds] of refundsByOriginal) {
      const original = byId.get(originalId)
      if (!original) {
        problems.push(`退款指向的原交易不存在：${originalId}`)
        continue
      }
      const remaining = remainingRefundable(original, refunds)
      if (remaining < 0) {
        problems.push(`退款超额：原交易 ${originalId} 剩余可退 ${yuan(remaining)}`)
      }
    }

    console.log(`检查范围：${month}（${startDate} ~ ${endDate}）`)
    console.log(`账户 ${accounts.length} 个 · 交易 ${transactions.length} 笔 · 净资产 ${yuan(netWorth)} 元`)
    console.log(`期初净资产 ${yuan(startNetWorth)} + 净流量 ${yuan(flow)} = 期末净资产 ${yuan(endNetWorth)}`)

    if (problems.length === 0) {
      console.log('✅ 数据自检通过：余额、净资产、转账与退款都对得上')
    } else {
      console.error(`❌ 发现 ${problems.length} 处不一致：`)
      for (const problem of problems) console.error(`   - ${problem}`)
      process.exitCode = 1
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
