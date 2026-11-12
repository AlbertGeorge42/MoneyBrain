import { AppError, NotFoundError, toDate, dayStart, dayEnd, nextDay } from '../common/index.js'
import * as accountRepo from '../db/repositories/account.repository.js'
import * as transactionRepo from '../db/repositories/transaction.repository.js'
import { calculateBalancesBatch } from './balance.service.js'
import { softDeleteWithEvent, updateWithEvent } from './audit-event.service.js'
import { CURRENT_RULE_VERSION, formatCurrency, fromDate, minor } from '../../../../packages/domain/src/index.js'
import type { AccountReconcileResult } from '../../../../packages/contracts/types/index.js'

/**
 * 一键对账：用户给出「账户 + 日期 + 真实余额」，系统算账面推导值与真实值之差，
 * 落成一条 `type='adjustment'` 的可见分录。
 *
 * 差额按「日期当天结束」口径计算（与 balance-at 一致），
 * 覆盖时先把同日原调整从账面中剔除再算差额，保证覆盖后余额仍然等于实际值。
 */

export interface ReconcileInput {
  date: string
  actualBalance: number
  note?: string
  /** 同日已有 adjustment 时必须显式选择：overwrite 覆盖原记录，append 追加一条。 */
  mode?: 'overwrite' | 'append'
}

function formatMoney(amount: number): string {
  return formatCurrency(minor(amount))
}

function buildNote(bookBalance: number, actualBalance: number, extra?: string): string {
  const base = `对账矫正：账面 ${formatMoney(bookBalance)}，实际 ${formatMoney(actualBalance)}`
  return extra ? `${base}（${extra}）` : base
}

export async function reconcileAccount(
  accountId: string,
  input: ReconcileInput,
): Promise<AccountReconcileResult> {
  const account = await accountRepo.findById(accountId)
  if (!account) throw new NotFoundError('账户')

  const date = toDate(input.date, '日期')
  const dateKey = fromDate(date)
  const nextDayDate = nextDay(dateKey)

  const existingAdjustments = await transactionRepo.findActive(
    {
      accountId,
      type: 'adjustment',
      date: { gte: dayStart(dateKey), lte: dayEnd(dateKey) },
    },
    { orderBy: { createdAt: 'asc' } },
  )

  // 同账户同日重复对账不静默追加：必须由调用方显式选择覆盖或追加。
  if (existingAdjustments.length > 0 && !input.mode) {
    const existing = existingAdjustments[existingAdjustments.length - 1]!
    throw new AppError('该账户当日已有平账记录，请选择覆盖或追加', 'CONFLICT', 409, {
      code: 'RECONCILE_CONFLICT',
      existingTransactionId: existing.id,
      existingAmount: Number(existing.amount),
      existingCount: existingAdjustments.length,
    })
  }

  const balanceCache = await calculateBalancesBatch([accountId], [nextDayDate], [account])
  const bookBalance = balanceCache.get(accountId, nextDayDate)

  // 覆盖时先剔除被覆盖的那条调整，得到「不含本条调整的账面值」；
  // 追加时账面值保持含全部既有调整，追加金额自然把余额补到实际值。
  const overwriteTarget = input.mode === 'overwrite'
    ? existingAdjustments[existingAdjustments.length - 1]
    : undefined
  const bookExcludingTarget = bookBalance - (overwriteTarget ? Number(overwriteTarget.amount) : 0)
  const difference = input.actualBalance - bookExcludingTarget

  if (overwriteTarget) {
    // 覆盖后差额为 0：账面已与真实值一致，原平账记录不再需要。
    // 软删除并留审计事件，不保留 0 元记录——否则流水里会多出一条无意义的调整。
    if (difference === 0) {
      await softDeleteWithEvent(overwriteTarget)
      return {
        accountId,
        date: dateKey,
        bookBalance: minor(bookExcludingTarget),
        actualBalance: minor(input.actualBalance),
        difference: minor(0),
        status: 'balanced',
        transactionId: null,
      }
    }

    const updated = await updateWithEvent(overwriteTarget.id, overwriteTarget, {
      amount: BigInt(difference),
      date,
      note: buildNote(bookExcludingTarget, input.actualBalance, input.note),
    })
    return {
      accountId,
      date: dateKey,
      bookBalance: minor(bookExcludingTarget),
      actualBalance: minor(input.actualBalance),
      difference: minor(difference),
      status: 'overwritten',
      transactionId: updated.id,
    }
  }

  if (difference === 0) {
    return {
      accountId,
      date: dateKey,
      bookBalance: minor(bookBalance),
      actualBalance: minor(input.actualBalance),
      difference: minor(0),
      status: 'balanced',
      transactionId: null,
    }
  }

  const created = await transactionRepo.createWithRelations({
    type: 'adjustment',
    ruleVersion: CURRENT_RULE_VERSION,
    amount: BigInt(difference),
    date,
    note: buildNote(bookBalance, input.actualBalance, input.note),
    accountId,
  })

  return {
    accountId,
    date: dateKey,
    bookBalance: minor(bookBalance),
    actualBalance: minor(input.actualBalance),
    difference: minor(difference),
    status: input.mode === 'append' ? 'appended' : 'created',
    transactionId: created.id,
  }
}
