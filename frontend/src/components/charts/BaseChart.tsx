import React from 'react'
import ReactECharts from 'echarts-for-react'
import { Empty } from 'antd'
import { currencyTooltipFormatter, currencyAxisFormatter } from '../../utils/format'

export interface BaseChartProps {
  title: string
  xAxisData: string[]
  seriesData: Array<{ name: string; data: number[]; color?: string }>
  height?: number
  loading?: boolean
  chartType: 'bar' | 'line'
}

const BaseChart: React.FC<BaseChartProps> = ({ title, xAxisData, seriesData, height = 300, loading = false, chartType }) => {
  const validXAxisData = Array.isArray(xAxisData) ? xAxisData : []
  const validSeriesData = Array.isArray(seriesData) ? seriesData : []
  
  const hasValidData = validXAxisData.length > 0 && validSeriesData.some(s => s.data && s.data.some(d => d != null && d !== 0))

  const option = {
    title: { text: title, left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { 
      trigger: 'axis' as const,
      ...(chartType === 'bar' ? { axisPointer: { type: 'shadow' as const } } : {}),
      formatter: currencyTooltipFormatter,
    },
    legend: { top: 'bottom' },
    xAxis: { type: 'category' as const, data: validXAxisData },
    yAxis: { 
      type: 'value' as const, 
      axisLabel: { formatter: currencyAxisFormatter } 
    },
    series: validSeriesData.map(s => ({
      name: s.name,
      type: chartType,
      data: s.data || [],
      ...(chartType === 'line' ? { smooth: true, areaStyle: { opacity: 0.3 } } : {}),
      itemStyle: s.color ? { color: s.color } : undefined,
    })),
  }

  if (loading) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>加载中...</div>
  }

  if (!hasValidData) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Empty description="暂无数据" /></div>
  }

  return <ReactECharts option={option} style={{ height }} />
}

export default BaseChart
