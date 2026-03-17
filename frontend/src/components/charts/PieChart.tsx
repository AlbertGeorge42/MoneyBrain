import React from 'react'
import ReactECharts from 'echarts-for-react'
import { Empty } from 'antd'

interface PieChartProps {
  title: string
  data: Array<{ name: string; value: number }>
  height?: number
}

const PieChart: React.FC<PieChartProps> = ({ title, data, height = 300 }) => {
  // 数据验证
  const validData = Array.isArray(data) ? data : []
  
  // 检查是否有有效数据
  const hasValidData = validData.some(d => d.value != null && d.value !== 0)

  const option = {
    title: { text: title, left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { 
      trigger: 'item', 
      formatter: (params: any) => {
        const numValue = typeof params.value === 'number' ? params.value : parseFloat(params.value) || 0
        const value = numValue.toFixed(2)
        const percent = params.percent?.toFixed(1) || '0.0'
        return `${params.name}: ¥${value} (${percent}%)`
      }
    },
    legend: { orient: 'vertical', left: 'left', top: 'middle' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['60%', '50%'],
      data: validData,
      emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' } },
      label: { show: false },
    }],
  }

  if (!hasValidData) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Empty description="暂无数据" /></div>
  }

  return <ReactECharts option={option} style={{ height }} />
}

export default PieChart
