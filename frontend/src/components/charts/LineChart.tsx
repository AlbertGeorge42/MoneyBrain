import React from 'react'
import ReactECharts from 'echarts-for-react'

interface LineChartProps {
  title: string
  xAxisData: string[]
  seriesData: Array<{ name: string; data: number[]; color?: string }>
  height?: number
}

const LineChart: React.FC<LineChartProps> = ({ title, xAxisData, seriesData, height = 300 }) => {
  const option = {
    title: { text: title, left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { 
      trigger: 'axis',
      formatter: (params: any) => {
        if (!Array.isArray(params)) return ''
        const date = params[0]?.axisValue || ''
        const lines = params.map((p: any) => {
          const numValue = typeof p.value === 'number' ? p.value : parseFloat(p.value) || 0
          return `${p.marker} ${p.seriesName}: ¥${numValue.toFixed(2)}`
        })
        return [date, ...lines].join('<br/>')
      }
    },
    legend: { top: 'bottom' },
    xAxis: { type: 'category', data: xAxisData },
    yAxis: { 
      type: 'value', 
      axisLabel: { 
        formatter: (value: number) => `¥${value.toFixed(0)}`
      } 
    },
    series: seriesData.map(s => ({
      name: s.name,
      type: 'line',
      data: s.data,
      smooth: true,
      areaStyle: { opacity: 0.3 },
      itemStyle: s.color ? { color: s.color } : undefined,
    })),
  }
  return <ReactECharts option={option} style={{ height }} />
}

export default LineChart
