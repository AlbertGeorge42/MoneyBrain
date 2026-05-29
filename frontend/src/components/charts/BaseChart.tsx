import React, { useEffect, useRef } from 'react'
import ReactECharts from 'echarts-for-react'
import { Empty } from 'antd'
import { currencyTooltipFormatter, currencyAxisFormatter } from '../../utils/format'
import { useTheme } from '../../styles/ThemeContext'
import { getTokenValue } from '../../styles/theme/cssVars'

export interface BaseChartProps {
  title: string
  xAxisData: string[]
  seriesData: Array<{ name: string; data: number[]; predictedData?: number[]; color?: string }>
  height?: number
  loading?: boolean
  chartType: 'bar' | 'line'
  boundaryIndex?: number
  isPurePrediction?: boolean
}

function hexToRgba(hex: string, alpha: number): string {
  if (!hex || hex.length < 7) return `rgba(22, 119, 255, ${alpha})`
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const BaseChart: React.FC<BaseChartProps> = ({ title, xAxisData, seriesData, height = 300, loading = false, chartType, boundaryIndex, isPurePrediction }) => {
  const chartRef = useRef<any>(null)
  const { theme } = useTheme()
  const primaryColor = getTokenValue('--mb-color-action-primary') || '#1677ff'

  const validXAxisData = Array.isArray(xAxisData) ? xAxisData : []
  const validSeriesData = Array.isArray(seriesData) ? seriesData : []

  const flatSeries: Array<{ name: string; type: string; data: (number | null)[]; stack?: string; itemStyle?: object; lineStyle?: object; areaStyle?: object; smooth?: boolean }> = []

  validSeriesData.forEach(s => {
    const data = s.data || []
    const predictedData = s.predictedData || []
    const hasActual = data.some(v => v !== 0)
    const hasPredicted = predictedData.some(v => v !== 0)

    if (chartType === 'bar') {
      if (hasActual && hasPredicted) {
        const predictedColor = hexToRgba(s.color || primaryColor, 0.4)
        flatSeries.push({
          name: `${s.name}（实际）`,
          type: 'bar',
          data,
          stack: s.name,
          itemStyle: s.color ? { color: s.color } : undefined,
        })
        flatSeries.push({
          name: `${s.name}（预测）`,
          type: 'bar',
          data: predictedData,
          stack: s.name,
          itemStyle: { color: predictedColor },
        })
      } else if (hasActual) {
        if (isPurePrediction) {
          const predictedColor = hexToRgba(s.color || primaryColor, 0.4)
          flatSeries.push({
            name: `${s.name}（预测）`,
            type: 'bar',
            data,
            itemStyle: { color: predictedColor },
          })
        } else {
          flatSeries.push({
            name: s.name,
            type: 'bar',
            data,
            itemStyle: s.color ? { color: s.color } : undefined,
          })
        }
      } else if (hasPredicted) {
        flatSeries.push({
          name: s.name,
          type: 'bar',
          data: predictedData,
          itemStyle: s.color ? { color: s.color } : undefined,
        })
      }
    } else if (chartType === 'line') {
      const dataLen = data.length
      if (boundaryIndex !== undefined && boundaryIndex > 0 && boundaryIndex < dataLen) {
        const actualData = data.map((d, i) => i < boundaryIndex ? d : null)
        const predictedParts = data.map((d, i) => i >= boundaryIndex ? d : null)
        flatSeries.push({
          name: `${s.name}（实际）`,
          type: 'line',
          data: actualData,
          smooth: true,
          areaStyle: { opacity: 0.3 },
          lineStyle: { type: 'solid' },
          itemStyle: s.color ? { color: s.color } : undefined,
        })
        flatSeries.push({
          name: `${s.name}（预测）`,
          type: 'line',
          data: predictedParts,
          smooth: true,
          lineStyle: { type: 'dashed' },
          itemStyle: s.color ? { color: s.color } : undefined,
        })
      } else if (boundaryIndex === 0) {
        flatSeries.push({
          name: s.name,
          type: 'line',
          data,
          smooth: true,
          lineStyle: { type: 'dashed' },
          itemStyle: s.color ? { color: s.color } : undefined,
        })
      } else {
        flatSeries.push({
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

  const hasValidData = validXAxisData.length > 0 && flatSeries.some(s => s.data && s.data.some((d: number | null | undefined) => d != null && d !== 0))

  const option = {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 14, color: getTokenValue('--mb-color-text-primary') },
    },
    tooltip: {
      trigger: 'axis' as const,
      ...(chartType === 'bar' ? { axisPointer: { type: 'shadow' as const } } : {}),
      formatter: currencyTooltipFormatter,
    },
    legend: {
      top: 'bottom',
      textStyle: { color: getTokenValue('--mb-color-neutral') },
    },
    xAxis: {
      type: 'category' as const,
      data: validXAxisData,
      axisLine: { lineStyle: { color: getTokenValue('--mb-color-border-subtle') } },
      axisLabel: { color: getTokenValue('--mb-color-neutral') },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { formatter: currencyAxisFormatter, color: getTokenValue('--mb-color-neutral') },
      splitLine: { lineStyle: { color: getTokenValue('--mb-color-border-subtle') } },
    },
    series: flatSeries,
  }

  useEffect(() => {
    if (chartRef.current) {
      const instance = chartRef.current.getEchartsInstance()
      if (instance) {
        instance.resize()
      }
    }
  }, [theme])

  if (loading) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>加载中...</div>
  }

  if (!hasValidData) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Empty description="暂无数据" /></div>
  }

  return <ReactECharts ref={chartRef} option={option} style={{ height }} notMerge={true} />
}

export default BaseChart