import { ZERO_MINOR, add, sum, type Minor } from '../money.js'
import type {
  CashFlowProjectionPoint,
  ProjectionBalance,
  ProjectionFlowValue,
  ProjectionSourceValue,
} from './types.js'

/** 三来源合成值：total = actual + planned + committed。 */
export function projectionFlowValue(
  actual: Minor,
  planned: Minor,
  committed: Minor,
): ProjectionFlowValue {
  return { actual, planned, committed, total: sum([actual, planned, committed]) }
}

/** 分类金额 Map 求和。 */
function sumSourceMap(map: ReadonlyMap<string, Minor>): Minor {
  return sum([...map.values()])
}

/**
 * 收支投影的三来源合成：planned 用 Map 是否为空表达「有没有预算来源」，
 * 空 Map 得到 null 而不是 0 —— 「无预算」与「预算恰好为 0」不能混为一谈。
 */
export function projectionSourceValue(
  actual: Minor,
  committed: Minor,
  plannedMap: ReadonlyMap<string, Minor>,
): ProjectionSourceValue {
  const planned = plannedMap.size > 0 ? sumSourceMap(plannedMap) : null
  return {
    actual,
    committed,
    planned,
    total: sum([actual, committed, planned ?? ZERO_MINOR]),
  }
}

export function addBalance(a: ProjectionBalance, b: ProjectionBalance): ProjectionBalance {
  return {
    assets: add(a.assets, b.assets),
    liabilities: add(a.liabilities, b.liabilities),
    netWorth: add(a.netWorth, b.netWorth),
  }
}

export function zeroBalance(): ProjectionBalance {
  return { assets: ZERO_MINOR, liabilities: ZERO_MINOR, netWorth: ZERO_MINOR }
}

/** 窗口级归约：把逐桶的 inflow / outflow / net 三来源分别累加。 */
export function sumProjectionFlows(
  points: readonly CashFlowProjectionPoint[],
  field: 'inflow' | 'outflow' | 'net',
): ProjectionFlowValue {
  return points.reduce<ProjectionFlowValue>(
    (acc, point) => ({
      actual: add(acc.actual, point[field].actual),
      planned: add(acc.planned, point[field].planned),
      committed: add(acc.committed, point[field].committed),
      total: add(acc.total, point[field].total),
    }),
    { actual: ZERO_MINOR, planned: ZERO_MINOR, committed: ZERO_MINOR, total: ZERO_MINOR },
  )
}
