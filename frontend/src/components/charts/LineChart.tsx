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
    tooltip: { trigger: 'axis' },
    legend: { top: 'bottom' },
    xAxis: { type: 'category', data: xAxisData },
    yAxis: { type: 'value', axisLabel: { formatter: '¥{value}' } },
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
