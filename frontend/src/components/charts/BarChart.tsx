import React from 'react'
import ReactECharts from 'echarts-for-react'

interface BarChartProps {
  title: string
  xAxisData: string[]
  seriesData: Array<{ name: string; data: number[]; color?: string }>
  height?: number
}

const BarChart: React.FC<BarChartProps> = ({ title, xAxisData, seriesData, height = 300 }) => {
  const option = {
    title: { text: title, left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 'bottom' },
    xAxis: { type: 'category', data: xAxisData },
    yAxis: { type: 'value', axisLabel: { formatter: '¥{value}' } },
    series: seriesData.map(s => ({
      name: s.name,
      type: 'bar',
      data: s.data,
      itemStyle: s.color ? { color: s.color } : undefined,
    })),
  }
  return <ReactECharts option={option} style={{ height }} />
}

export default BarChart
