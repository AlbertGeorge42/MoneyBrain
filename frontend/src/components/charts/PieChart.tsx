import React from 'react'
import ReactECharts from 'echarts-for-react'

interface PieChartProps {
  title: string
  data: Array<{ name: string; value: number }>
  height?: number
}

const PieChart: React.FC<PieChartProps> = ({ title, data, height = 300 }) => {
  const option = {
    title: { text: title, left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
    legend: { orient: 'vertical', left: 'left', top: 'middle' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['60%', '50%'],
      data,
      emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' } },
      label: { show: false },
    }],
  }
  return <ReactECharts option={option} style={{ height }} />
}

export default PieChart
