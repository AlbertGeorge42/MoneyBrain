import React from 'react'
import BaseChart from './BaseChart'

interface LineChartProps {
  title: string
  xAxisData: string[]
  seriesData: Array<{ name: string; data: number[]; color?: string }>
  height?: number
}

const LineChart: React.FC<LineChartProps> = (props) => <BaseChart {...props} chartType="line" />

export default LineChart
