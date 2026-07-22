import React, { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { Empty } from 'antd'
import { currencyTooltipFormatter, currencyAxisFormatter } from '../../utils/format'
import { useChartTokens } from '../../styles/theme/chart-tokens'
import { toRgba } from '../../utils/color'

export interface BaseChartProps {
  title: string
  xAxisData: string[]
  seriesData: Array<{ name: string; data: number[]; predictedData?: number[]; color?: string }>
  height?: number
  loading?: boolean
  chartType: 'bar' | 'line'
  boundaryIndex?: number
  isPurePrediction?: boolean
  grid?: Record<string, unknown>
}

const BaseChart: React.FC<BaseChartProps> = ({ title, xAxisData, seriesData, height = 300, loading = false, chartType, boundaryIndex, isPurePrediction, grid: gridOverride }) => {
  const tokens = useChartTokens()
  const primaryColor = tokens.palette[0] || '#1890ff'

  const validXAxisData = Array.isArray(xAxisData) ? xAxisData : []
  const validSeriesData = Array.isArray(seriesData) ? seriesData : []

  const flatSeries = useMemo(() => {
    const result: Array<{ name: string; type: string; data: (number | null)[]; stack?: string; itemStyle?: object; lineStyle?: object; areaStyle?: object; smooth?: boolean }> = []

    validSeriesData.forEach(s => {
      const data = s.data || []
      const predictedData = s.predictedData || []
      const hasActual = data.some(v => v !== 0)
      const hasPredicted = predictedData.some(v => v !== 0)

      if (chartType === 'bar') {
        if (hasPredicted) {
          const predictedColor = toRgba(s.color || primaryColor, 0.4)
          result.push({
            name: `${s.name}（实际）`,
            type: 'bar',
            data,
            stack: s.name,
            itemStyle: s.color ? { color: s.color } : undefined,
          })
          result.push({
            name: `${s.name}（预测）`,
            type: 'bar',
            data: predictedData,
            stack: s.name,
            itemStyle: { color: predictedColor },
          })
        } else if (hasActual) {
          if (isPurePrediction) {
            const predictedColor = toRgba(s.color || primaryColor, 0.4)
            result.push({
              name: `${s.name}（预测）`,
              type: 'bar',
              data,
              itemStyle: { color: predictedColor },
            })
          } else {
            result.push({
              name: s.name,
              type: 'bar',
              data,
              itemStyle: s.color ? { color: s.color } : undefined,
            })
          }
        }
      } else if (chartType === 'line') {
        const dataLen = data.length
        if (boundaryIndex !== undefined && boundaryIndex > 0 && boundaryIndex < dataLen) {
          const actualData = data.map((d, i) => i < boundaryIndex ? d : null)
          const predictedParts = data.map((d, i) => i >= boundaryIndex ? d : null)
          result.push({
            name: `${s.name}（实际）`,
            type: 'line',
            data: actualData,
            smooth: true,
            areaStyle: { opacity: 0.3 },
            lineStyle: { type: 'solid' },
            itemStyle: s.color ? { color: s.color } : undefined,
          })
          result.push({
            name: `${s.name}（预测）`,
            type: 'line',
            data: predictedParts,
            smooth: true,
            lineStyle: { type: 'dashed' },
            itemStyle: s.color ? { color: s.color } : undefined,
          })
        } else if (boundaryIndex === 0) {
          result.push({
            name: s.name,
            type: 'line',
            data,
            smooth: true,
            lineStyle: { type: 'dashed' },
            itemStyle: s.color ? { color: s.color } : undefined,
          })
        } else {
          result.push({
            name: s.name,
            type: 'line',
            data,
            smooth: true,
            areaStyle: { opacity: 0.3 },
            itemStyle: s.color ? { color: s.color } : undefined,
          })
        }
      }
    })

    return result
  }, [validSeriesData, chartType, boundaryIndex, isPurePrediction, primaryColor])

  const hasValidData = validXAxisData.length > 0 && flatSeries.some(s => s.data && s.data.some((d: number | null | undefined) => d != null && d !== 0))

  const option = useMemo(() => ({
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 14, color: tokens.title },
    },
    tooltip: {
      trigger: 'axis' as const,
      ...(chartType === 'bar' ? { axisPointer: { type: 'shadow' as const } } : {}),
      formatter: currencyTooltipFormatter,
    },
    grid: {
      containLabel: true,
      top: title ? 48 : 16,
      bottom: 40,
      ...gridOverride,
    },
    legend: {
      bottom: 8,
      textStyle: { color: tokens.legend },
    },
    xAxis: {
      type: 'category' as const,
      data: validXAxisData,
      axisLine: { lineStyle: { color: tokens.axis } },
      axisLabel: {
        color: tokens.legend,
        hideOverlap: true,
        interval: 'auto',
      },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { formatter: currencyAxisFormatter, color: tokens.legend },
      splitLine: { lineStyle: { color: tokens.splitLine } },
    },
    series: flatSeries,
  }), [title, chartType, gridOverride, validXAxisData, flatSeries, tokens])

  if (loading) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>加载中...</div>
  }

  if (!hasValidData) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Empty description="暂无数据" /></div>
  }

  return <ReactECharts option={option} style={{ height }} notMerge={true} />
}

export default BaseChart