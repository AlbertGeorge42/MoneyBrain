import React from 'react'
import ReactECharts from 'echarts-for-react'
import { Empty } from 'antd'

interface BarChartProps {
  title: string
  xAxisData: string[]
  seriesData: Array<{ name: string; data: number[]; color?: string }>
  height?: number
  loading?: boolean
}

const BarChart: React.FC<BarChartProps> = ({ title, xAxisData, seriesData, height = 300, loading = false }) => {
  // 数据验证
  const validXAxisData = Array.isArray(xAxisData) ? xAxisData : []
  const validSeriesData = Array.isArray(seriesData) ? seriesData : []
  
  // 检查是否有有效数据
  const hasValidData = validXAxisData.length > 0 && validSeriesData.some(s => s.data && s.data.some(d => d != null && d !== 0))

  const option = {
    title: { text: title, left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { 
      trigger: 'axis', 
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        if (!Array.isArray(params)) return ''
        const category = params[0]?.axisValue || ''
        const lines = params.map((p: any) => {
          const numValue = typeof p.value === 'number' ? p.value : parseFloat(p.value) || 0
          return `${p.marker} ${p.seriesName}: ¥${numValue.toFixed(2)}`
        })
        return [category, ...lines].join('<br/>')
      }
    },
    legend: { top: 'bottom' },
    xAxis: { type: 'category', data: validXAxisData },
    yAxis: { 
      type: 'value', 
      axisLabel: { 
        formatter: (value: number) => `¥${value.toFixed(0)}`
      } 
    },
    series: validSeriesData.map(s => ({
      name: s.name,
      type: 'bar',
      data: s.data || [],
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

export default BarChart
