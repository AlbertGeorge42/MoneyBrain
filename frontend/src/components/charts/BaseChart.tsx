import React, { useEffect, useRef } from 'react'
import ReactECharts from 'echarts-for-react'
import { Empty } from 'antd'
import { currencyTooltipFormatter, currencyAxisFormatter } from '../../utils/format'
import { useTheme } from '../../styles/ThemeContext'
import { getTokenValue } from '../../styles/utils'

export interface BaseChartProps {
  title: string
  xAxisData: string[]
  seriesData: Array<{ name: string; data: number[]; color?: string }>
  height?: number
  loading?: boolean
  chartType: 'bar' | 'line'
}

const BaseChart: React.FC<BaseChartProps> = ({ title, xAxisData, seriesData, height = 300, loading = false, chartType }) => {
  const chartRef = useRef<any>(null)
  const { theme } = useTheme()

  const validXAxisData = Array.isArray(xAxisData) ? xAxisData : []
  const validSeriesData = Array.isArray(seriesData) ? seriesData : []

  const hasValidData = validXAxisData.length > 0 && validSeriesData.some(s => s.data && s.data.some(d => d != null && d !== 0))

  const option = {
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 14, color: getTokenValue('--mb-color-text') },
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
      axisLine: { lineStyle: { color: getTokenValue('--mb-color-border') } },
      axisLabel: { color: getTokenValue('--mb-color-neutral') },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { formatter: currencyAxisFormatter, color: getTokenValue('--mb-color-neutral') },
      splitLine: { lineStyle: { color: getTokenValue('--mb-color-border') } },
    },
    series: validSeriesData.map(s => ({
      name: s.name,
      type: chartType,
      data: s.data || [],
      ...(chartType === 'line' ? { smooth: true, areaStyle: { opacity: 0.3 } } : {}),
      itemStyle: s.color ? { color: s.color } : undefined,
    })),
  }

  // 主题变化时刷新图表
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

  return <ReactECharts ref={chartRef} option={option} style={{ height }} />
}

export default BaseChart
