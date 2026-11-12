import type { BudgetKind } from '../ledger/rules.js'
import type { BudgetOccurrencePoint } from './types.js'

/** 预算类型收窄：生成器只会产出这三种，未知值直接失败而不是悄悄按 0 处理。 */
export function budgetKindOf(value: string): BudgetKind {
  if (value === 'income' || value === 'expense' || value === 'transfer') return value
  throw new Error(`未知预算类型: ${value}`)
}

/**
 * 根据周期和交易时间生成点位序列。
 *
 * 只返回落在 [start, end] 内的点：起点之前的本期点位（如月度预算的 5 号、
 * 季度/年度天偏移落点）不会因为「本周期开始」而被带进窗口——
 * 否则推演会把已经过去的点位算成未来预测。
 *
 * transactionTime 语义：
 * - daily：忽略
 * - weekly：0=周一 … 6=周日（缺省周日）
 * - monthly：几号（缺省月末）
 * - quarterly / yearly：从周期起点起的天偏移（缺省周期末）
 *
 * 每个点位同时给出它所属的预算周期 [periodStart, periodEnd]，供 occurrence 匹配使用。
 * 沿用既有的本地日历日 Date 口径，迁移不改日期语义与落点。
 */
export function generateBudgetOccurrences(
  start: Date,
  end: Date,
  period: string,
  transactionTime: number | null,
): BudgetOccurrencePoint[] {
  const points: BudgetOccurrencePoint[] = []
  const inRange = (date: Date) => date >= start && date <= end
  const weekRange = (date: Date) => {
    const weekStart = new Date(date)
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    return { periodStart: weekStart, periodEnd: weekEnd }
  }

  switch (period) {
    case 'daily': {
      const current = new Date(start)
      current.setHours(0, 0, 0, 0)
      while (current <= end) {
        const day = new Date(current)
        points.push({ date: day, periodStart: day, periodEnd: day })
        current.setDate(current.getDate() + 1)
      }
      break
    }
    case 'weekly': {
      const current = new Date(start)
      current.setHours(0, 0, 0, 0)
      if (transactionTime !== null && transactionTime >= 0 && transactionTime <= 6) {
        // 跳到指定的周几（0=Mon, 6=Sun → JS: 1=Mon, 0=Sun）
        const targetDay = transactionTime === 6 ? 0 : transactionTime + 1
        while (current.getDay() !== targetDay) {
          current.setDate(current.getDate() + 1)
        }
      }
      while (current <= end) {
        const { periodStart, periodEnd } = weekRange(current)
        points.push({ date: new Date(current), periodStart, periodEnd })
        current.setDate(current.getDate() + 7)
      }
      break
    }
    case 'monthly': {
      const current = new Date(start)
      current.setDate(1)
      current.setHours(0, 0, 0, 0)

      while (current <= end) {
        const periodStart = new Date(current)
        const periodEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0)
        if (transactionTime !== null) {
          const pointDate = new Date(current)
          pointDate.setDate(transactionTime)
          if (pointDate.getMonth() === current.getMonth() && inRange(pointDate)) {
            points.push({ date: pointDate, periodStart, periodEnd })
          }
        } else if (inRange(periodEnd)) {
          points.push({ date: periodEnd, periodStart, periodEnd })
        }
        current.setMonth(current.getMonth() + 1)
      }
      break
    }
    case 'quarterly': {
      const current = new Date(start)
      const q = Math.floor(current.getMonth() / 3)
      current.setMonth(q * 3, 1)
      current.setHours(0, 0, 0, 0)

      while (current <= end) {
        const currentQ = Math.floor(current.getMonth() / 3)
        const periodStart = new Date(current)
        const periodEnd = new Date(current.getFullYear(), (currentQ + 1) * 3, 0)
        if (transactionTime !== null) {
          // 天偏移从**季度起点**算起（不是窗口起点），并裁掉窗口起点之前的落点
          const pointDate = new Date(current)
          pointDate.setDate(pointDate.getDate() + transactionTime)
          if (inRange(pointDate)) {
            points.push({ date: pointDate, periodStart, periodEnd })
          }
        } else if (inRange(periodEnd)) {
          // 默认：季度最后一天
          points.push({ date: periodEnd, periodStart, periodEnd })
        }
        current.setMonth(current.getMonth() + 3)
      }
      break
    }
    case 'yearly': {
      const current = new Date(start)
      current.setMonth(0, 1)
      current.setHours(0, 0, 0, 0)

      while (current <= end) {
        const periodStart = new Date(current)
        const periodEnd = new Date(current.getFullYear(), 11, 31)
        if (transactionTime !== null) {
          // 天偏移从**年度起点**算起（不是窗口起点），并裁掉窗口起点之前的落点
          const pointDate = new Date(current)
          pointDate.setDate(pointDate.getDate() + transactionTime)
          if (inRange(pointDate)) {
            points.push({ date: pointDate, periodStart, periodEnd })
          }
        } else if (inRange(periodEnd)) {
          // 默认：12月31日
          points.push({ date: periodEnd, periodStart, periodEnd })
        }
        current.setFullYear(current.getFullYear() + 1)
      }
      break
    }
  }

  return points
}
