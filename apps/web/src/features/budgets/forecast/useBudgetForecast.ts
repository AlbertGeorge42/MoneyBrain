/**
 * 推演取数：三份数据一次取回并跨页面共享缓存。
 *
 * - 切 tab 不请求：tab 只是渲染选择，不参与取数；
 * - 切页面不重复请求：模块级缓存按「asOf | months | 账本修订」去重，并发挂载共享同一 Promise；
 * - 预算发生变化时修订号变化，重新取数（不做前端本地推演回退）。
 */
import { useCallback, useEffect, useState } from 'react'
import type { ProjectionMonths } from '@contracts/types'
import { analyticsApi, budgetApi, reportApi } from '@/services/api'
import { unwrapApiData } from '@/services/apiResult'
import { addMonths, monthEnd } from '@/features/reports/reportsTime'
import type { ForecastBundle } from './model'

const cache = new Map<string, ForecastBundle>()
const inflight = new Map<string, Promise<ForecastBundle>>()

export type ForecastState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: ForecastBundle }
  | { status: 'error'; message: string }

async function loadForecast(asOf: string, months: ProjectionMonths): Promise<ForecastBundle> {
  // 旧的「推演面板」仍按月窗口取数；从 asOf 所在月起，覆盖 months 个自然月。
  const window = { asOf, granularity: 'month' as const, from: asOf, to: monthEnd(addMonths(asOf, months - 1)) }
  const [assetResponse, cashResponse] = await Promise.all([
    analyticsApi.getAssetProjection(window),
    reportApi.getCashFlowProjection(window),
  ])
  const asset = unwrapApiData(assetResponse)
  const cash = unwrapApiData(cashResponse)
  // 文档 §3.3：fromMonth 取第一个投影点的 label，不自行推算月份边界。
  const firstLabel = asset.points[0]?.label ?? cash.points[0]?.label
  const plan = firstLabel ? unwrapApiData(await budgetApi.getPeriodPlan(firstLabel, months)) : null
  return { asset, cash, plan, fetchedAt: Date.now() }
}

export interface UseBudgetForecastOptions {
  enabled: boolean
  months: ProjectionMonths
  asOf: string
  revision: string
}

export function useBudgetForecast({ enabled, months, asOf, revision }: UseBudgetForecastOptions) {
  const key = `${asOf}|${months}|${revision}`
  const [state, setState] = useState<ForecastState>({ status: 'idle' })
  const [retryToken, setRetryToken] = useState(0)

  const retry = useCallback(() => {
    cache.delete(key)
    inflight.delete(key)
    setRetryToken((token) => token + 1)
  }, [key])

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle' })
      return
    }
    const cached = cache.get(key)
    if (cached) {
      setState({ status: 'ready', data: cached })
      return
    }

    let active = true
    setState({ status: 'loading' })
    let task = inflight.get(key)
    if (!task) {
      task = loadForecast(asOf, months)
      inflight.set(key, task)
    }
    task
      .then(
        (data) => {
          cache.set(key, data)
          if (active) setState({ status: 'ready', data })
        },
        (error: unknown) => {
          if (active) {
            setState({
              status: 'error',
              message: error instanceof Error && error.message ? error.message : '推演数据加载失败',
            })
          }
        },
      )
      .then(() => {
        if (inflight.get(key) === task) inflight.delete(key)
      })

    return () => {
      active = false
    }
  }, [enabled, key, asOf, months, retryToken])

  return { state, retry }
}
